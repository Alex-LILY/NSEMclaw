/**
 * NSEM 适配器 - 无缝集成到 Nsemclaw 现有记忆系统
 *
 * 设计目标:
 * 1. 完全兼容: 实现 MemorySearchManager 接口
 * 2. 渐进启用: 配置控制，可随时开关
 * 3. 双向同步: SQLite ↔ NSEM 实时同步
 * 4. 零侵入: 现有代码无需修改
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type {
  MemorySearchResult,
  MemorySyncProgressUpdate,
  MemorySearchManager,
  MemorySource,
} from "../../memory/types.js";
import { getMemoryEcosystem, type MemoryEcosystem } from "../memory/index.js";

// 兼容类型断言
type AnyEcosystem = MemoryEcosystem & Record<string, unknown>;
import type { MemoryQuery, ActivatedMemory } from "../memory/index.js";

const log = createSubsystemLogger("nsem-adapter");

export interface NSEMAdapterConfig {
  /** 是否启用NSEM增强 */
  enabled: boolean;

  /** 神经搜索权重 (0-1) */
  neuralSearchWeight: number;

  /** 传统搜索权重 (0-1) */
  traditionalSearchWeight: number;

  /** 自动进化间隔 (分钟, 0=禁用) */
  autoEvolveIntervalMinutes: number;

  /** 是否将对话摄入为记忆 */
  ingestConversations: boolean;

  /** 会话记忆摄入配置 */
  conversationIngest: {
    /** 摄入消息角色 */
    roles: Array<"user" | "assistant" | "system">;
    /** 最小消息长度 */
    minLength: number;
    /** 摄入间隔 (消息数) */
    batchSize: number;
  };

  /** 搜索结果增强 */
  resultEnhancement: {
    /** 包含涌现关联 */
    includeEmergentRelations: boolean;
    /** 包含场信息 */
    includeFieldContext: boolean;
    /** 关联深度 */
    associationDepth: number;
  };
}

export const DEFAULT_NSEM_ADAPTER_CONFIG: NSEMAdapterConfig = {
  enabled: false, // 默认关闭，需要显式开启
  neuralSearchWeight: 0.7,
  traditionalSearchWeight: 0.3,
  autoEvolveIntervalMinutes: 60,
  ingestConversations: true,
  conversationIngest: {
    roles: ["user", "assistant"],
    minLength: 20,
    batchSize: 5,
  },
  resultEnhancement: {
    includeEmergentRelations: true,
    includeFieldContext: true,
    associationDepth: 2,
  },
};

/**
 * NSEM 包装器 - 增强现有 MemorySearchManager
 */
export class NSEMWrapper {
  private baseManager: MemorySearchManager;
  private ecosystem: MemoryEcosystem;
  private config: NSEMAdapterConfig;
  private agentId: string;

  // 消息摄入缓冲
  private messageBuffer: Array<{ role: string; content: string; timestamp: number }> = [];
  private evolveTimer?: NodeJS.Timeout;
  private closed = false;

  constructor(
    baseManager: MemorySearchManager,
    agentId: string,
    config?: Partial<NSEMAdapterConfig>,
  ) {
    this.baseManager = baseManager;
    this.agentId = agentId;
    this.config = { ...DEFAULT_NSEM_ADAPTER_CONFIG, ...config };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ecosystem = getMemoryEcosystem({
      syncStrategy: "bidirectional",
    }) as AnyEcosystem;

    if (this.config.enabled) {
      this.initialize();
    }
  }

  // ========================================================================
  // 初始化
  // ========================================================================

  private initialize(): void {
    log.info(`NSEM 初始化 (agent: ${this.agentId})`);

    // 启动生态 (如果方法存在)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.ecosystem as any).start?.();

    // 从现有记忆摄入初始数据
    this.ingestExistingMemory();

    // 启动自动进化
    if (this.config.autoEvolveIntervalMinutes > 0) {
      this.evolveTimer = setInterval(
        () => this.evolve(),
        this.config.autoEvolveIntervalMinutes * 60 * 1000,
      );
    }
  }

  // ========================================================================
  // 代理方法 - 增强原有功能
  // ========================================================================

  /**
   * 增强搜索 - 混合传统搜索 + 神经激活
   */
  async search(query: string, _options?: { signal?: AbortSignal }): Promise<MemorySearchResult[]> {
    if (!this.config.enabled || this.closed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return this.baseManager.search(query);
    }

    // 并行执行两种搜索
    const [traditionalResults, neuralResults] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.baseManager.search(query).catch(() => [] as MemorySearchResult[]),
      this.neuralSearch(query),
    ]);

    // 合并结果
    return this.mergeResults(traditionalResults, neuralResults);
  }

  /**
   * 同步文件 - 摄入到NSEM
   */
  async sync(
    filePath: string,
    onProgress?: (update: MemorySyncProgressUpdate) => void,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    // 先执行基础同步 (如果方法存在)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.baseManager as any).sync?.(filePath, onProgress, options);

    if (!this.config.enabled || this.closed) return;

    // 摄入到NSEM (后台异步) - 使用类型断言访问可能不存在的方法
    if (filePath.endsWith(".md") || filePath.endsWith(".qmd")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.ecosystem as any)
        .importFromMarkdown?.({
          filePath,
          parseStrategy: "section",
          watch: false,
          agent: this.agentId,
        })
        .catch((err: Error) => {
          log.error(`NSEM摄入失败: ${filePath} - ${err.message}`);
        });
    }
  }

  /**
   * 重新索引
   */
  async reindex(onProgress?: (update: MemorySyncProgressUpdate) => void): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.baseManager as any).reindex?.(onProgress);

    if (!this.config.enabled || this.closed) return;

    // 重新同步 - 使用类型断言访问可能不存在的方法
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.ecosystem as any)
      .syncAllMarkdown?.()
      .then((result: { imported: number }) => {
        log.info(`NSEM重新索引: ${result.imported} 导入`);
      })
      .catch(console.error);
  }

  /**
   * 删除记忆
   */
  async delete(filePath: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.baseManager as any).delete?.(filePath);

    if (!this.config.enabled || this.closed) return;

    // NSEM中软删除 - 使用类型断言
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const atoms = (this.ecosystem as any).getAtoms?.() as Map<string, { spatial: { sourceFile?: string }; strength: { current: number } }> | undefined;
    if (atoms) {
      for (const [_id, atom] of atoms) {
        if (atom.spatial.sourceFile === filePath) {
          // 降低强度而非删除
          atom.strength.current *= 0.1;
        }
      }
    }
  }

  /**
   * 获取来源列表
   */
  async sources(): Promise<string[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.baseManager as any).sources?.() ?? [];
  }

  /**
   * 获取状态
   */
  async status() {
    return this.baseManager.status();
  }

  /**
   * 探测
   */
  async probe(): Promise<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.baseManager as any).probe?.();
  }

  /**
   * 关闭
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // 清理定时器
    if (this.evolveTimer) {
      clearInterval(this.evolveTimer);
    }

    // 刷新缓冲
    await this.flushMessageBuffer();

    // 关闭生态 (如果方法存在)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.ecosystem as any).stop?.();

    // 关闭基础管理器 (如果方法存在)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.baseManager as any).close?.();
  }

  // ========================================================================
  // NSEM 特有功能
  // ========================================================================

  /**
   * 摄入对话消息
   */
  async ingestConversationMessage(message: {
    role: string;
    content: string;
    timestamp?: number;
  }): Promise<void> {
    if (!this.config.enabled || !this.config.ingestConversations || this.closed) return;

    const { roles, minLength } = this.config.conversationIngest;

    if (!roles.includes(message.role as any)) return;
    if (message.content.length < minLength) return;

    this.messageBuffer.push({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || Date.now(),
    });

    if (this.messageBuffer.length >= this.config.conversationIngest.batchSize) {
      await this.flushMessageBuffer();
    }
  }

  /**
   * 手动触发进化
   */
  async evolve(): Promise<void> {
    if (!this.config.enabled || this.closed) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = await (this.ecosystem as any).evolve?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log.info(`NSEM进化完成: 健康度 ${((state?.health?.overall as number) * 100).toFixed(1)}%`);
  }

  /**
   * 获取NSEM状态
   */
  getEcosystemState() {
    if (!this.config.enabled || this.closed) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.ecosystem as any).getState?.();
  }

  /**
   * 联想搜索
   */
  async associativeSearch(
    query: string,
    count: number = 5,
  ): Promise<Array<{ content: string; confidence: number }>> {
    if (!this.config.enabled || this.closed) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const embedding = await (this.ecosystem as any)["embedding"]?.embed?.(query);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seeds = await (this.ecosystem as any).getQueryEngine?.()?.findSimilar?.(embedding, 3) ?? [];

    if (seeds.length === 0) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const associations = await (this.ecosystem as any).getQueryEngine?.()?.generateAssociations?.(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seeds.map((s: any) => s.atom.id),
      count,
    ) ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return associations.map((a: any) => ({
      content: a.content as string,
      confidence: a.confidence as number,
    }));
  }

  /**
   * 获取原始生态 (高级使用)
   */
  getEcosystem(): MemoryEcosystem | null {
    return this.config.enabled ? this.ecosystem : null;
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private async ingestExistingMemory(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.ecosystem as any).syncAllMarkdown?.();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      log.info(`NSEM初始同步: ${result?.imported} 导入, ${result?.updated} 更新`);
    } catch (err) {
      log.error(`初始同步失败: ${String(err)}`);
    }
  }

  private async flushMessageBuffer(): Promise<void> {
    if (this.messageBuffer.length === 0) return;

    for (const msg of this.messageBuffer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.ecosystem as any).ingest?.(msg.content, {
        type: msg.role === "user" ? "experience" : "insight",
        agent: this.agentId,
        source: "conversation",
      });
    }

    log.debug(`摄入 ${this.messageBuffer.length} 条对话消息`, { count: this.messageBuffer.length });
    this.messageBuffer = [];
  }

  private async safeLogError(message: string, error: unknown): Promise<void> {
    log.error(`${message}: ${String(error)}`);
  }

  private async neuralSearch(query: string): Promise<MemorySearchResult[]> {
    const strategy = this.inferStrategy(query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activated: ActivatedMemory = await (this.ecosystem as any).activate?.({
      intent: query,
      strategy,
      constraints: {
        maxResults: 10,
        minStrength: 0.2,
      },
    }) ?? { atoms: [] };

    return this.activatedToResults(activated);
  }

  private inferStrategy(query: string): MemoryQuery["strategy"] {
    const lower = query.toLowerCase();

    if (lower.includes("?") || lower.startsWith("什么") || lower.startsWith("how")) {
      return "precise";
    }
    if (lower.includes("类似") || lower.includes("相关") || lower.includes("similar")) {
      return "associative";
    }
    if (lower.includes("想法") || lower.includes("创意") || lower.includes("idea")) {
      return "creative";
    }

    return "exploratory";
  }

  private mergeResults(
    traditional: MemorySearchResult[],
    neural: MemorySearchResult[],
  ): MemorySearchResult[] {
    const { traditionalSearchWeight, neuralSearchWeight } = this.config;

    const maxTraditional = Math.max(...traditional.map((r) => r.score), 0.01);
    const maxNeural = Math.max(...neural.map((r) => r.score), 0.01);

    const merged = new Map<string, MemorySearchResult & { combinedScore: number }>();

    for (const r of traditional) {
      const normalizedScore = r.score / maxTraditional;
      merged.set(r.path, {
        ...r,
        score: normalizedScore,
        combinedScore: normalizedScore * traditionalSearchWeight,
      });
    }

    for (const r of neural) {
      const normalizedScore = r.score / maxNeural;
      const existing = merged.get(r.path);

      if (existing) {
        existing.combinedScore += normalizedScore * neuralSearchWeight;
        existing.score = existing.combinedScore;
        if (r.snippet.length > existing.snippet.length) {
          existing.snippet = r.snippet;
        }
      } else {
        merged.set(r.path, {
          ...r,
          score: normalizedScore * neuralSearchWeight,
          combinedScore: normalizedScore * neuralSearchWeight,
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 10)
      .map(({ combinedScore, ...rest }) => rest);
  }

  private activatedToResults(activated: ActivatedMemory): MemorySearchResult[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return activated.atoms.map((item) => ({
      path: (item.atom.spatial as any).sourceFile || `nsem://${item.atom.id.slice(0, 8)}`,
      source: "nsem" as MemorySource,
      snippet: item.atom.content.slice(0, 200),
      score: item.relevance,
      startLine: 0,
      endLine: 0,
    }));
  }
}

/**
 * 创建带NSEM增强的MemorySearchManager
 */
export function wrapWithNSEM(
  baseManager: MemorySearchManager,
  agentId: string,
  config?: Partial<NSEMAdapterConfig>,
): NSEMWrapper {
  return new NSEMWrapper(baseManager, agentId, config);
}
