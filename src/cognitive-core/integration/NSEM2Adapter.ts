/**
 * NSEM 2.0 适配器
 *
 * 将 NSEMFusionCore 适配为 MemorySearchManager 接口
 * 使 NSEM 可以无缝替换原有记忆系统
 */

import path from "node:path";
import { homedir } from "node:os";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type {
  MemorySearchResult,
  MemorySyncProgressUpdate,
  MemorySearchManager,
  MemoryProviderStatus,
} from "../../memory/types.js";
import type { NsemclawConfig } from "../../config/config.js";
import type { NSEMFusionCore } from "../NSEMFusionCore.js";
import type { MemoryQuery } from "../types/index.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";

const log = createSubsystemLogger("nsem-adapter");

export interface NSEM2AdapterConfig {
  /** 搜索策略 */
  defaultStrategy?: MemoryQuery["strategy"];
  /** 最大结果数 */
  maxResults?: number;
  /** 最小相关度 */
  minRelevance?: number;
  /** 是否包含场信息 */
  includeFieldContext?: boolean;
  /** 是否包含涌现关联 */
  includeEmergentRelations?: boolean;
  /** Agent ID */
  agentId?: string;
  /** Nsemclaw配置 */
  cfg?: NsemclawConfig;
}

/**
 * NSEM 2.0 适配器
 *
 * 实现 MemorySearchManager 接口，包装 NSEMFusionCore
 */
export class NSEM2Adapter implements MemorySearchManager {
  private nsem: NSEMFusionCore;
  private config: NSEM2AdapterConfig;
  private fs: typeof import("node:fs/promises") | null = null;

  constructor(nsem: NSEMFusionCore, config: NSEM2AdapterConfig = {}) {
    this.nsem = nsem;
    this.config = {
      defaultStrategy: "exploratory",
      maxResults: 10,
      minRelevance: 0.2,
      includeFieldContext: true,
      includeEmergentRelations: false,
      ...config,
    };
  }

  /**
   * 搜索记忆 - 核心方法
   */
  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    const maxResults = options?.maxResults ?? this.config.maxResults!;
    const minRelevance = options?.minScore ?? this.config.minRelevance!;

    log.debug(`NSEM搜索: "${query}" (maxResults=${maxResults})`);

    // 调用 NSEM 激活
    const activated = await this.nsem.activate(query, {
      maxResults,
      minScore: minRelevance,
    });

    // 转换为 MemorySearchResult 格式
    return this.toMemorySearchResults(activated);
  }

  /**
   * 读取文件内容
   * 
   * 支持从 Agent workspace 读取文件
   * 路径可以是相对路径（相对于 workspace）或绝对路径
   */
  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    if (!this.fs) {
      this.fs = await import("node:fs/promises");
    }
    
    // 解析路径：如果是相对路径，基于 agent workspace 解析
    let absPath: string;
    if (path.isAbsolute(params.relPath)) {
      absPath = params.relPath;
    } else {
      // 尝试从配置获取 workspace
      const workspaceDir = this.config.agentId && this.config.cfg
        ? resolveAgentWorkspaceDir(this.config.cfg, this.config.agentId)
        : path.join(homedir(), ".nsemclaw");
      absPath = path.resolve(workspaceDir, params.relPath);
    }
    
    // 读取文件内容
    let content: string;
    try {
      content = await this.fs.readFile(absPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { text: "", path: params.relPath };
      }
      throw err;
    }
    
    // 处理行范围（注意：from 参数是 1-based）
    const allLines = content.split("\n");
    const fromLine = Math.max(1, params.from ?? 1);
    const lineCount = params.lines ?? allLines.length;
    const startIndex = fromLine - 1; // 转换为 0-based 索引
    const text = allLines.slice(startIndex, startIndex + lineCount).join("\n");
    
    return { text, path: params.relPath };
  }

  /**
   * 同步文件 - 摄入到NSEM
   * 支持从文件路径或触发重新索引
   */
  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    const reason = params?.reason ?? "unknown";

    // 如果 reason 不是文件路径（如 "cli", "manual" 等），触发重新索引
    if (reason === "cli" || reason === "manual" || reason === "unknown") {
      log.info(`NSEM重新索引 (触发者: ${reason})`);
      
      // 如果是强制重新索引，先摄入 sessions
      if (params?.force && this.config.agentId) {
        await this.ingestSessions(params.progress);
      }
      
      await this.reindex(async (update) => {
        params?.progress?.(update);
      });
      return;
    }

    // 否则当作文件路径处理
    const filePath = reason;
    log.info(`NSEM摄入文件: ${filePath}`);

    // 读取文件内容并摄入
    if (!this.fs) {
      this.fs = await import("node:fs/promises");
    }

    try {
      const content = await this.fs.readFile(filePath, "utf-8");

      // 简单分块摄入
      const chunks = this.splitIntoChunks(content);
      const total = chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        await this.nsem.ingest(chunk.content, {
          type: chunk.type,
          source: filePath,
        });

        params?.progress?.({
          completed: i + 1,
          total,
          label: `Ingesting ${filePath}`,
        });
      }

      log.info(`NSEM摄入完成: ${filePath} (${total} chunks)`);
    } catch (err) {
      log.error(`NSEM摄入失败: ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * 摄入 sessions 目录中的对话历史
   */
  private async ingestSessions(
    progress?: (update: MemorySyncProgressUpdate) => void,
  ): Promise<void> {
    if (!this.config.agentId) {
      log.warn("无法摄入 sessions: agentId 未设置");
      return;
    }

    if (!this.fs) {
      this.fs = await import("node:fs/promises");
    }

    // 动态导入 resolveSessionTranscriptsDirForAgent 以避免循环依赖
    const { resolveSessionTranscriptsDirForAgent } = await import("../../config/sessions/paths.js");
    const sessionsDir = resolveSessionTranscriptsDirForAgent(this.config.agentId);

    log.info(`扫描 sessions 目录: ${sessionsDir}`);

    let sessionFiles: string[] = [];
    try {
      const entries = await this.fs.readdir(sessionsDir, { withFileTypes: true });
      sessionFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => `${sessionsDir}/${entry.name}`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        log.info("sessions 目录不存在，跳过");
        return;
      }
      log.warn(`无法读取 sessions 目录: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    if (sessionFiles.length === 0) {
      log.info("没有找到 session 文件");
      return;
    }

    log.info(`找到 ${sessionFiles.length} 个 session 文件`);

    let totalMessages = 0;
    let processedFiles = 0;

    for (const filePath of sessionFiles) {
      try {
        const content = await this.fs.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        let fileMessages = 0;

        for (const line of lines) {
          if (!line.trim()) continue;
          
          let record: unknown;
          try {
            record = JSON.parse(line);
          } catch {
            continue;
          }

          if (
            !record ||
            typeof record !== "object" ||
            (record as { type?: unknown }).type !== "message"
          ) {
            continue;
          }

          const message = (record as { message?: unknown }).message as
            | { role?: unknown; content?: unknown }
            | undefined;
          if (!message || typeof message.role !== "string") {
            continue;
          }

          // 只摄入用户和助手消息
          if (message.role !== "user" && message.role !== "assistant") {
            continue;
          }

          const text = this.extractSessionText(message.content);
          if (!text || text.length < 20) {
            continue;
          }

          await this.nsem.ingest(text, {
            type: message.role === "user" ? "experience" : "insight",
            source: `session:${path.basename(filePath)}`,
          });

          totalMessages++;
          fileMessages++;
        }

        processedFiles++;
        progress?.({
          completed: processedFiles,
          total: sessionFiles.length,
          label: `Ingesting sessions (${processedFiles}/${sessionFiles.length}): ${fileMessages} messages from ${path.basename(filePath)}`,
        });
      } catch (err) {
        log.warn(`读取 session 文件失败 ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log.info(`Sessions 摄入完成: ${totalMessages} 条消息从 ${processedFiles} 个文件`);
  }

  /**
   * 从 session message content 中提取文本
   */
  private extractSessionText(content: unknown): string | null {
    if (typeof content === "string") {
      return this.normalizeSessionText(content);
    }
    if (!Array.isArray(content)) {
      return null;
    }
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const record = block as { type?: unknown; text?: unknown };
      if (record.type !== "text" || typeof record.text !== "string") {
        continue;
      }
      const normalized = this.normalizeSessionText(record.text);
      if (normalized) {
        parts.push(normalized);
      }
    }
    if (parts.length === 0) {
      return null;
    }
    return parts.join(" ");
  }

  private normalizeSessionText(value: string): string | null {
    const normalized = value
      .replace(/\s*\n+\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized || null;
  }

  /**
   * 重新索引
   */
  async reindex(onProgress?: (update: MemorySyncProgressUpdate) => Promise<void>): Promise<void> {
    log.info("NSEM重新索引 - 触发进化");

    await this.nsem.evolve("all");

    onProgress?.({
      completed: 1,
      total: 1,
      label: "Evolution complete",
    });
  }

  /**
   * 删除记忆
   */
  async delete(filePath: string): Promise<void> {
    log.info(`NSEM删除: ${filePath}`);

    // NSEM中软删除 - 降低相关原子强度
    const atoms = this.nsem.getAtoms();
    for (const [, atom] of atoms) {
      if (atom.spatial?.sourceFile === filePath) {
        // 大幅降低强度
        atom.strength.current *= 0.1;
      }
    }
  }

  /**
   * 获取来源列表
   */
  async sources(): Promise<string[]> {
    const atoms = this.nsem.getAtoms();
    const sources = new Set<string>();

    for (const [, atom] of atoms) {
      if (atom.spatial?.sourceFile) {
        sources.add(atom.spatial.sourceFile);
      }
    }

    return Array.from(sources);
  }

  /**
   * 获取状态
   */
  status(): MemoryProviderStatus {
    const state = this.getEcosystemState();

    const nsemState = state as unknown as {
      stats: { totalAtoms: number; totalFields: number };
      health: { overall: number };
    };
    return {
      provider: "nsem2",
      backend: "builtin",
      atoms: nsemState?.stats.totalAtoms ?? 0,
      fields: nsemState?.stats.totalFields ?? 0,
      health: nsemState?.health.overall ?? 0,
      ready: true,
    } as MemoryProviderStatus;
  }

  /**
   * 探测
   */
  async probe(): Promise<{
    ok: boolean;
    embeddingAvailable: boolean;
    atomCount: number;
    error?: string;
  }> {
    try {
      const nsemWithEmbedding = this.nsem as unknown as { embedding?: { getStatus?: () => { embeddingLoaded?: boolean } } };
      const embeddingStatus = nsemWithEmbedding.embedding?.getStatus?.();
      const state = this.getEcosystemState();

      return {
        ok: true,
        embeddingAvailable: embeddingStatus?.embeddingLoaded ?? false,
        atomCount: state?.stats.totalAtoms ?? 0,
      };
    } catch (err) {
      return {
        ok: false,
        embeddingAvailable: false,
        atomCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * 关闭
   */
  async close(): Promise<void> {
    log.info("NSEM适配器关闭");
    await this.nsem.stop();
  }

  /**
   * 探测嵌入可用性
   */
  async probeEmbeddingAvailability(): Promise<
    import("../../memory/types.js").MemoryEmbeddingProbeResult
  > {
    try {
      const nsemWithEmbedding = this.nsem as unknown as { embedding?: { getStatus?: () => { embeddingLoaded?: boolean } } };
      const embeddingStatus = nsemWithEmbedding.embedding?.getStatus?.();
      return {
        ok: embeddingStatus?.embeddingLoaded ?? false,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * 探测向量可用性
   */
  async probeVectorAvailability(): Promise<boolean> {
    // VectorStorage 没有 status 方法，通过检查实例存在性判断
    return this.nsem["vectorStorage"] !== undefined;
  }

  /**
   * NSEM特有：摄入对话消息
   */
  async ingestConversationMessage(message: {
    role: string;
    content: string;
    timestamp?: number;
  }): Promise<void> {
    // 只摄入用户和助手消息
    if (message.role !== "user" && message.role !== "assistant") {
      return;
    }

    // 过滤太短的消息
    if (message.content.length < 20) {
      return;
    }

    await this.nsem.ingest(message.content, {
      type: message.role === "user" ? "experience" : "insight",
      source: "conversation",
    });
  }

  /**
   * NSEM特有：获取生态状态
   */
  getEcosystemState() {
    // 通过私有访问或添加公共方法
    return (this.nsem as any).getState?.();
  }

  /**
   * NSEM特有：手动触发进化
   */
  async evolve(): Promise<void> {
    await this.nsem.evolve("all");
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private toMemorySearchResults(activated: import("../NSEMFusionCore.js").FusionMemoryItem[]): MemorySearchResult[] {
    return activated.map((item) => ({
      path: item.metadata.source || `nsem://${item.id.slice(0, 8)}`,
      source: "nsem" as any,
      snippet: item.content.l1_overview.slice(0, 200),
      score: item.importance,
      startLine: 0,
      endLine: item.content.l1_overview.split("\n").length,
      metadata: {
        nsemAtomId: item.id,
        nsemAtomType: item.category,
      },
    }));
  }

  private splitIntoChunks(content: string): Array<{ content: string; type: any }> {
    // 简单实现：按段落分割
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 50);

    if (paragraphs.length === 0) {
      // 如果段落太少，整个文件作为一个chunk
      return [{ content, type: "fact" }];
    }

    return paragraphs.map((p) => ({
      content: p,
      type: this.inferContentType(p),
    }));
  }

  private inferContentType(content: string): any {
    const lower = content.toLowerCase();

    if (lower.includes("代码") || lower.includes("function") || lower.includes("class")) {
      return "fact";
    }
    if (lower.includes("学习") || lower.includes("尝试") || lower.includes("经验")) {
      return "experience";
    }
    if (lower.includes("发现") || lower.includes("意识到") || lower.includes("总结")) {
      return "insight";
    }
    if (lower.includes("模式") || lower.includes("规律") || lower.includes("总是")) {
      return "pattern";
    }

    return "fact";
  }
}
