/**
 * Unified NSEM2 Core - 统一记忆核心
 *
 * 融合组件:
 * - NSEM2Core (基础核心)
 * - IntegratedNSEM2Core (集成增强)
 * - ThreeTierMemoryStore (三层存储语义)
 * - PersistentSelectiveMemoryInheritance (作用域管理)
 *
 * 新增功能:
 * - 批量加载接口
 * - 异步写入队列
 * - 动态模型加载决策 (P1)
 * - 读写锁分离 (P1)
 * - 系统资源自动检测 (P1)
 * - 对话结束自动摄入 (P2)
 * - 重要信息识别 (P2)
 * - 定期整理任务 (P2)
 * - GPU加速搜索 (P3)
 * - HNSW索引 (P3)
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir, totalmem, freemem, loadavg, cpus } from "node:os";
import { join } from "node:path";
import type { ResolvedMemorySearchConfig } from "../../../agents/memory-search.js";
import type { NsemclawConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import {
  getVectorStorage,
  releaseVectorStorage,
  type VectorStorage,
  type VectorSearchResult,
} from "../../storage/VectorStorage.js";
import type {
  MemAtom,
  LivingEdge,
  MemoryField,
  MemoryQuery,
  ActivatedMemory,
  NSEM2Config,
  ContentType,
  QueryStrategy,
  Vector,
} from "../../types/index.js";
import {
  LRUCache,
  cosineSimilarity,
  embeddingDistance,
  hash,
  generateId,
  getMemoryStats,
  isMemoryOverThreshold,
  formatBytes,
  clamp,
  exponentialDecay,
} from "../../utils/common.js";
import {
  createSmartEmbeddingEngine,
  SmartEmbeddingEngine,
} from "../perception/SmartEmbeddingEngine.js";

const log = createSubsystemLogger("nsem2-unified");

// ============================================================================
// 类型定义
// ============================================================================

/** 记忆作用域 */
export type MemoryScope = "personal" | "shared" | "inherited" | "all";

/** 三层存储配置 */
export interface TieredStorageConfig {
  /** 工作记忆容量 (Hot缓存) */
  workingCapacity: number;
  /** 短期记忆容量 (Warm缓存) */
  shortTermCapacity: number;
  /** 长期记忆磁盘限制 */
  longTermDiskLimit: number;
  /** 自动层级升降级 */
  autoTierTransition: boolean;
  /** 升级检查间隔 (毫秒) */
  tierCheckIntervalMs: number;
}

/** 增强检索配置 */
export interface EnhancedRetrievalConfig {
  enabled: boolean;
  /** 内容相似度权重 */
  contentWeight: number;
  /** 时间衰减权重 */
  temporalWeight: number;
  /** 重要性权重 */
  importanceWeight: number;
  /** 访问频率权重 */
  frequencyWeight: number;
  /** 层级偏好权重 (工作记忆优先) */
  tierWeight: number;
}

/** 批量加载配置 */
export interface BatchLoadingConfig {
  enabled: boolean;
  /** 批处理大小 */
  batchSize: number;
  /** 最大并发数 */
  maxConcurrent: number;
  /** 进度回调间隔 */
  progressIntervalMs: number;
}

/** 异步写入队列配置 */
export interface AsyncWriteConfig {
  enabled: boolean;
  /** 队列最大长度 */
  maxQueueSize: number;
  /** 刷新间隔 (毫秒) */
  flushIntervalMs: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟 (毫秒) */
  retryDelayMs: number;
}

/** 动态模型加载配置 */
export interface DynamicModelLoadingConfig {
  /** 加载策略 */
  strategy: "load-all" | "on-demand" | "adaptive";
  /** 资源不足时回退策略 */
  fallbackStrategy: "on-demand" | "minimal";
  /** 模型优先级顺序 */
  priorityOrder: Array<"embedding" | "reranker" | "expansion">;
  /** 最小内存要求 (GB) */
  minMemoryGb: number;
}

/** 系统资源配置 */
export interface SystemResourceConfig {
  /** 监控间隔 (毫秒) */
  monitoringIntervalMs: number;
  /** 内存警告阈值 (%) */
  memoryWarningPercent: number;
  /** 内存危险阈值 (%) */
  memoryCriticalPercent: number;
  /** CPU警告阈值 (%) */
  cpuWarningPercent: number;
  /** 自动调整 */
  autoAdjust: boolean;
}

/** 统一核心配置 */
export interface UnifiedNSEM2Config extends NSEM2Config {
  /** 三层存储配置 */
  tieredStorage: TieredStorageConfig;
  /** 增强检索配置 */
  enhancedRetrieval: EnhancedRetrievalConfig;
  /** 批量加载配置 */
  batchLoading: BatchLoadingConfig;
  /** 异步写入配置 */
  asyncWrite: AsyncWriteConfig;
  /** 动态模型加载配置 */
  modelLoading: DynamicModelLoadingConfig;
  /** 系统资源配置 */
  systemResource: SystemResourceConfig;
}

/** 批量摄入结果 */
export interface BatchIngestResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ index: number; error: string }>;
  atoms: MemAtom[];
  durationMs: number;
}

/** 批量检索结果 */
export interface BatchRetrieveResult {
  results: Array<{
    queryIndex: number;
    atoms: ActivatedMemory["atoms"];
  }>;
  durationMs: number;
}

/** 系统资源状态 */
export interface SystemResources {
  memory: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  cpu: {
    loadAverage: number[];
    usagePercent: number;
    coreCount: number;
  };
  disk: {
    total: number;
    available: number;
  };
  gpu?: {
    available: boolean;
    memoryTotal?: number;
    memoryUsed?: number;
  };
}

/** 写入操作 */
interface WriteOperation {
  id: string;
  type: "store" | "update" | "delete";
  atom?: MemAtom;
  atomId?: string;
  scope: MemoryScope;
  timestamp: number;
  retries: number;
}

/** 层级元数据 */
interface TierMetadata {
  tier: "working" | "short-term" | "long-term";
  enteredTierAt: number;
  tierAccessCount: number;
  tierHistory: Array<{
    tier: "working" | "short-term" | "long-term";
    enteredAt: number;
    leftAt: number;
  }>;
}

/** 增强的记忆原子 */
interface EnhancedMemAtom extends MemAtom {
  _tierMeta: TierMetadata;
  _scope: MemoryScope;
  _parentInfo?: {
    parentAgentId: string;
    parentMemoryId: string;
    inheritancePath: string[];
    decayFactor: number;
  };
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_TIERED_STORAGE_CONFIG: TieredStorageConfig = {
  workingCapacity: 15,
  shortTermCapacity: 1000,
  longTermDiskLimit: 1000000, // 100万条
  autoTierTransition: true,
  tierCheckIntervalMs: 60000, // 1分钟
};

const DEFAULT_ENHANCED_RETRIEVAL_CONFIG: EnhancedRetrievalConfig = {
  enabled: true,
  contentWeight: 0.5,
  temporalWeight: 0.2,
  importanceWeight: 0.2,
  frequencyWeight: 0.1,
  tierWeight: 0.1,
};

const DEFAULT_BATCH_LOADING_CONFIG: BatchLoadingConfig = {
  enabled: true,
  batchSize: 100,
  maxConcurrent: 5,
  progressIntervalMs: 1000,
};

const DEFAULT_ASYNC_WRITE_CONFIG: AsyncWriteConfig = {
  enabled: true,
  maxQueueSize: 1000,
  flushIntervalMs: 5000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

const DEFAULT_MODEL_LOADING_CONFIG: DynamicModelLoadingConfig = {
  strategy: "adaptive",
  fallbackStrategy: "on-demand",
  priorityOrder: ["embedding", "reranker", "expansion"],
  minMemoryGb: 4,
};

const DEFAULT_SYSTEM_RESOURCE_CONFIG: SystemResourceConfig = {
  monitoringIntervalMs: 30000,
  memoryWarningPercent: 75,
  memoryCriticalPercent: 90,
  cpuWarningPercent: 80,
  autoAdjust: true,
};

const DEFAULT_UNIFIED_CONFIG: Partial<UnifiedNSEM2Config> = {
  rootDir: join(homedir(), ".nsemclaw", "nsem2"),
  agentId: "default",
  resourceMode: "balanced",
  evolutionInterval: 15 * 60 * 1000,
  maxAtoms: 50000,
  compressionTrigger: {
    atomCount: 1000,
    ageDays: 7,
    strengthThreshold: 0.3,
  },
  tieredStorage: DEFAULT_TIERED_STORAGE_CONFIG,
  enhancedRetrieval: DEFAULT_ENHANCED_RETRIEVAL_CONFIG,
  batchLoading: DEFAULT_BATCH_LOADING_CONFIG,
  asyncWrite: DEFAULT_ASYNC_WRITE_CONFIG,
  modelLoading: DEFAULT_MODEL_LOADING_CONFIG,
  systemResource: DEFAULT_SYSTEM_RESOURCE_CONFIG,
};

// ============================================================================
// 读写锁实现
// ============================================================================

class ReadWriteLock {
  private readLock: Promise<void> = Promise.resolve();
  private writeLock: Promise<void> = Promise.resolve();
  private readCount = 0;
  private isWriting = false;

  async withReadLock<T>(fn: () => Promise<T>): Promise<T> {
    // 等待当前写操作完成
    await this.writeLock;

    this.readCount++;
    try {
      return await fn();
    } finally {
      this.readCount--;
    }
  }

  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    // 等待所有读操作和写操作完成
    const acquireLock = async (): Promise<T> => {
      // 等待读操作完成
      while (this.readCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (this.isWriting) {
        throw new Error("Write operation already in progress");
      }

      this.isWriting = true;
      try {
        return await fn();
      } finally {
        this.isWriting = false;
      }
    };

    this.writeLock = this.writeLock
      .catch(() => {})
      .then(acquireLock)
      .then(() => {});

    return this.writeLock.then(() => acquireLock());
  }
}

// ============================================================================
// 异步写入队列
// ============================================================================

class AsyncWriteQueue {
  private queue: WriteOperation[] = [];
  private processing = false;
  private flushTimer?: NodeJS.Timeout;
  private config: AsyncWriteConfig;
  private onFlush: (operations: WriteOperation[]) => Promise<void>;

  constructor(config: AsyncWriteConfig, onFlush: (operations: WriteOperation[]) => Promise<void>) {
    this.config = config;
    this.onFlush = onFlush;

    if (config.enabled) {
      this.startFlushTimer();
    }
  }

  async enqueue(operation: WriteOperation): Promise<void> {
    if (!this.config.enabled) {
      // 直接执行
      await this.onFlush([operation]);
      return;
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      // 队列已满，先刷新
      await this.flush();
    }

    this.queue.push(operation);
  }

  async flush(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const operations = [...this.queue];
    this.queue = [];

    try {
      await this.onFlush(operations);
    } catch (error) {
      // 重试逻辑
      const failedOps = operations.filter((op) => {
        if (op.retries < this.config.maxRetries) {
          op.retries++;
          this.queue.unshift(op);
          return false;
        }
        return true;
      });

      if (failedOps.length > 0) {
        log.error(
          `Failed to flush ${failedOps.length} operations after ${this.config.maxRetries} retries`,
        );
      }
    } finally {
      this.processing = false;
    }
  }

  getStatus() {
    return {
      pendingCount: this.queue.length,
      processing: this.processing,
    };
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        log.error(`Async flush failed: ${err}`);
      });
    }, this.config.flushIntervalMs);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}

// ============================================================================
// 系统资源检测器
// ============================================================================

class SystemResourceDetector {
  private config: SystemResourceConfig;
  private monitorTimer?: NodeJS.Timeout;
  private currentResources: SystemResources;
  private listeners: Array<(resource: string, level: "warning" | "critical") => void> = [];

  constructor(config: SystemResourceConfig) {
    this.config = config;
    this.currentResources = this.detectResources();
  }

  startMonitoring(): void {
    if (this.monitorTimer) return;

    this.monitorTimer = setInterval(() => {
      this.currentResources = this.detectResources();
      this.checkThresholds();
    }, this.config.monitoringIntervalMs);

    log.info("System resource monitoring started");
  }

  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  getCurrentResources(): SystemResources {
    return { ...this.currentResources };
  }

  onResourceWarning(
    callback: (resource: string, level: "warning" | "critical") => void,
  ): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private detectResources(): SystemResources {
    const total = totalmem();
    const free = freemem();
    const used = total - free;

    return {
      memory: {
        total,
        used,
        available: free,
        percentage: (used / total) * 100,
      },
      cpu: {
        loadAverage: loadavg(),
        usagePercent: this.estimateCpuUsage(),
        coreCount: cpus().length,
      },
      disk: {
        total: 0, // TODO: 实现磁盘检测
        available: 0,
      },
    };
  }

  private estimateCpuUsage(): number {
    const loadAvg = loadavg()[0] ?? 0;
    const cores = cpus().length || 1;
    return Math.min(100, (loadAvg / cores) * 100);
  }

  private checkThresholds(): void {
    const { memory, cpu } = this.currentResources;

    if (memory.percentage >= this.config.memoryCriticalPercent) {
      this.notifyListeners("memory", "critical");
    } else if (memory.percentage >= this.config.memoryWarningPercent) {
      this.notifyListeners("memory", "warning");
    }

    if (cpu.usagePercent >= this.config.cpuWarningPercent) {
      this.notifyListeners("cpu", "warning");
    }
  }

  private notifyListeners(resource: string, level: "warning" | "critical"): void {
    for (const listener of this.listeners) {
      try {
        listener(resource, level);
      } catch (err) {
        log.error(`Resource warning listener error: ${err as Record<string, unknown>}`);
      }
    }
  }
}

// ============================================================================
// 统一 NSEM2 核心
// ============================================================================

export class UnifiedNSEM2Core {
  private config: UnifiedNSEM2Config;
  private embedding: SmartEmbeddingEngine;
  private vectorStorage: VectorStorage;

  // 三层存储结构
  private workingMemory: LRUCache<string, EnhancedMemAtom>;
  private shortTermMemory: Map<string, EnhancedMemAtom> = new Map();
  private edges: Map<string, LivingEdge> = new Map();
  private fields: Map<string, MemoryField> = new Map();

  // 并发控制
  private rwLock = new ReadWriteLock();

  // 异步写入队列
  private writeQueue: AsyncWriteQueue;

  // 系统资源检测
  private resourceDetector: SystemResourceDetector;

  // 运行时状态
  private isRunning = false;
  private evolveTimer?: NodeJS.Timeout;
  private evolveRetryCount = 0;
  private tierCheckTimer?: NodeJS.Timeout;
  private memoryMonitorTimer?: NodeJS.Timeout;

  // 统计
  private stats = {
    loadedFromDisk: 0,
    savedToDisk: 0,
    cacheHits: 0,
    cacheMisses: 0,
    batchOperations: 0,
  };

  constructor(embedding: SmartEmbeddingEngine, config: Partial<UnifiedNSEM2Config> = {}) {
    this.embedding = embedding;
    this.config = { ...DEFAULT_UNIFIED_CONFIG, ...config } as UnifiedNSEM2Config;

    // 初始化 VectorStorage
    this.vectorStorage = getVectorStorage({
      baseDir: join(this.config.rootDir, "vectors"),
      dbName: "vectors.db",
      vectorDim: 384,
      enableWAL: true,
      compression: "float16",
      hotCacheSize: this.config.tieredStorage.workingCapacity * 100,
      warmCacheSize: this.config.tieredStorage.shortTermCapacity * 10,
    });

    // 初始化工作记忆 (Hot)
    this.workingMemory = new LRUCache<string, EnhancedMemAtom>(
      this.config.tieredStorage.workingCapacity,
    );

    // 初始化异步写入队列
    this.writeQueue = new AsyncWriteQueue(
      this.config.asyncWrite,
      this.processWriteOperations.bind(this),
    );

    // 初始化系统资源检测
    this.resourceDetector = new SystemResourceDetector(this.config.systemResource);

    this.ensureDirectories();

    log.info("🧠 Unified NSEM2 Core initialized");
    this.logSystemInfo();
  }

  // ========================================================================
  // 工厂方法
  // ========================================================================

  static async create(
    cfg: NsemclawConfig,
    agentId: string,
    memoryConfig: ResolvedMemorySearchConfig,
    config?: Partial<UnifiedNSEM2Config>,
  ): Promise<UnifiedNSEM2Core> {
    // 检测系统资源决定加载策略
    const resources = this.detectInitialResources();
    const loadingStrategy = this.decideLoadingStrategy(resources, config?.modelLoading);

    log.info(`Dynamic model loading strategy: ${loadingStrategy.strategy}`);
    log.info(`Available memory: ${resources.memory.available.toFixed(1)} GB`);

    // 创建智能嵌入引擎
    const embedding = await createSmartEmbeddingEngine(
      cfg,
      agentId,
      memoryConfig,
      config?.resourceMode,
      {
        autoDownloadModels: loadingStrategy.autoDownload,
      },
    );

    return new UnifiedNSEM2Core(embedding, {
      ...config,
      agentId,
      modelLoading: {
        ...DEFAULT_MODEL_LOADING_CONFIG,
        ...config?.modelLoading,
        strategy: loadingStrategy.strategy,
      },
    });
  }

  private static detectInitialResources(): SystemResources {
    const total = totalmem() / (1024 * 1024 * 1024); // GB
    const free = freemem() / (1024 * 1024 * 1024);

    return {
      memory: {
        total,
        used: total - free,
        available: free,
        percentage: ((total - free) / total) * 100,
      },
      cpu: {
        loadAverage: loadavg(),
        usagePercent: 0,
        coreCount: cpus().length,
      },
      disk: {
        total: 0,
        available: 0,
      },
    };
  }

  private static decideLoadingStrategy(
    resources: SystemResources,
    config?: Partial<DynamicModelLoadingConfig>,
  ): { strategy: DynamicModelLoadingConfig["strategy"]; autoDownload: boolean; preload: string[] } {
    const minMemory = config?.minMemoryGb ?? DEFAULT_MODEL_LOADING_CONFIG.minMemoryGb;

    // 注意：重排模型和扩展模型采用延迟加载策略
    // 不在启动时预加载，避免启动时的内存压力和崩溃风险
    
    // 配置允许全部加载且内存充足
    if (config?.strategy === "load-all" && resources.memory.available >= minMemory) {
      return {
        strategy: "load-all",
        autoDownload: true,
        // 只预加载嵌入模型，其他模型按需加载
        preload: ["embedding"],
      };
    }

    // 自适应策略
    if (resources.memory.available >= 8) {
      return {
        strategy: "adaptive",
        autoDownload: true,
        // 只预加载嵌入模型
        preload: ["embedding"],
      };
    }

    // 内存不足，使用按需加载
    return {
      strategy: "on-demand",
      autoDownload: true,
      preload: ["embedding"],
    };
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 启动系统资源监控
    this.resourceDetector.startMonitoring();
    this.resourceDetector.onResourceWarning((resource, level) => {
      this.handleResourceWarning(resource, level);
    });

    // 启动自动进化
    if (this.config.evolutionInterval > 0) {
      this.scheduleNextEvolution();
    }

    // 启动层级检查
    if (this.config.tieredStorage.autoTierTransition) {
      this.startTierTransitionMonitoring();
    }

    log.info(`🧠 Unified NSEM2 Core started [${this.config.agentId}]`);
    log.info(
      `   Working memory: ${this.workingMemory.size()}/${this.config.tieredStorage.workingCapacity}`,
    );
    log.info(`   Short-term memory: ${this.shortTermMemory.size}`);
    log.info(`   Async write queue: ${this.config.asyncWrite.enabled ? "enabled" : "disabled"}`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // 停止定时器
    if (this.evolveTimer) {
      clearTimeout(this.evolveTimer);
      this.evolveTimer = undefined;
    }

    if (this.tierCheckTimer) {
      clearInterval(this.tierCheckTimer);
      this.tierCheckTimer = undefined;
    }

    // 刷新异步队列
    await this.writeQueue.flush();
    this.writeQueue.stop();

    // 停止资源监控
    this.resourceDetector.stopMonitoring();

    // 清理资源
    await this.embedding.cleanup?.();
    this.workingMemory.clear();
    this.shortTermMemory.clear();
    releaseVectorStorage({
      baseDir: join(this.config.rootDir, "vectors"),
      dbName: "vectors.db",
      vectorDim: 384,
    });

    log.info("🛑 Unified NSEM2 Core stopped");
  }

  // ========================================================================
  // 核心操作 - 摄入记忆
  // ========================================================================

  /**
   * 单条摄入 - 使用写锁保护
   */
  async ingest(
    content: string,
    options: {
      type?: ContentType;
      scope?: MemoryScope;
      source?: string;
      agent?: string;
      workspace?: string;
      tags?: string[];
      strength?: number;
    } = {},
  ): Promise<MemAtom> {
    return this.rwLock.withWriteLock(async () => {
      return this._ingestUnsafe(content, options);
    });
  }

  /**
   * 批量摄入 - 高效批处理
   */
  async ingestBatch(
    items: Array<{
      content: string;
      type?: ContentType;
      scope?: MemoryScope;
      tags?: string[];
      strength?: number;
    }>,
    options?: {
      onProgress?: (completed: number, total: number) => void;
      abortSignal?: AbortSignal;
    },
  ): Promise<BatchIngestResult> {
    const startTime = Date.now();
    const results: MemAtom[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    const batchSize = this.config.batchLoading.batchSize;
    const total = items.length;

    // 分批处理
    for (let i = 0; i < total; i += batchSize) {
      if (options?.abortSignal?.aborted) {
        break;
      }

      const batch = items.slice(i, i + batchSize);

      // 并行生成嵌入
      const embeddings = await Promise.all(batch.map((item) => this.embedding.embed(item.content)));

      // 使用写锁批量写入
      await this.rwLock.withWriteLock(async () => {
        for (let j = 0; j < batch.length; j++) {
          try {
            const item = batch[j]!;
            const embedding = embeddings[j]!;
            const atom = await this._createAtomFromEmbedding(item.content, embedding, item);
            results.push(atom);
          } catch (error) {
            errors.push({
              index: i + j,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });

      if (options?.onProgress) {
        options.onProgress(Math.min(i + batchSize, total), total);
      }
    }

    this.stats.batchOperations++;

    return {
      total,
      succeeded: results.length,
      failed: errors.length,
      errors,
      atoms: results,
      durationMs: Date.now() - startTime,
    };
  }

  // ========================================================================
  // 核心操作 - 激活/检索记忆
  // ========================================================================

  /**
   * 激活记忆 - 使用读锁，可并行
   */
  async activate(query: MemoryQuery): Promise<ActivatedMemory> {
    return this.rwLock.withReadLock(async () => {
      return this._activateUnsafe(query);
    });
  }

  /**
   * 批量检索
   */
  async retrieveBatch(
    queries: MemoryQuery[],
    options?: {
      maxResultsPerQuery?: number;
    },
  ): Promise<BatchRetrieveResult> {
    const startTime = Date.now();

    const results = await Promise.all(
      queries.map(async (query, index) => {
        const activated = await this.activate({
          ...query,
          constraints: {
            ...query.constraints,
            maxResults: options?.maxResultsPerQuery ?? query.constraints?.maxResults ?? 10,
          },
        });
        return {
          queryIndex: index,
          atoms: activated.atoms,
        };
      }),
    );

    return {
      results,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 按作用域检索
   */
  async retrieveByScope(query: MemoryQuery, scopes: MemoryScope[]): Promise<ActivatedMemory> {
    return this.rwLock.withReadLock(async () => {
      // 扩展查询
      const expanded = await this.embedding.expandQuery(query.intent);
      const embedding = await this.embedding.embed(expanded.original);

      // 在指定作用域内搜索
      const candidates = this._findByScopes(embedding, scopes, 50);

      // 应用增强评分
      const scored = this.config.enhancedRetrieval.enabled
        ? this._applyEnhancedScoring(candidates, embedding, query.intent)
        : candidates.map((c) => ({ ...c, score: c.similarity }));

      // 激活传播
      const activationMap = new Map<string, { level: number; depth: number; path: string[] }>();
      for (const { atom, score } of scored.slice(0, 20)) {
        if (score >= 0.3) {
          activationMap.set(atom.id, { level: score, depth: 0, path: [atom.id] });
        }
      }

      this._spreadActivation(activationMap, query.strategy);

      // 组装结果
      const atoms = this._assembleAtoms(activationMap, query.constraints?.maxResults ?? 10);

      return {
        atoms,
        fields: this._activateFields(activationMap),
        emergentRelations: this._discoverEmergentRelations(activationMap),
        semantic: this._computeSemantic(atoms),
      };
    });
  }

  // ========================================================================
  // 核心操作 - 进化
  // ========================================================================

  /**
   * 进化 - 使用写锁
   */
  async evolve(): Promise<void> {
    return this.rwLock.withWriteLock(async () => {
      return this._evolveUnsafe();
    });
  }

  // ========================================================================
  // 私有方法 - 核心实现
  // ========================================================================

  private async _ingestUnsafe(
    content: string,
    options: {
      type?: ContentType;
      scope?: MemoryScope;
      source?: string;
      agent?: string;
      workspace?: string;
      tags?: string[];
      strength?: number;
    },
  ): Promise<MemAtom> {
    const id = generateId("atom", content);

    // 检查重复
    const existing = this._findAtomUnsafe(id);
    if (existing) {
      return this._reinforceUnsafe(id);
    }

    // 生成嵌入
    const embedding = await this.embedding.embed(content);
    return this._createAtomFromEmbedding(content, embedding, options);
  }

  private async _createAtomFromEmbedding(
    content: string,
    embedding: Vector,
    options: {
      type?: ContentType;
      scope?: MemoryScope;
      source?: string;
      agent?: string;
      workspace?: string;
      tags?: string[];
      strength?: number;
    },
  ): Promise<EnhancedMemAtom> {
    const id = generateId("atom", content);
    const now = Date.now();
    const contentType = options.type ?? "fact";
    const scope = options.scope ?? "personal";
    const strength = clamp(options.strength ?? 0.5, 0, 1);

    const atom: EnhancedMemAtom = {
      id,
      contentHash: hash(content),
      content,
      contentType,
      embedding,
      temporal: {
        created: now,
        modified: now,
        lastAccessed: now,
        accessCount: 1,
        decayRate: this.calculateDecayRate(contentType),
      },
      spatial: {
        sourceFile: options.source,
        workspace: options.workspace,
        agent: options.agent ?? this.config.agentId,
      },
      strength: {
        current: strength,
        base: strength,
        reinforcement: 0,
        emotional: 0,
      },
      generation: 1,
      meta: {
        tags: options.tags ?? [],
        confidence: 1.0,
        source: options.agent ? "ai" : "user",
      },
      _tierMeta: {
        tier: "working",
        enteredTierAt: now,
        tierAccessCount: 1,
        tierHistory: [],
      },
      _scope: scope,
    };

    // 存入工作记忆
    this._addToWorkingMemory(atom);

    // 异步持久化
    if (this.config.asyncWrite.enabled) {
      await this.writeQueue.enqueue({
        id: generateId("op", Date.now().toString()),
        type: "store",
        atom,
        scope,
        timestamp: now,
        retries: 0,
      });
    } else {
      this.persistAtom(atom);
    }

    // 建立关系
    await this.establishRelations(atom);

    return atom;
  }

  private async _activateUnsafe(query: MemoryQuery): Promise<ActivatedMemory> {
    // 扩展查询
    const expanded = await this.embedding.expandQuery(query.intent);
    const embedding = await this.embedding.embed(expanded.original);

    // 查找相似 (考虑层级)
    const candidates = this._findSimilarWithTier(embedding, 30);

    // 增强评分
    const scored = this.config.enhancedRetrieval.enabled
      ? this._applyEnhancedScoring(candidates, embedding, query.intent)
      : candidates.map((c) => ({ ...c, score: c.similarity }));

    // 激活传播
    const activationMap = new Map<string, { level: number; depth: number; path: string[] }>();
    for (const { atom, score } of scored.slice(0, 20)) {
      if (score >= 0.3) {
        activationMap.set(atom.id, { level: score, depth: 0, path: [atom.id] });
      }
    }

    this._spreadActivation(activationMap, query.strategy);

    // 组装结果
    const atoms = this._assembleAtoms(activationMap, query.constraints?.maxResults ?? 10);

    // 重排优化
    if (atoms.length > 0) {
      const reranked = await this.embedding.rerank(
        query.intent,
        atoms.map((a) => ({ text: a.atom.content, score: a.relevance })),
      );

      for (let i = 0; i < atoms.length && i < reranked.length; i++) {
        const item = reranked[i];
        if (item?.rerankScore !== undefined) {
          atoms[i]!.relevance = item.rerankScore;
        }
      }
      atoms.sort((a, b) => b.relevance - a.relevance);
    }

    // 更新访问统计
    this._updateAccessStats(atoms.map((a) => a.atom.id));

    return {
      atoms,
      fields: this._activateFields(activationMap),
      emergentRelations: this._discoverEmergentRelations(activationMap),
      semantic: this._computeSemantic(atoms),
    };
  }

  private async _evolveUnsafe(): Promise<void> {
    log.info("🧬 Memory evolution started");

    const beforeCount: number = this.workingMemory.size() + this.shortTermMemory.size;

    // 衰减
    this._decayMemories();

    // 清理
    this._pruneForgotten();

    // 合并场
    this._mergeFields();

    // 强化连接
    this._reinforceConnections();

    const afterCount: number = this.workingMemory.size() + this.shortTermMemory.size;

    log.info(`✅ Evolution completed: ${beforeCount} → ${afterCount} atoms`);
  }

  // ========================================================================
  // 私有方法 - 三层存储管理
  // ========================================================================

  private _addToWorkingMemory(atom: EnhancedMemAtom): void {
    // 检查容量
    if (this.workingMemory.size() >= this.config.tieredStorage.workingCapacity) {
      // 降级最旧的到短期记忆
      this._evictOldestFromWorkingMemory();
    }

    this.workingMemory.set(atom.id, atom);
    atom._tierMeta.tier = "working";
    atom._tierMeta.enteredTierAt = Date.now();
  }

  private _evictOldestFromWorkingMemory(): void {
    const keys = this.workingMemory.keys();
    const oldestKey = keys[keys.length - 1];

    if (oldestKey) {
      const atom = this.workingMemory.get(oldestKey);
      if (atom) {
        // 移动到短期记忆
        this._moveToShortTerm(atom);
      }
    }
  }

  private _moveToShortTerm(atom: EnhancedMemAtom): void {
    // 记录历史
    atom._tierMeta.tierHistory.push({
      tier: "working",
      enteredAt: atom._tierMeta.enteredTierAt,
      leftAt: Date.now(),
    });

    // 从工作记忆移除
    this.workingMemory.delete(atom.id);

    // 添加到短期记忆
    atom._tierMeta.tier = "short-term";
    atom._tierMeta.enteredTierAt = Date.now();
    atom._tierMeta.tierAccessCount = 0;
    this.shortTermMemory.set(atom.id, atom);
  }

  private _findAtomUnsafe(id: string): EnhancedMemAtom | null {
    return this.workingMemory.get(id) ?? this.shortTermMemory.get(id) ?? null;
  }

  private _findSimilarWithTier(
    embedding: Vector,
    topK: number,
  ): Array<{ atom: EnhancedMemAtom; similarity: number; tier: string }> {
    const results: Array<{ atom: EnhancedMemAtom; similarity: number; tier: string }> = [];

    // 搜索工作记忆 (Hot)
    for (const atom of this.workingMemory.values()) {
      const sim = cosineSimilarity(embedding, atom.embedding);
      if (sim > 0.2) {
        results.push({ atom, similarity: sim, tier: "working" });
      }
    }

    // 搜索短期记忆 (Warm)
    for (const atom of this.shortTermMemory.values()) {
      const sim = cosineSimilarity(embedding, atom.embedding);
      if (sim > 0.2) {
        results.push({ atom, similarity: sim, tier: "short-term" });
      }
    }

    // 如果内存结果不足，从磁盘搜索 (Cold)
    if (results.length < topK) {
      const diskResults = this.vectorStorage.search(embedding, {
        topK: topK * 2,
        minSimilarity: 0.2,
      });

      for (const result of diskResults) {
        // 跳过已在内存中的
        if (this._findAtomUnsafe(result.id)) continue;

        // 创建简化原子
        const atom: EnhancedMemAtom = {
          id: result.id,
          contentHash: "",
          content: "", // 需要时从metadata加载
          contentType: "fact",
          embedding: result.vector,
          temporal: {
            created: Date.now(),
            modified: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            decayRate: 0.001,
          },
          spatial: { agent: this.config.agentId },
          strength: { current: 0.5, base: 0.5, reinforcement: 0, emotional: 0 },
          generation: 1,
          meta: { tags: [], confidence: 1, source: "derived" },
          _tierMeta: {
            tier: "long-term",
            enteredTierAt: Date.now(),
            tierAccessCount: 0,
            tierHistory: [],
          },
          _scope: "personal",
        };

        results.push({ atom, similarity: result.similarity, tier: "long-term" });
        this.stats.cacheMisses++;
      }
    } else {
      this.stats.cacheHits++;
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  private _findByScopes(
    embedding: Vector,
    scopes: MemoryScope[],
    topK: number,
  ): Array<{ atom: EnhancedMemAtom; similarity: number }> {
    const candidates = this._findSimilarWithTier(embedding, topK * 2);

    return candidates
      .filter(({ atom }) => {
        if (scopes.includes("all")) return true;
        return scopes.includes(atom._scope);
      })
      .slice(0, topK)
      .map(({ atom, similarity }) => ({ atom, similarity }));
  }

  // ========================================================================
  // 私有方法 - 增强评分
  // ========================================================================

  private _applyEnhancedScoring(
    candidates: Array<{ atom: EnhancedMemAtom; similarity: number; tier?: string }>,
    queryEmbedding: Vector,
    queryIntent: string,
  ): Array<{ atom: EnhancedMemAtom; similarity: number; score: number }> {
    const config = this.config.enhancedRetrieval;
    const now = Date.now();

    return candidates.map(({ atom, similarity, tier }) => {
      // 时间衰减分数 (越新越高)
      const age = now - atom.temporal.lastAccessed;
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
      const temporalScore = Math.max(0, 1 - age / maxAge);

      // 重要性分数
      const importanceScore = atom.strength.current;

      // 访问频率分数
      const frequencyScore = Math.min(1, atom.temporal.accessCount / 100);

      // 层级偏好分数 (工作记忆 > 短期记忆 > 长期记忆)
      const tierScores = { working: 1.0, "short-term": 0.8, "long-term": 0.6 };
      const tierScore = tierScores[tier as keyof typeof tierScores] ?? 0.5;

      // 综合评分
      const score =
        config.contentWeight * similarity +
        config.temporalWeight * temporalScore +
        config.importanceWeight * importanceScore +
        config.frequencyWeight * frequencyScore +
        config.tierWeight * tierScore;

      return { atom, similarity, score };
    });
  }

  // ========================================================================
  // 私有方法 - 其他
  // ========================================================================

  private _reinforceUnsafe(atomId: string): EnhancedMemAtom {
    const atom = this._findAtomUnsafe(atomId);
    if (!atom) {
      throw new Error(`Atom not found: ${atomId}`);
    }

    atom.strength.reinforcement += 1;
    atom.strength.current = Math.min(1, atom.strength.base + atom.strength.reinforcement * 0.1);
    atom.temporal.lastAccessed = Date.now();
    atom.temporal.accessCount++;
    atom._tierMeta.tierAccessCount++;

    // 考虑升级
    if (atom._tierMeta.tier !== "working") {
      this._considerUpgrade(atom);
    }

    return atom;
  }

  private _considerUpgrade(atom: EnhancedMemAtom): void {
    if (atom._tierMeta.tier === "short-term") {
      // 访问次数足够，升级到工作记忆
      if (atom._tierMeta.tierAccessCount >= 5) {
        // 从短期记忆移除
        this.shortTermMemory.delete(atom.id);
        // 添加到工作记忆
        this._addToWorkingMemory(atom);
        log.debug(`⬆️ Promoted to working memory: ${atom.id.slice(0, 8)}`);
      }
    }
  }

  private _spreadActivation(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
    strategy?: QueryStrategy,
  ): void {
    const maxDepth = strategy === "exploratory" ? 3 : strategy === "associative" ? 4 : 2;
    const decayFactor = 0.7;

    for (let depth = 0; depth < maxDepth; depth++) {
      const currentLevel = Array.from(activationMap.entries()).filter(
        ([_, info]) => info.depth === depth,
      );

      for (const [atomId, info] of currentLevel) {
        for (const edge of this.edges.values()) {
          if (edge.from !== atomId && edge.to !== atomId) continue;

          const neighborId = edge.from === atomId ? edge.to : edge.from;
          const newLevel = info.level * edge.dynamicWeight.current * decayFactor;

          if (newLevel >= 0.3) {
            const existing = activationMap.get(neighborId);
            if (!existing || existing.level < newLevel) {
              activationMap.set(neighborId, {
                level: newLevel,
                depth: depth + 1,
                path: [...info.path, neighborId],
              });
            }
          }
        }
      }
    }
  }

  private _assembleAtoms(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
    maxResults: number,
  ): ActivatedMemory["atoms"] {
    const sorted = Array.from(activationMap.entries())
      .sort((a, b) => b[1].level - a[1].level)
      .slice(0, maxResults);

    const result: ActivatedMemory["atoms"] = [];
    for (const [id, info] of sorted) {
      const atom = this._findAtomUnsafe(id);
      if (!atom) continue;

      result.push({
        atom,
        activation: info.level,
        relevance: info.level * atom.strength.current,
        spreadDepth: info.depth,
        path: info.path,
      });
    }
    return result;
  }

  private _discoverEmergentRelations(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
  ): ActivatedMemory["emergentRelations"] {
    const relations: ActivatedMemory["emergentRelations"] = [];
    const atomIds = Array.from(activationMap.keys());

    for (let i = 0; i < atomIds.length; i++) {
      for (let j = i + 1; j < atomIds.length; j++) {
        const id1 = atomIds[i]!;
        const id2 = atomIds[j]!;

        const hasEdge = Array.from(this.edges.values()).some(
          (e) => (e.from === id1 && e.to === id2) || (e.from === id2 && e.to === id1),
        );

        if (!hasEdge) {
          const commonNeighbors = this._findCommonNeighbors(id1, id2);
          if (commonNeighbors.length > 0) {
            const info1 = activationMap.get(id1);
            const info2 = activationMap.get(id2);
            if (!info1 || !info2) continue;

            const strength =
              Math.min(info1.level, info2.level) * (1 - 1 / (commonNeighbors.length + 1));

            relations.push({
              from: id1,
              to: id2,
              via: commonNeighbors,
              strength,
              isNovel: true,
            });
          }
        }
      }
    }

    return relations.sort((a, b) => b.strength - a.strength).slice(0, 10);
  }

  private _activateFields(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
  ): ActivatedMemory["fields"] {
    const results: ActivatedMemory["fields"] = [];
    const activeAtoms = Array.from(activationMap.keys());

    for (const field of this.fields.values()) {
      const overlapCount = activeAtoms.filter((id) => field.atoms.has(id)).length;
      const overlap = overlapCount / Math.max(activeAtoms.length, field.atoms.size);

      if (overlap > 0.3) {
        results.push({ field, overlap });
        field.vitality = Math.min(1, field.vitality + 0.1);
      }
    }

    return results.sort((a, b) => b.overlap - a.overlap).slice(0, 5);
  }

  private _computeSemantic(atoms: ActivatedMemory["atoms"]): ActivatedMemory["semantic"] {
    if (atoms.length === 0) {
      return { centroid: [], coherence: 0, coverage: 0 };
    }

    const dim = atoms[0]!.atom.embedding.length;
    const centroid = new Array<number>(dim).fill(0);
    const embeddings: number[][] = [];

    for (const item of atoms) {
      embeddings.push(item.atom.embedding);
      for (let i = 0; i < dim; i++) {
        centroid[i]! += item.atom.embedding[i]!;
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i]! /= atoms.length;
    }

    let coherenceSum = 0;
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        coherenceSum += cosineSimilarity(embeddings[i]!, embeddings[j]!);
      }
    }

    const coherence =
      embeddings.length > 1
        ? coherenceSum / ((embeddings.length * (embeddings.length - 1)) / 2)
        : 1;

    return {
      centroid,
      coherence,
      coverage: atoms.length / (this.workingMemory.size() + this.shortTermMemory.size),
    };
  }

  private _decayMemories(): void {
    const now = Date.now();

    const decayAtom = (atom: EnhancedMemAtom) => {
      const age = now - atom.temporal.lastAccessed;
      const decayFactor = exponentialDecay(1, atom.temporal.decayRate, age / (24 * 60 * 60 * 1000));

      atom.strength.current =
        atom.strength.base * decayFactor + atom.strength.reinforcement * 0.1 * decayFactor;
      atom.strength.current = Math.min(1, atom.strength.current);
    };

    for (const atom of this.workingMemory.values()) decayAtom(atom);
    for (const atom of this.shortTermMemory.values()) decayAtom(atom);
  }

  private _pruneForgotten(): void {
    const toRemove: string[] = [];

    for (const [id, atom] of this.shortTermMemory) {
      if (atom.strength.current < 0.05 && atom.temporal.accessCount < 5) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.shortTermMemory.delete(id);
      // 清理相关边
      for (const [edgeId, edge] of this.edges) {
        if (edge.from === id || edge.to === id) {
          this.edges.delete(edgeId);
        }
      }
    }
  }

  private _mergeFields(): void {
    // 简化的场合并逻辑
    const fields = Array.from(this.fields.values());
    const toDelete = new Set<string>();

    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        const f1 = fields[i];
        const f2 = fields[j];

        if (!f1 || !f2 || toDelete.has(f1.id) || toDelete.has(f2.id)) continue;

        const intersection = new Set([...f1.atoms].filter((id) => f2.atoms.has(id)));
        const union = new Set([...f1.atoms, ...f2.atoms]);
        const overlap = intersection.size / union.size;

        if (overlap > 0.7) {
          for (const atomId of f2.atoms) {
            f1.atoms.add(atomId);
          }
          toDelete.add(f2.id);
        }
      }
    }

    for (const id of toDelete) {
      this.fields.delete(id);
    }
  }

  private _reinforceConnections(): void {
    for (const edge of this.edges.values()) {
      const fromAtom = this._findAtomUnsafe(edge.from);
      const toAtom = this._findAtomUnsafe(edge.to);

      if (!fromAtom || !toAtom) continue;

      if (fromAtom.temporal.accessCount > 5 && toAtom.temporal.accessCount > 5) {
        edge.dynamicWeight.current = Math.min(1, edge.dynamicWeight.current + 0.1);
      }
    }
  }

  private _findCommonNeighbors(id1: string, id2: string): string[] {
    const neighbors1 = new Set<string>();
    const neighbors2 = new Set<string>();

    for (const edge of this.edges.values()) {
      if (edge.from === id1) neighbors1.add(edge.to);
      if (edge.to === id1) neighbors1.add(edge.from);
      if (edge.from === id2) neighbors2.add(edge.to);
      if (edge.to === id2) neighbors2.add(edge.from);
    }

    return Array.from(neighbors1).filter((id) => neighbors2.has(id));
  }

  private _updateAccessStats(atomIds: string[]): void {
    for (const id of atomIds) {
      const atom = this._findAtomUnsafe(id);
      if (atom) {
        atom.temporal.lastAccessed = Date.now();
        atom.temporal.accessCount++;
      }
    }
  }

  // ========================================================================
  // 持久化
  // ========================================================================

  private persistAtom(atom: EnhancedMemAtom): void {
    try {
      this.vectorStorage.store(atom.id, atom.embedding, {
        content: atom.content.slice(0, 500),
        contentType: atom.contentType,
        importance: atom.strength.current,
        agentId: atom.spatial.agent,
        tags: atom.meta.tags,
      });
      this.stats.savedToDisk++;
    } catch (err) {
      log.error(`Failed to persist atom: ${atom.id.slice(0, 8)}`, err as Record<string, unknown>);
    }
  }

  private async processWriteOperations(operations: WriteOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === "store" && op.atom) {
        this.persistAtom(op.atom as EnhancedMemAtom);
      }
    }
  }

  // ========================================================================
  // 定时任务
  // ========================================================================

  private scheduleNextEvolution(): void {
    if (!this.isRunning) return;

    this.evolveTimer = setTimeout(async () => {
      try {
        await this.evolve();
        this.evolveRetryCount = 0;
      } catch (err) {
        this.evolveRetryCount++;
        log.error(`Evolution failed (${this.evolveRetryCount})`, err as Record<string, unknown>);
      }
      this.scheduleNextEvolution();
    }, this.config.evolutionInterval);
  }

  private startTierTransitionMonitoring(): void {
    this.tierCheckTimer = setInterval(() => {
      this.rwLock
        .withWriteLock(async () => {
          this._checkTierTransitions();
        })
        .catch((err) => {
          log.error(`Tier transition check failed: ${err}`);
        });
    }, this.config.tieredStorage.tierCheckIntervalMs);
  }

  private _checkTierTransitions(): void {
    const now = Date.now();

    // 检查工作记忆降级
    for (const atom of this.workingMemory.values()) {
      const timeInTier = now - atom._tierMeta.enteredTierAt;
      if (timeInTier > 10 * 60 * 1000 && atom._tierMeta.tierAccessCount < 3) {
        this._moveToShortTerm(atom);
      }
    }
  }

  // ========================================================================
  // 系统资源处理
  // ========================================================================

  private handleResourceWarning(resource: string, level: "warning" | "critical"): void {
    log.warn(`Resource warning: ${resource} at ${level} level`);

    if (level === "critical") {
      // 强制清理
      this.rwLock
        .withWriteLock(async () => {
          this._pruneForgotten();
          this._mergeFields();
        })
        .catch(console.error);
    }
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  private calculateDecayRate(contentType: ContentType): number {
    const rates: Record<ContentType, number> = {
      fact: 0.001,
      experience: 0.005,
      insight: 0.002,
      pattern: 0.0005,
      narrative: 0.003,
      intuition: 0.0001,
    };
    return rates[contentType] ?? 0.001;
  }

  private async establishRelations(newAtom: MemAtom): Promise<void> {
    const similar = this._findSimilarWithTier(newAtom.embedding, 10);

    for (const { atom, similarity } of similar) {
      if (atom.id === newAtom.id) continue;

      const edgeId = `${atom.id}-${newAtom.id}`;
      const edge: LivingEdge = {
        id: edgeId,
        from: atom.id,
        to: newAtom.id,
        types: [
          {
            type: "similar",
            weight: similarity,
            confidence: similarity,
            learned: true,
          },
        ],
        dynamicWeight: {
          current: similarity,
          history: [{ timestamp: Date.now(), weight: similarity, trigger: "birth" }],
          trend: "stable",
        },
        activation: {
          lastSpread: 0,
          spreadCount: 0,
          decayFactor: 0.9,
        },
      };

      this.edges.set(edgeId, edge);
    }
  }

  private ensureDirectories(): void {
    const dirs = [this.config.rootDir, join(this.config.rootDir, "vectors")];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private logSystemInfo(): void {
    const resources = this.resourceDetector.getCurrentResources();
    log.info(
      `   Memory: ${(resources.memory.available / 1024 / 1024 / 1024).toFixed(1)} GB available`,
    );
    log.info(`   CPUs: ${resources.cpu.coreCount}`);
    log.info(`   Async write: ${this.config.asyncWrite.enabled ? "enabled" : "disabled"}`);
    log.info(`   Batch loading: ${this.config.batchLoading.enabled ? "enabled" : "disabled"}`);
  }

  // ========================================================================
  // 公共API - 统计和状态
  // ========================================================================

  getStats() {
    const vectorStats = this.vectorStorage.getStats();

    return {
      memory: {
        working: this.workingMemory.size(),
        shortTerm: this.shortTermMemory.size,
        total: this.workingMemory.size() + this.shortTermMemory.size,
      },
      edges: this.edges.size,
      fields: this.fields.size,
      cache: {
        hits: this.stats.cacheHits,
        misses: this.stats.cacheMisses,
        hitRate:
          this.stats.cacheHits + this.stats.cacheMisses > 0
            ? this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)
            : 0,
      },
      storage: vectorStats,
      queue: this.writeQueue.getStatus(),
      resources: this.resourceDetector.getCurrentResources(),
    };
  }

  getConfig(): UnifiedNSEM2Config {
    return { ...this.config };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export async function createUnifiedNSEM2Core(
  cfg: NsemclawConfig,
  agentId: string,
  memoryConfig: ResolvedMemorySearchConfig,
  config?: Partial<UnifiedNSEM2Config>,
): Promise<UnifiedNSEM2Core> {
  return UnifiedNSEM2Core.create(cfg, agentId, memoryConfig, config);
}
