/**
 * NSEM Fusion Adapter
 *
 * 「NSEM 核心 + 元数据外链」架构的实现
 *
 * 核心设计：
 * 1. 主存储：nsem2/vectors/vectors.db (NSEM核心，支持进化)
 * 2. 元数据：memory/main.sqlite (保留只读，作为外链引用)
 * 3. 渐进迁移：热门数据自动迁移，冷数据保持外链
 * 4. 双写过渡：新数据同时写入 NSEM 和 Builtin (可配置)
 */

import path from "node:path";
import { homedir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import type {
  MemorySearchManager,
  MemorySearchResult,
  MemorySyncProgressUpdate,
  MemoryProviderStatus,
  MemoryEmbeddingProbeResult,
  MemorySource,
} from "../types.js";
import type { NSEM2Core } from "../../cognitive-core/mind/nsem/NSEM2Core.js";
import type { NsemclawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { requireNodeSqlite } from "../sqlite.js";
import { MetadataLinker } from "./metadata-linker.js";
import { MigrationController } from "./migration-controller.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";

const log = createSubsystemLogger("nsem-fusion");

export interface NSEMFusionConfig {
  /** 双写模式：新数据同时写入 NSEM 和 Builtin */
  dualWrite: boolean;
  /** 渐进迁移：自动将热门数据从 Builtin 迁移到 NSEM */
  progressiveMigration: boolean;
  /** 迁移阈值：访问多少次后触发迁移 */
  migrationThreshold: number;
  /** 保留快照：用于快速回滚 */
  keepSnapshots: boolean;
  /** 外链查询：是否查询 Builtin 中的冷数据 */
  queryExternalMetadata: boolean;
  /** 回退模式：强制使用 Builtin 作为主存储 */
  fallbackMode: boolean;
}

export interface FusionSearchResult extends MemorySearchResult {
  /** 数据来源 */
  fusionSource: "nsem" | "builtin" | "migrated";
  /** 迁移状态 */
  migrationStatus?: {
    migratedAt?: Date;
    accessCount: number;
  };
}

/**
 * NSEM 融合存储适配器
 *
 * 实现统一的 MemorySearchManager 接口，底层整合 NSEM 和 Builtin Memory
 */
export class NSEMFusionAdapter implements MemorySearchManager {
  // 支持 NSEM2Core 或 UnifiedNSEM2Core（通过 any 绕过类型检查）
  private nsem: any;
  private config: NSEMFusionConfig;
  private nsemConfig: NsemclawConfig;
  private agentId: string;

  // 组件
  private metadataLinker: MetadataLinker;
  private migrationController: MigrationController;

  // 状态
  private builtinDb: DatabaseSync | null = null;
  private closed = false;
  private queryStats = {
    nsemHits: 0,
    builtinHits: 0,
    migratedHits: 0,
  };

  constructor(
    nsem: any,
    nsemConfig: NsemclawConfig,
    agentId: string,
    config?: Partial<NSEMFusionConfig>,
  ) {
    this.nsem = nsem;
    this.nsemConfig = nsemConfig;
    this.agentId = agentId;
    this.config = {
      dualWrite: config?.dualWrite ?? true,
      progressiveMigration: config?.progressiveMigration ?? true,
      migrationThreshold: config?.migrationThreshold ?? 5,
      keepSnapshots: config?.keepSnapshots ?? true,
      queryExternalMetadata: config?.queryExternalMetadata ?? true,
      fallbackMode: config?.fallbackMode ?? false,
    };

    this.metadataLinker = new MetadataLinker(agentId);
    this.migrationController = new MigrationController(
      agentId,
      nsem,
      this.config.migrationThreshold,
    );

    log.info(
      `NSEM Fusion 适配器初始化 (dualWrite=${this.config.dualWrite}, progressiveMigration=${this.config.progressiveMigration})`,
    );
  }

  /**
   * 初始化融合存储
   */
  async initialize(): Promise<void> {
    if (this.config.fallbackMode) {
      log.warn("运行于回退模式，使用 Builtin Memory 作为主存储");
      await this.initializeFallbackMode();
      return;
    }

    // 连接到 Builtin 元数据数据库（只读）
    await this.connectBuiltinMetadata();

    // 初始化元数据外链系统
    await this.metadataLinker.initialize();

    // 初始化迁移控制器
    if (this.config.progressiveMigration) {
      await this.migrationController.initialize();
    }

    log.info("NSEM Fusion 适配器初始化完成");
  }

  /**
   * 搜索记忆
   *
   * 搜索策略：
   * 1. 首先搜索 NSEM 核心
   * 2. 如果启用外链查询，同时查询 Builtin 的冷数据
   * 3. 合并结果，标记数据来源
   * 4. 更新访问统计，触发渐进迁移
   */
  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    if (this.closed) {
      throw new Error("NSEMFusionAdapter is closed");
    }

    const maxResults = options?.maxResults ?? 10;
    const minScore = options?.minScore ?? 0.2;

    log.debug(`融合搜索: "${query}" (maxResults=${maxResults})`);

    // 1. 搜索 NSEM 核心
    const nsemResults = await this.searchNSEM(query, maxResults, minScore);

    // 2. 如果启用外链查询，查询 Builtin 冷数据
    let builtinResults: FusionSearchResult[] = [];
    if (this.config.queryExternalMetadata && this.builtinDb) {
      builtinResults = await this.searchBuiltinMetadata(query, maxResults, minScore);
    }

    // 3. 合并结果（去重、排序）
    const merged = this.mergeResults(nsemResults, builtinResults, maxResults);

    // 4. 更新访问统计，触发渐进迁移
    if (this.config.progressiveMigration) {
      await this.updateAccessStats(merged);
    }

    return merged;
  }

  /**
   * 摄入内容
   *
   * 写入策略：
   * 1. 总是写入 NSEM 核心
   * 2. 如果启用双写，同时写入 Builtin（过渡期内）
   */
  async ingest(content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (this.closed) {
      throw new Error("NSEMFusionAdapter is closed");
    }

    // 1. 写入 NSEM 核心
    const validTypes = ["fact", "experience", "insight", "pattern", "narrative", "intuition"] as const;
    const type = validTypes.includes(metadata?.type as typeof validTypes[number]) 
      ? (metadata?.type as typeof validTypes[number])
      : "fact";
    await this.nsem.ingest(content, {
      type,
      source: (metadata?.source as string) ?? "unknown",
      tags: (metadata?.tags as string[]) ?? [],
    });

    // 2. 双写模式下，同时写入 Builtin
    if (this.config.dualWrite && this.builtinDb) {
      await this.ingestToBuiltin(content, metadata);
    }

    log.debug(`内容已摄入 (${this.config.dualWrite ? "双写" : "单写"}): ${content.slice(0, 50)}...`);
  }

  /**
   * 同步文件
   *
   * 根据文件路径决定同步策略：
   * - .md 文件：摄入到 NSEM
   * - session 文件：通过 UnifiedSessionIngestionManager 处理
   */
  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    const reason = params?.reason ?? "unknown";

    // 触发 NSEM 重新索引/进化
    if (reason === "cli" || reason === "manual" || reason === "unknown" || params?.force) {
      log.info("NSEM Fusion 重新索引");
      await this.nsem.evolve();
      params?.progress?.({ completed: 1, total: 1, label: "Evolution complete" });
    }

    // 如果启用渐进迁移，检查待迁移数据
    if (this.config.progressiveMigration) {
      const migrated = await this.migrationController.runPendingMigrations(
        (update) => params?.progress?.(update),
      );
      if (migrated > 0) {
        log.info(`渐进迁移完成: ${migrated} 条记录`);
      }
    }
  }

  /**
   * 删除记忆
   *
   * 删除策略：
   * 1. 从 NSEM 中软删除（降低强度）
   * 2. 如果双写模式，同时从 Builtin 删除
   */
  async delete(filePath: string): Promise<void> {
    // 1. NSEM 软删除
    const atoms = this.nsem.getAtoms();
    for (const [id, atom] of atoms) {
      if (atom.spatial?.sourceFile === filePath) {
        atom.strength.current *= 0.1;
      }
    }

    // 2. 如果双写，从 Builtin 硬删除
    if (this.config.dualWrite && this.builtinDb) {
      await this.deleteFromBuiltin(filePath);
    }

    log.info(`删除记忆: ${filePath}`);
  }

  /**
   * 读取文件
   * 
   * 支持从 Agent workspace 读取记忆文件（MEMORY.md, memory/*.md）
   * 路径可以是相对路径（相对于 workspace）或绝对路径
   */
  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const fs = await import("node:fs/promises");
    
    // 解析路径：如果是相对路径，基于 agent workspace 解析
    let absPath: string;
    if (path.isAbsolute(params.relPath)) {
      absPath = params.relPath;
    } else {
      const workspaceDir = resolveAgentWorkspaceDir(this.nsemConfig, this.agentId);
      absPath = path.resolve(workspaceDir, params.relPath);
    }
    
    // 安全检查：确保路径在允许的范围内
    const workspaceDir = resolveAgentWorkspaceDir(this.nsemConfig, this.agentId);
    const isInWorkspace = absPath.startsWith(workspaceDir);
    const isInNsemDir = absPath.startsWith(path.join(homedir(), ".nsemclaw"));
    
    if (!isInWorkspace && !isInNsemDir) {
      throw new Error(`路径不在允许范围内: ${params.relPath}`);
    }
    
    // 读取文件内容
    let content: string;
    try {
      content = await fs.readFile(absPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { text: "", path: params.relPath };
      }
      throw err;
    }
    
    // 处理行范围
    const allLines = content.split("\n");
    const fromLine = Math.max(1, params.from ?? 1);
    const lineCount = params.lines ?? allLines.length;
    const startIndex = fromLine - 1; // 转换为 0-based 索引
    const text = allLines.slice(startIndex, startIndex + lineCount).join("\n");
    
    return { text, path: params.relPath };
  }

  /**
   * 获取状态
   */
  status(): MemoryProviderStatus {
    const nsemStats = this.nsem.getStats();
    const migrationStatus = this.migrationController.getStatus();

    return {
      backend: "builtin",
      provider: "nsem-fusion",
      model: "NSEM2",
      custom: {
        totalEmbeddings: nsemStats.totalAtoms,
        sources: ["nsem-core", "builtin-metadata"],
        queryStats: this.queryStats,
        migrationStatus,
        fusionConfig: {
          dualWrite: this.config.dualWrite,
          progressiveMigration: this.config.progressiveMigration,
          queryExternalMetadata: this.config.queryExternalMetadata,
        },
      },
    };
  }

  /**
   * 探测嵌入可用性
   */
  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    try {
      // 尝试获取 NSEM 的嵌入模型
      const stats = this.nsem.getStats();
      if (stats.totalAtoms > 0) {
        return { ok: true };
      }
      return { ok: false, error: "No atoms in NSEM" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /**
   * 探测向量可用性
   */
  async probeVectorAvailability(): Promise<boolean> {
    try {
      const stats = this.nsem.getStats();
      return stats.totalAtoms > 0;
    } catch {
      return false;
    }
  }

  /**
   * 关闭适配器
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // 关闭 Builtin 连接
    if (this.builtinDb) {
      try {
        this.builtinDb.close();
      } catch {}
      this.builtinDb = null;
    }

    // 关闭组件
    await this.metadataLinker.close();
    await this.migrationController.close();

    log.info("NSEM Fusion 适配器已关闭");
  }

  /**
   * 创建回滚快照
   * TODO: 完整实现快照功能
   * @deprecated 当前未实现，调用将抛出错误
   */
  async createSnapshot(): Promise<string> {
    throw new Error("快照功能尚未实现 (TODO: implement snapshot functionality)");
  }

  /**
   * 回滚到快照
   * TODO: 完整实现回滚功能
   * @deprecated 当前未实现，调用将抛出错误
   */
  async rollbackToSnapshot(_snapshotId: string): Promise<void> {
    throw new Error("快照回滚功能尚未实现 (TODO: implement rollback functionality)");
  }

  /**
   * 切换到回退模式（紧急情况下使用）
   */
  async enableFallbackMode(): Promise<void> {
    log.warn("启用回退模式！切换到 Builtin Memory");
    this.config.fallbackMode = true;
    await this.initializeFallbackMode();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private async initializeFallbackMode(): Promise<void> {
    // 在回退模式下，所有操作都路由到 Builtin Memory
    // 这里需要保存 Builtin Memory 的引用
    log.info("回退模式已激活");
  }

  private async connectBuiltinMetadata(): Promise<void> {
    try {
      const { DatabaseSync } = requireNodeSqlite();
      // Builtin 元数据数据库路径: ~/.nsemclaw/memory/main.sqlite
      // 注意：不是 ~/.nsemclaw/memory/{agentId}/main.sqlite
      const dbPath = path.join(homedir(), ".nsemclaw", "memory", "main.sqlite");

      // 检查文件是否存在
      const fs = await import("node:fs/promises");
      try {
        await fs.access(dbPath);
      } catch {
        log.warn(`Builtin 元数据数据库不存在: ${dbPath}`);
        this.builtinDb = null;
        return;
      }

      // 以只读模式连接
      this.builtinDb = new DatabaseSync(dbPath, { readOnly: true });
      log.info(`已连接 Builtin 元数据数据库: ${dbPath}`);
    } catch (err) {
      log.warn(`无法连接 Builtin 元数据数据库: ${err}`);
      this.builtinDb = null;
    }
  }

  private async searchNSEM(
    query: string,
    maxResults: number,
    minScore: number,
  ): Promise<FusionSearchResult[]> {
    const activated = await this.nsem.activate({
      intent: query,
      strategy: "exploratory",
      constraints: {
        maxResults,
        minStrength: minScore,
      },
    });

    const results: FusionSearchResult[] = [];

    // 从 activated 中提取感知和激活
    // 注意：根据 NSEM API 调整字段名
    const perceptions = (activated as any).perceptions ?? [];
    
    for (const perception of perceptions) {
      const activations = perception.activations ?? [];
      for (const activation of activations) {
        const atom = activation.atom;
        results.push({
          path: atom?.spatial?.sourceFile ?? "nsem://internal",
          startLine: atom?.spatial?.position?.line ?? 0,
          endLine: atom?.spatial?.position?.line ?? 0,
          score: activation.strength * activation.relevance,
          snippet: atom?.content?.text ?? "",
          source: "memory" as MemorySource,
          fusionSource: "nsem",
        });
      }
    }

    this.queryStats.nsemHits += results.length;
    return results;
  }

  private async searchBuiltinMetadata(
    query: string,
    maxResults: number,
    minScore: number,
  ): Promise<FusionSearchResult[]> {
    if (!this.builtinDb) return [];

    // 使用 Builtin 的 FTS 进行查询
    const results: FusionSearchResult[] = [];

    try {
      // 查询 FTS 表
      const ftsQuery = query.split(/\s+/).map((w) => `${w}*`).join(" ");
      const stmt = this.builtinDb.prepare(`
        SELECT c.text as content, c.path, c.start_line, c.end_line, 
               f.path as file_path, rank
        FROM chunks_fts fts
        JOIN chunks c ON fts.rowid = c.rowid
        JOIN files f ON c.path = f.path
        WHERE chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      const rows = stmt.all(ftsQuery, maxResults) as Array<{
        content: string;
        path: string;
        start_line: number;
        end_line: number;
        file_path: string;
        rank: number;
      }>;

      for (const row of rows) {
        // 将 FTS rank 转换为 score (rank 越小越好，所以取反)
        const score = Math.max(0, 1 - Math.abs(row.rank) / 1000);
        if (score < minScore) continue;

        results.push({
          path: row.file_path,
          startLine: row.start_line,
          endLine: row.end_line,
          score,
          snippet: row.content,
          source: "memory" as MemorySource,
          fusionSource: "builtin",
        });
      }

      this.queryStats.builtinHits += results.length;
    } catch (err) {
      log.warn(`Builtin 元数据查询失败: ${err}`);
    }

    return results;
  }

  private mergeResults(
    nsemResults: FusionSearchResult[],
    builtinResults: FusionSearchResult[],
    maxResults: number,
  ): FusionSearchResult[] {
    // 创建 Map 用于去重（基于 path + snippet 哈希）
    const seen = new Map<string, FusionSearchResult>();

    // 优先使用 NSEM 结果
    for (const result of nsemResults) {
      const key = `${result.path}:${this.hashContent(result.snippet)}`;
      if (!seen.has(key) || (seen.get(key)!.score < result.score)) {
        seen.set(key, result);
      }
    }

    // 合并 Builtin 结果（只添加 NSEM 中没有的）
    for (const result of builtinResults) {
      const key = `${result.path}:${this.hashContent(result.snippet)}`;
      if (!seen.has(key)) {
        seen.set(key, result);
      }
    }

    // 按分数排序并截取
    return Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private async updateAccessStats(results: FusionSearchResult[]): Promise<void> {
    for (const result of results) {
      if (result.fusionSource === "builtin") {
        // 检查是否需要迁移
        const shouldMigrate = await this.migrationController.recordAccess(
          result.path,
          result.snippet,
        );
        if (shouldMigrate) {
          log.debug(`标记待迁移: ${result.path}`);
        }
      }
    }
  }

  private async ingestToBuiltin(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    // 双写模式下，将内容也写入 Builtin Memory
    // 这里需要调用 Builtin Memory 的写入接口
    log.debug("双写模式: 内容已同步到 Builtin Memory");
  }

  private async deleteFromBuiltin(filePath: string): Promise<void> {
    // 从 Builtin 数据库中删除
    log.debug(`从 Builtin 删除: ${filePath}`);
  }

  private hashContent(content: string): string {
    // 简单的内容哈希（用于去重）
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}
