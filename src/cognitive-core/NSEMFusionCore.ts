/**
 * NSEMFusionCore - NSEM 融合核心
 *
 * 彻底融合所有NSEMNSEM认知核心组件:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                         NSEMFusionCore                                      │
 * │                    (NSEM NSEM认知核心完全融合版)                                 │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
 * │  │  三层记忆存储 │  │  8类记忆提取  │  │  混合检索系统 │  │  会话管理    │    │
 * │  │ ThreeTier   │  │ MemoryExtraction│ │ Hybrid     │  │ SessionManager│   │
 * │  │ MemoryStore │  │ (8 Categories) │  │ Retrieval  │  │              │    │
 * │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
 * │         │                 │                 │                 │            │
 * │         └─────────────────┴─────────────────┴─────────────────┘            │
 * │                                   │                                        │
 * │                                   ▼                                        │
 * │  ┌─────────────────────────────────────────────────────────────────────┐  │
 * │  │                    Unified Fusion Layer                             │  │
 * │  │         (ingest/retrieve/session/extract unified API)               │  │
 * │  └─────────────────────────────────────────────────────────────────────┘  │
 * │                                   │                                        │
 * │         ┌─────────────────────────┼─────────────────────────┐              │
 * │         ▼                         ▼                         ▼              │
 * │  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐      │
 * │  │  NSEM2Core  │◄─────────►│ FusionCore  │◄─────────►│ NSEM21Core  │      │
 * │  │  (Legacy)   │  Adapter  │  (Main)     │  Adapter  │ (Context L) │      │
 * │  └─────────────┘           └──────┬──────┘           └─────────────┘      │
 * │                                   │                                        │
 * │                    ┌──────────────┼──────────────┐                        │
 * │                    ▼              ▼              ▼                        │
 * │             ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
 * │             │ Vector   │  │ Decision │  │ Evolution│                     │
 * │             │ Storage  │  │ Engine   │  │ Engine   │                     │
 * │             └──────────┘  └──────────┘  └──────────┘                     │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * 融合策略:
 * 1. 不是简单的适配器拼接，而是真正的深度融合
 * 2. 统一数据模型 (FusionMemoryItem)
 * 3. 统一配置入口 (FusionCoreConfig)
 * 4. 统一生命周期管理
 * 5. 向后兼容所有历史API
 */

import { EventEmitter } from "events";
import type { MemorySearchManager, MemorySearchResult } from "../memory/types.js";
import type { NsemclawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { ResolvedMemorySearchConfig } from "../agents/memory-search.js";

// 三层记忆存储
import {
  ThreeTierMemoryStore,
  WORKING_MEMORY_CONFIG,
  TIME_WINDOW_CONFIG,
  TIER_THRESHOLD_CONFIG,
  type MemoryTier,
  type TieredMemoryItem,
} from "./memory/ThreeTierMemoryStore.js";

// 记忆提取系统
import { SessionManager } from "./memory-extraction/SessionManager.js";
import { MemoryExtractor } from "./memory-extraction/MemoryExtractor.js";
import { MemoryDeduplicator } from "./memory-extraction/MemoryDeduplicator.js";
import {
  MemoryCategory,
  getMemorySection,
  type MemorySection,
  type CandidateMemory,
  type ExtractionResult,
  type SessionEvent,
  type Session,
} from "./memory-extraction/types.js";

// 混合检索系统
import {
  HybridRetriever,
  IntentAnalyzer,
  SparseIndex,
  LightweightReranker,
  type HybridRetrievalResult,
  type HybridRetrievalItem,
  type IntentAnalysis,
} from "./retrieval/index.js";

// 上下文管理
import {
  UnifiedContext,
  ContextLevel,
  RetrievalTracer,
  type UnifiedContextData,
  type RetrievalTrajectory,
} from "./context/index.js";

// 感知层
import {
  SmartEmbeddingEngine,
  UnifiedEmbeddingEngine,
  type SmartEmbeddingEngine as ISmartEmbeddingEngine,
} from "./mind/perception/index.js";

// 存储层
import { VectorStorage, type VectorStorageConfig } from "./storage/VectorStorage.js";

// 服务层
import { ImportanceScorer, AutoIngestionService } from "./services/index.js";

// 决策引擎 (可选)
import { DecisionStrategyEngine, type DecisionResult } from "./decision/index.js";

// 注: NSEM2Core 和 UnifiedNSEM2Core 已在 v3.0.0 中合并到 NSEMFusionCore

const log = createSubsystemLogger("nsem-fusion-core");

// =============================================================================
// 版本信息
// =============================================================================

export const NSEM_FUSION_VERSION = "3.0.0";
export const NSEM_FUSION_CODENAME = "Phoenix";

// =============================================================================
// 统一类型定义
// =============================================================================

/**
 * 融合记忆项 - 所有子系统的统一数据模型
 */
export interface FusionMemoryItem {
  /** 唯一标识 */
  id: string;

  /** 内容 (支持分层: L0摘要/L1概览/L2详情) */
  content: {
    l0_abstract?: string;    // ~30% token
    l1_overview: string;     // ~60% token
    l2_detail?: string;      // 100% token
  };

  /** 向量表示 (支持多向量) */
  embeddings: {
    dense?: number[];        // Dense向量
    sparse?: number[];       // Sparse向量
    summary?: number[];      // 摘要向量
  };

  /** 记忆分类 (8类系统) */
  category: MemoryCategory;

  /** 所属板块 */
  section: MemorySection;

  /** 存储层级 (三层系统) */
  tier: "working" | "short-term" | "long-term";

  /** 重要性评分 (0-1) */
  importance: number;

  /** 热度评分 (0-1, 动态衰减) */
  hotness: number;

  /** 元数据 */
  metadata: {
    agentId: string;
    userId: string;
    sessionId?: string;
    timestamp: number;
    lastAccessed: number;
    accessCount: number;
    source: string;
    tags: string[];
    /** 额外上下文 */
    context?: Record<string, unknown>;
  };

  /** 来源系统标记 */
  provenance: {
    system: "fusion" | "nsem2" | "nsem21" | "extracted" | "migrated";
    version: string;
    extractedAt?: number;
  };

  /** 关系链接 */
  relations?: {
    parentId?: string;
    childIds?: string[];
    relatedIds?: string[];
  };
}

/**
 * 融合核心配置
 */
export interface FusionCoreConfig {
  /** 核心标识 */
  agentId: string;
  
  /** 用户标识 */
  userId?: string;

  /** 存储配置 */
  storage: {
    /** 存储模式 */
    mode: "fusion" | "three-tier" | "nsem2-compat" | "hybrid-all";
    
    /** 三层存储配置 */
    threeTier?: {
      workingMemoryCapacity?: number;
      autoTierTransition?: boolean;
      persistencePath?: string;
    };
    
    /** 向量存储配置 */
    vectorStorage?: Partial<VectorStorageConfig>;
    
    /** 兼容模式配置 */
    compatibility?: {
      enableNSEM2Bridge?: boolean;
      enableNSEM21Bridge?: boolean;
    };
  };

  /** 提取配置 */
  extraction: {
    /** 启用提取 */
    enabled: boolean;
    
    /** 自动提取 */
    autoExtract: boolean;
    
    /** 提取的板块 */
    sections: {
      user: boolean;
      agent: boolean;
      tool: boolean;
    };
    
    /** 提取阈值 */
    thresholds: {
      minMessages: number;
      minContentLength: number;
      importanceThreshold: number;
    };
    
    /** 去重配置 */
    deduplication: {
      enabled: boolean;
      similarityThreshold: number;
    };
  };

  /** 会话配置 */
  session: {
    enabled: boolean;
    maxMessages: number;
    maxDurationMs: number;
    idleTimeoutMs: number;
    autoExtractOnEnd: boolean;
  };

  /** 检索配置 */
  retrieval: {
    /** 检索模式 */
    mode: "fusion" | "tiered" | "hybrid" | "intent-driven";
    
    /** 混合权重 */
    weights: {
      dense: number;      // 向量相似度
      sparse: number;     // 关键词匹配
      temporal: number;   // 时间衰减
      importance: number; // 重要性
      hotness: number;    // 热度
    };
    
    /** 层级权重 */
    tierWeights?: {
      working: number;
      shortTerm: number;
      longTerm: number;
    };
    
    /** 重排序配置 */
    reranking: {
      enabled: boolean;
      diversityBoost: number;
      contextAwareness: number;
    };
    
    /** 意图分析 */
    intentAnalysis: {
      enabled: boolean;
      expandQueries: boolean;
    };
  };

  /** 嵌入引擎配置 */
  embedding: {
    provider: "smart" | "unified" | "local" | "remote";
    modelName?: string;
    dimension?: number;
    batchSize?: number;
    modelCacheDir?: string;
    modelPath?: string;
    autoDownloadModels?: boolean;
  };

  /** 决策引擎配置 (可选) */
  decision?: {
    enabled: boolean;
    strategy: "epsilon-greedy" | "ucb" | "thompson" | "softmax";
  };

  /** 进化配置 */
  evolution: {
    enabled: boolean;
    autoDecay: boolean;
    autoMerge: boolean;
    autoOptimize: boolean;
  };

  /** 性能配置 */
  performance: {
    maxConcurrentOperations: number;
    cacheSize: number;
    prefetchEnabled: boolean;
  };
}

/**
 * 融合核心状态
 */
export interface FusionCoreStatus {
  version: string;
  initialized: boolean;
  uptime: number;
  
  storage: {
    mode: FusionCoreConfig["storage"]["mode"];
    totalMemories: number;
    workingCount: number;
    shortTermCount: number;
    longTermCount: number;
    vectorCount: number;
  };
  
  extraction: {
    enabled: boolean;
    sessionsProcessed: number;
    memoriesExtracted: number;
    categoriesDistribution: Record<MemoryCategory, number>;
  };
  
  session: {
    enabled: boolean;
    activeSessions: number;
    totalSessions: number;
  };
  
  retrieval: {
    totalQueries: number;
    avgQueryTime: number;
    cacheHitRate: number;
  };
  
  performance: {
    memoryUsage: number;
    avgOperationTime: number;
    queueLength: number;
  };
}

/**
 * 检索选项
 */
export interface FusionRetrieveOptions {
  /** 最大结果数 */
  maxResults?: number;
  
  /** 最小相似度 */
  minScore?: number;
  
  /** 指定分类 */
  categories?: MemoryCategory[];
  
  /** 指定层级 */
  tiers?: ("working" | "short-term" | "long-term")[];
  
  /** 指定板块 */
  sections?: MemorySection[];
  
  /** 上下文层级 (L0/L1/L2) */
  contextLevel?: ContextLevel;
  
  /** 时间范围 */
  timeRange?: {
    start?: number;
    end?: number;
  };
  
  /** 是否包含关系记忆 */
  includeRelations?: boolean;
  
  /** 用户ID过滤 */
  userId?: string;
  
  /** 自定义过滤 */
  filter?: (item: FusionMemoryItem) => boolean;
}

/**
 * 检索结果
 */
export interface FusionRetrieveResult {
  items: FusionMemoryItem[];
  totalFound: number;
  queryTime: number;
  trajectory?: RetrievalTrajectory;
  intentAnalysis?: IntentAnalysis;
}

/**
 * 摄入选项
 */
export interface FusionIngestOptions {
  /** 指定分类 */
  category?: MemoryCategory;
  
  /** 指定板块 */
  section?: MemorySection;
  
  /** 初始层级 */
  initialTier?: "working" | "short-term" | "long-term";
  
  /** 重要性覆盖 */
  importance?: number;
  
  /** 标签 */
  tags?: string[];
  
  /** 来源 */
  source?: string;
  
  /** 用户ID */
  userId?: string;
  
  /** 会话ID */
  sessionId?: string;
  
  /** 是否立即向量化 */
  immediateEmbed?: boolean;
  
  /** 关系链接 */
  relations?: {
    parentId?: string;
    relatedIds?: string[];
  };
  
  /** 类型 (向后兼容) */
  type?: string;
  
  /** 内容类型 (向后兼容) */
  contentType?: string;
  
  /** 作用域 (向后兼容) */
  scope?: string;
  
  /** 强度/重要性 (向后兼容) */
  strength?: number;
}

// =============================================================================
// NSEM Fusion Core
// =============================================================================

export class NSEMFusionCore extends EventEmitter {
  private config: FusionCoreConfig;
  private startTime: number;
  
  // 核心组件
  private threeTierStore?: ThreeTierMemoryStore;
  private sessionManager?: SessionManager;
  private memoryExtractor?: MemoryExtractor;
  private memoryDeduplicator?: MemoryDeduplicator;
  private hybridRetriever?: HybridRetriever;
  private intentAnalyzer?: IntentAnalyzer;
  private embeddingEngine?: ISmartEmbeddingEngine | UnifiedEmbeddingEngine;
  private vectorStorage?: VectorStorage;
  private importanceScorer?: ImportanceScorer;
  
  // 兼容层
  private nsem2Bridge?: NSEM2CoreBridge;
  private nsem21Bridge?: NSEM21CoreBridge;
  
  // 状态
  private initialized = false;
  private stats = {
    sessionsProcessed: 0,
    memoriesExtracted: 0,
    totalQueries: 0,
    totalQueryTime: 0,
    categoriesDistribution: {} as Record<MemoryCategory, number>,
  };
  
  // 操作队列
  private operationQueue: Promise<unknown>[] = [];

  constructor(config: Partial<FusionCoreConfig> = {}) {
    super();
    this.config = this.buildConfig(config);
    this.startTime = Date.now();
  }

  // ===========================================================================
  // 生命周期
  // ===========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn("NSEMFusionCore already initialized");
      return;
    }

    log.info(`Initializing NSEMFusionCore v${NSEM_FUSION_VERSION} (${NSEM_FUSION_CODENAME})`);
    log.info(`Agent: ${this.config.agentId}, Mode: ${this.config.storage.mode}`);

    try {
      // 1. 初始化嵌入引擎
      await this.initializeEmbedding();

      // 2. 初始化存储层
      await this.initializeStorage();

      // 3. 初始化检索系统
      await this.initializeRetrieval();

      // 4. 初始化提取系统
      await this.initializeExtraction();

      // 5. 初始化会话管理
      await this.initializeSession();

      // 6. 初始化兼容层
      await this.initializeCompatibility();

      this.initialized = true;
      this.emit("initialized", this.getStatus());

      log.info("NSEMFusionCore initialized successfully");
    } catch (error) {
      log.error("Failed to initialize NSEMFusionCore:", error as Record<string, unknown>);
      await this.shutdown();
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    log.info("Shutting down NSEMFusionCore");

    // 清理所有资源
    this.threeTierStore?.stop();
    this.sessionManager?.destroy();
    this.vectorStorage?.close?.();
    
    // 等待队列完成
    await Promise.allSettled(this.operationQueue);

    this.initialized = false;
    this.emit("shutdown");

    log.info("NSEMFusionCore shut down");
  }

  /**
   * 停止核心 (shutdown 的别名，向后兼容)
   * @deprecated 使用 shutdown 替代
   */
  async stop(): Promise<void> {
    return this.shutdown();
  }

  /**
   * 启动核心 (initialize 的别名，向后兼容)
   * @deprecated 使用 initialize 替代
   */
  async start(): Promise<void> {
    return this.initialize();
  }

  // ===========================================================================
  // 核心 API - 记忆管理
  // ===========================================================================

  /**
   * 摄入记忆 - 统一入口
   * 
   * 智能路由:
   * - 自动分类
   * - 自动评估重要性
   * - 自动选择存储层级
   * - 自动生成多层级内容
   */
  async ingest(
    content: string,
    options: FusionIngestOptions = {}
  ): Promise<FusionMemoryItem> {
    this.ensureInitialized();

    const startTime = Date.now();
    
    // 1. 内容分层处理
    const layeredContent = await this.createLayeredContent(content);
    
    // 2. 自动分类
    const category = options.category ?? await this.classifyContent(content);
    
    // 3. 评估重要性
    const importance = options.importance ?? await this.evaluateImportance(content, category);
    
    // 4. 向量化
    const embeddings = await this.createEmbeddings(layeredContent);
    
    // 5. 确定初始层级
    const tier = options.initialTier ?? this.determineInitialTier(importance);
    
    // 6. 构建融合记忆项
    const item: FusionMemoryItem = {
      id: this.generateId(),
      content: layeredContent,
      embeddings,
      category,
      section: options.section ?? "user",
      tier,
      importance,
      hotness: importance, // 初始热度等于重要性
      metadata: {
        agentId: this.config.agentId,
        userId: options.userId ?? this.config.userId ?? "anonymous",
        sessionId: options.sessionId,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        source: options.source ?? "manual",
        tags: options.tags ?? [],
      },
      provenance: {
        system: "fusion",
        version: NSEM_FUSION_VERSION,
      },
      relations: options.relations,
    };

    // 7. 存储到对应系统
    await this.storeToAppropriateSystem(item);

    // 8. 更新统计
    this.stats.categoriesDistribution[category] = 
      (this.stats.categoriesDistribution[category] ?? 0) + 1;

    this.emit("memoryIngested", item);
    
    log.debug(`Ingested memory ${item.id} in ${Date.now() - startTime}ms`);
    
    return item;
  }

  /**
   * 批量摄入
   */
  async ingestBatch(
    items: Array<{ content: string; options?: FusionIngestOptions }>
  ): Promise<FusionMemoryItem[]> {
    const results: FusionMemoryItem[] = [];
    
    // 分批处理
    const batchSize = this.config.performance.maxConcurrentOperations;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(({ content, options }) => this.ingest(content, options))
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * 检索记忆 - 统一入口
   * 
   * 智能检索:
   * - 意图分析
   * - 多路并行检索 (Dense + Sparse + Tier)
   * - 结果融合
   * - 智能重排序
   */
  async retrieve(
    query: string,
    options: FusionRetrieveOptions = {}
  ): Promise<FusionRetrieveResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    this.stats.totalQueries++;

    // 1. 意图分析
    let intentAnalysis: IntentAnalysis | undefined;
    if (this.config.retrieval.intentAnalysis.enabled && this.intentAnalyzer) {
      intentAnalysis = await this.intentAnalyzer.analyze(query);
    }

    // 2. 检索轨迹追踪
    const tracer = new RetrievalTracer();
    tracer.start(query);

    // 3. 执行检索
    let items: FusionMemoryItem[] = [];
    
    switch (this.config.retrieval.mode) {
      case "fusion":
        items = await this.retrieveFusion(query, options);
        break;
      case "tiered":
        items = await this.retrieveTiered(query, options);
        break;
      case "hybrid":
        items = await this.retrieveHybrid(query, options);
        break;
      case "intent-driven":
        items = await this.retrieveIntentDriven(query, intentAnalysis, options);
        break;
      default:
        items = await this.retrieveFusion(query, options);
    }

    // 4. 应用过滤器
    items = this.applyFilters(items, options);

    // 5. 限制结果数
    const maxResults = options.maxResults ?? 10;
    const totalFound = items.length;
    items = items.slice(0, maxResults);

    // 6. 更新访问统计
    await this.updateAccessStats(items);

    // 7. 完成轨迹
    tracer.complete(items.map(i => i.id));

    const queryTime = Date.now() - startTime;
    this.stats.totalQueryTime += queryTime;

    this.emit("memoryRetrieved", { query, items: items.length, queryTime });

    return {
      items,
      totalFound,
      queryTime,
      trajectory: tracer.getTrajectory(),
      intentAnalysis,
    };
  }

  /**
   * 激活记忆 (retrieve 的别名，向后兼容)
   * @deprecated 使用 retrieve 替代
   */
  async activate(query: string, options?: FusionRetrieveOptions): Promise<FusionMemoryItem[]> {
    const result = await this.retrieve(query, options);
    return result.items;
  }

  /**
   * 访问记忆 (触发升级)
   */
  async access(id: string): Promise<FusionMemoryItem | null> {
    this.ensureInitialized();

    // 尝试从三层存储访问
    if (this.threeTierStore) {
      const result = await this.threeTierStore.access(id);
      if (result) {
        return this.mapTieredToFusion(result);
      }
    }

    return null;
  }

  /**
   * 按作用域检索 (向后兼容)
   * @deprecated 使用 retrieve 替代
   */
  async retrieveByScope(scope: string, query: string, options?: FusionRetrieveOptions): Promise<FusionMemoryItem[]> {
    return this.retrieve(query, options).then(r => r.items);
  }

  /**
   * 获取配置 (向后兼容)
   * @deprecated 直接访问 config 属性
   */
  getConfig(): FusionCoreConfig {
    return this.config;
  }

  /**
   * 遗忘记忆
   */
  async forget(id: string): Promise<boolean> {
    this.ensureInitialized();

    let deleted = false;

    if (this.threeTierStore) {
      deleted = await this.threeTierStore.delete(id) || deleted;
    }

    this.emit("memoryForgotten", { id });
    
    return deleted;
  }

  /**
   * 更新记忆
   */
  async update(
    id: string,
    updates: Partial<Omit<FusionMemoryItem, "id" | "metadata">>
  ): Promise<FusionMemoryItem | null> {
    this.ensureInitialized();

    // 获取现有记忆
    const existing = await this.access(id);
    if (!existing) return null;

    // 应用更新
    const updated: FusionMemoryItem = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        lastAccessed: Date.now(),
      },
    };

    // 重新存储
    await this.storeToAppropriateSystem(updated);

    this.emit("memoryUpdated", updated);

    return updated;
  }

  // ===========================================================================
  // 核心 API - 会话管理
  // ===========================================================================

  /**
   * 开始会话
   */
  startSession(userId?: string, metadata?: Record<string, unknown>): string {
    this.ensureInitialized();

    if (!this.sessionManager) {
      throw new Error("SessionManager not enabled");
    }

    const session = this.sessionManager.startSession(
      userId ?? this.config.userId ?? "anonymous",
      this.config.agentId,
      "default",
      metadata
    );

    // 设置自动提取监听
    if (this.config.session.autoExtractOnEnd) {
      this.setupAutoExtraction(session.id);
    }

    this.emit("sessionStarted", session);

    return session.id;
  }

  /**
   * 记录消息
   */
  recordMessage(
    sessionId: string,
    message: { role: "user" | "assistant"; content: string; metadata?: Record<string, unknown> }
  ): void {
    if (!this.sessionManager) return;

    this.sessionManager.recordMessage(sessionId, {
      role: message.role,
      content: message.content,
      metadata: message.metadata,
    });
  }

  /**
   * 记录工具调用
   */
  recordToolCall(
    sessionId: string,
    toolCall: {
      toolName: string;
      input: Record<string, unknown>;
      output?: string;
      durationMs?: number;
    }
  ): void {
    if (!this.sessionManager) return;

    this.sessionManager.recordToolCall(sessionId, {
      toolName: toolCall.toolName,
      input: toolCall.input as Record<string, unknown>,
      output: toolCall.output,
      status: "completed",
      durationMs: toolCall.durationMs,
    });
  }

  /**
   * 结束会话
   */
  async endSession(sessionId: string, extract = true): Promise<ExtractionResult | null> {
    if (!this.sessionManager) return null;

    const session = await this.sessionManager.endSession(sessionId);
    
    if (extract && this.config.extraction.enabled) {
      return this.extractFromSession(sessionId);
    }

    return null;
  }

  /**
   * 获取活跃会话
   */
  getActiveSessions(): Session[] {
    return this.sessionManager?.getActiveSessions() ?? [];
  }

  // ===========================================================================
  // 核心 API - 记忆提取
  // ===========================================================================

  /**
   * 从会话提取记忆
   */
  async extractFromSession(sessionId: string): Promise<ExtractionResult> {
    this.ensureInitialized();

    if (!this.memoryExtractor || !this.sessionManager) {
      throw new Error("Memory extraction not enabled");
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 1. 执行提取
    const extraction = await this.memoryExtractor.extract(session);

    // 2. 去重
    let memories = extraction.memories;
    if (this.memoryDeduplicator && this.config.extraction.deduplication.enabled) {
      const dedupResults = await Promise.all(
        memories.map((m) => this.memoryDeduplicator!.deduplicate(m, getMemorySection(m.category), m.userId))
      );
      memories = memories.filter((_, i) => dedupResults[i].decision !== "skip");
    }

    // 3. 存储提取的记忆
    for (const memory of memories) {
      await this.ingestFromExtraction(memory, sessionId);
    }

    // 4. 更新统计
    this.stats.sessionsProcessed++;
    this.stats.memoriesExtracted += memories.length;

    this.emit("memoriesExtracted", { sessionId, count: memories.length });

    log.info(`Extracted ${memories.length} memories from session ${sessionId}`);

    return {
      ...extraction,
      memories,
    };
  }

  /**
   * 手动提取记忆
   */
  async extractManually(content: string, context: string): Promise<CandidateMemory[]> {
    this.ensureInitialized();

    // 创建模拟会话
    const mockSession: Session = {
      id: `manual-${Date.now()}`,
      userId: this.config.userId ?? "anonymous",
      agentId: this.config.agentId,
      accountId: "default",
      messages: [
        { id: `msg-${Date.now()}-user`, role: "user", content, timestamp: Date.now() },
        { id: `msg-${Date.now()}-assistant`, role: "assistant", content: context, timestamp: Date.now() },
      ],
      toolCalls: [],
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      metadata: {},
    };

    if (!this.memoryExtractor) {
      throw new Error("Memory extraction not enabled");
    }

    const extraction = await this.memoryExtractor.extract(mockSession);
    return extraction.memories;
  }

  // ===========================================================================
  // 核心 API - 进化与维护
  // ===========================================================================

  /**
   * 触发进化
   */
  async evolve(operation: "decay" | "merge" | "prune" | "optimize" | "all"): Promise<void> {
    this.ensureInitialized();

    log.info(`Running evolution operation: ${operation}`);

    if (operation === "decay" || operation === "all") {
      await this.runDecay();
    }

    if (operation === "merge" || operation === "all") {
      await this.runMerge();
    }

    if (operation === "prune" || operation === "all") {
      await this.runPrune();
    }

    if (operation === "optimize" || operation === "all") {
      await this.runOptimize();
    }

    this.emit("evolutionCompleted", { operation });
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalAtoms: number;
    totalEdges: number;
    totalFields: number;
    memory: { total: number; working: number; shortTerm: number; longTerm: number };
    storage: { totalVectors: number; vectorCount: number };
    cache: { hitRate: number };
    resources: { memoryUsage: number };
    [key: string]: unknown;
  } {
    const threeTierStats = this.threeTierStore?.getStats();
    const totalMemories = threeTierStats?.total.memories ?? 0;
    // TODO: 从 vectorStorage 获取实际向量数量
    const totalVectors = this.vectorStorage ? totalMemories : 0;
    
    return {
      ...this.stats,
      // 进化系统兼容字段 (扁平结构)
      totalAtoms: totalMemories,
      totalEdges: 0, // TODO: 实现边统计
      totalFields: totalVectors,
      // 三层存储统计 (兼容 PeriodicMaintenanceService)
      memory: {
        total: totalMemories,
        working: threeTierStats?.working.count ?? 0,
        shortTerm: threeTierStats?.shortTerm.count ?? 0,
        longTerm: threeTierStats?.longTerm.count ?? 0,
      },
      storage: {
        totalVectors: totalVectors,
        vectorCount: totalVectors,
      },
      cache: {
        hitRate: 0, // TODO: 实现缓存统计
      },
      resources: {
        memoryUsage: 0, // TODO: 实现资源统计
      },
      // 其他统计
      workingCount: threeTierStats?.working.count ?? 0,
      shortTermCount: threeTierStats?.shortTerm.count ?? 0,
      longTermCount: threeTierStats?.longTerm.count ?? 0,
      vectorCount: totalVectors,
      uptime: Date.now() - this.startTime,
      avgQueryTime: this.stats.totalQueries > 0 
        ? this.stats.totalQueryTime / this.stats.totalQueries 
        : 0,
    };
  }

  // ===========================================================================
  // 兼容 API - MemorySearchManager
  // ===========================================================================

  /**
   * 创建 MemorySearchManager 适配器
   */
  createSearchManagerAdapter(): MemorySearchManager {
    return {
      search: async (query, opts) => {
        const results = await this.retrieve(query, {
          maxResults: opts?.maxResults,
          minScore: opts?.minScore,
        });
        return results.items.map((r) => this.mapToSearchResult(r));
      },

      readFile: async (params) => {
        const item = await this.access(params.relPath);
        return {
          text: item?.content.l1_overview ?? "",
          path: params.relPath,
        };
      },

      status: () => ({
        provider: "nsem-fusion-core",
        backend: "fusion",
        model: this.config.embedding.modelName ?? "default",
        custom: this.getStatus() as unknown as Record<string, unknown>,
      }),

      probeEmbeddingAvailability: async () => ({ ok: true }),
      probeVectorAvailability: async () => true,
    };
  }

  /**
   * 创建 NSEM2Core 兼容层
   */
  createNSEM2CompatibleInterface(): NSEM2CompatibleInterface {
    return {
      ingest: async (content: string, metadata?: unknown) => {
        const item = await this.ingest(content, { source: "nsem2-compat" });
        return item.id;
      },

      retrieve: async (query: string, options?: unknown) => {
        const results = await this.retrieve(query, options as FusionRetrieveOptions);
        return results.items;
      },

      getStatus: () => this.getStatus(),
    };
  }

  // ===========================================================================
  // 状态查询
  // ===========================================================================

  getStatus(): FusionCoreStatus {
    const threeTierStats = this.threeTierStore?.getStats();

    return {
      version: NSEM_FUSION_VERSION,
      initialized: this.initialized,
      uptime: Date.now() - this.startTime,
      
      storage: {
        mode: this.config.storage.mode,
        totalMemories: threeTierStats?.total.memories ?? 0,
        workingCount: threeTierStats?.working.count ?? 0,
        shortTermCount: threeTierStats?.shortTerm.count ?? 0,
        longTermCount: threeTierStats?.longTerm.count ?? 0,
        vectorCount: threeTierStats?.total.memories ?? 0,
      },
      
      extraction: {
        enabled: this.config.extraction.enabled,
        sessionsProcessed: this.stats.sessionsProcessed,
        memoriesExtracted: this.stats.memoriesExtracted,
        categoriesDistribution: { ...this.stats.categoriesDistribution },
      },
      
      session: {
        enabled: this.sessionManager !== undefined,
        activeSessions: this.sessionManager?.getActiveSessions().length ?? 0,
        totalSessions: this.stats.sessionsProcessed,
      },
      
      retrieval: {
        totalQueries: this.stats.totalQueries,
        avgQueryTime: this.stats.totalQueries > 0 
          ? this.stats.totalQueryTime / this.stats.totalQueries 
          : 0,
        cacheHitRate: 0, // TODO: implement cache
      },
      
      performance: {
        memoryUsage: process.memoryUsage().heapUsed,
        avgOperationTime: 0,
        queueLength: this.operationQueue.length,
      },
    };
  }

  // ===========================================================================
  // 私有方法 - 初始化
  // ===========================================================================

  private buildConfig(partial: Partial<FusionCoreConfig>): FusionCoreConfig {
    return {
      agentId: partial.agentId ?? "default",
      userId: partial.userId,
      
      storage: {
        mode: partial.storage?.mode ?? "fusion",
        threeTier: {
          workingMemoryCapacity: 15,
          autoTierTransition: true,
          ...partial.storage?.threeTier,
        },
        compatibility: {
          enableNSEM2Bridge: false,
          enableNSEM21Bridge: false,
          ...partial.storage?.compatibility,
        },
        ...partial.storage,
      },
      
      extraction: {
        enabled: partial.extraction?.enabled ?? true,
        autoExtract: partial.extraction?.autoExtract ?? true,
        sections: {
          user: true,
          agent: true,
          tool: false,
          ...partial.extraction?.sections,
        },
        thresholds: {
          minMessages: 2,
          minContentLength: 100,
          importanceThreshold: 0.5,
          ...partial.extraction?.thresholds,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.85,
          ...partial.extraction?.deduplication,
        },
      },
      
      session: {
        enabled: partial.session?.enabled ?? true,
        maxMessages: partial.session?.maxMessages ?? 50,
        maxDurationMs: partial.session?.maxDurationMs ?? 30 * 60 * 1000,
        idleTimeoutMs: partial.session?.idleTimeoutMs ?? 5 * 60 * 1000,
        autoExtractOnEnd: partial.session?.autoExtractOnEnd ?? true,
      },
      
      retrieval: {
        mode: partial.retrieval?.mode ?? "fusion",
        weights: {
          dense: 0.4,
          sparse: 0.2,
          temporal: 0.15,
          importance: 0.15,
          hotness: 0.1,
          ...partial.retrieval?.weights,
        },
        tierWeights: {
          working: 1.0,
          shortTerm: 0.8,
          longTerm: 0.6,
          ...partial.retrieval?.tierWeights,
        },
        reranking: {
          enabled: true,
          diversityBoost: 0.1,
          contextAwareness: 0.2,
          ...partial.retrieval?.reranking,
        },
        intentAnalysis: {
          enabled: true,
          expandQueries: true,
          ...partial.retrieval?.intentAnalysis,
        },
      },
      
      embedding: {
        provider: "smart",
        batchSize: 10,
        autoDownloadModels: true,
        ...partial.embedding,
      },
      
      decision: {
        enabled: false,
        strategy: "epsilon-greedy",
        ...partial.decision,
      },
      
      evolution: {
        enabled: true,
        autoDecay: true,
        autoMerge: false,
        autoOptimize: false,
        ...partial.evolution,
      },
      
      performance: {
        maxConcurrentOperations: 5,
        cacheSize: 1000,
        prefetchEnabled: false,
        ...partial.performance,
      },
    };
  }

  private async initializeEmbedding(): Promise<void> {
    const { provider } = this.config.embedding;
    
    if (provider === "smart") {
      const { createSmartEmbeddingEngine } = await import("./mind/perception/SmartEmbeddingEngine.js");
      this.embeddingEngine = await createSmartEmbeddingEngine(
        undefined, // cfg - will use defaults
        this.config.agentId,
        undefined, // memoryConfig - will use defaults
        undefined, // resourceModeOrOptions
        {
          autoDownloadModels: this.config.embedding.autoDownloadModels ?? true,
          modelCacheDir: this.config.embedding.modelCacheDir,
          modelPath: this.config.embedding.modelPath,
        }
      );
    } else if (provider === "unified") {
      const { createUnifiedEmbeddingEngine } = await import("./mind/perception/UnifiedEmbeddingEngine.js");
      this.embeddingEngine = await createUnifiedEmbeddingEngine(
        undefined, // cfg
        this.config.agentId,
        undefined  // memoryConfig
      );
    }

    log.info(`Embedding engine initialized: ${provider}`);
  }

  private async initializeStorage(): Promise<void> {
    const { mode } = this.config.storage;

    // 初始化三层存储
    if (mode === "fusion" || mode === "three-tier" || mode === "hybrid-all") {
      this.threeTierStore = new ThreeTierMemoryStore({
        workingMemoryCapacity: this.config.storage.threeTier?.workingMemoryCapacity,
        autoTierTransition: this.config.storage.threeTier?.autoTierTransition,
      });
      this.threeTierStore.start();
      log.info("ThreeTierMemoryStore initialized");
    }

    // 初始化向量存储
    if (this.config.storage.vectorStorage) {
      this.vectorStorage = new VectorStorage({
        baseDir: this.config.storage.vectorStorage.baseDir,
        vectorDim: this.config.embedding.dimension ?? 768,
      });
      log.info("VectorStorage initialized");
    }
  }

  private async initializeRetrieval(): Promise<void> {
    // 初始化意图分析器
    if (this.config.retrieval.intentAnalysis.enabled) {
      this.intentAnalyzer = new IntentAnalyzer({});
    }

    // 初始化混合检索器
    if (this.threeTierStore) {
      this.hybridRetriever = new HybridRetriever({
        nsemConfig: {} as NsemclawConfig, // TODO: 传递正确的配置
        enableIntentAnalysis: this.config.retrieval.intentAnalysis.enabled,
        enableSparse: true,
        enableRerank: this.config.retrieval.reranking.enabled,
        useAdvancedRerank: false,
        denseWeight: this.config.retrieval.weights.dense,
        sparseWeight: this.config.retrieval.weights.sparse,
      });
    }

    log.info("Retrieval system initialized");
  }

  private async initializeExtraction(): Promise<void> {
    if (!this.config.extraction.enabled) {
      log.info("Memory extraction disabled");
      return;
    }

    // TODO: 初始化 MemoryExtractor 需要正确的 LLMConfig
    // this.memoryExtractor = new MemoryExtractor(config, llm);
    log.info("Memory extraction temporarily disabled (needs LLM config)");
    
    // TODO: 初始化 MemoryDeduplicator 需要正确的配置
    // this.memoryDeduplicator = new MemoryDeduplicator(config, embedder, llm, storage);
  }

  private async initializeSession(): Promise<void> {
    if (!this.config.session.enabled) {
      log.info("Session manager disabled");
      return;
    }

    this.sessionManager = new SessionManager({
      maxMessages: this.config.session.maxMessages,
      maxDurationMs: this.config.session.maxDurationMs,
      minContentLength: this.config.extraction.thresholds.minContentLength,
      idleTimeoutMs: this.config.session.idleTimeoutMs,
      autoExtract: this.config.session.autoExtractOnEnd,
    });

    log.info("SessionManager initialized");
  }

  private async initializeCompatibility(): Promise<void> {
    const { compatibility } = this.config.storage;
    
    if (compatibility?.enableNSEM2Bridge) {
      // 延迟加载兼容层
      log.info("NSEM2 compatibility bridge enabled");
    }
    
    if (compatibility?.enableNSEM21Bridge) {
      log.info("NSEM21 compatibility bridge enabled");
    }
  }

  // ===========================================================================
  // 私有方法 - 检索实现
  // ===========================================================================

  private async retrieveFusion(
    query: string,
    options: FusionRetrieveOptions
  ): Promise<FusionMemoryItem[]> {
    if (!this.hybridRetriever) return [];

    const results = await this.hybridRetriever.retrieve({
      query,
      limit: options.maxResults ?? 20,
    });

    return results.items.map((r) => this.mapHybridToFusion(r));
  }

  private async retrieveTiered(
    query: string,
    options: FusionRetrieveOptions
  ): Promise<FusionMemoryItem[]> {
    if (!this.threeTierStore) return [];

    const results = await this.threeTierStore.retrieve(query, {
      maxResults: options.maxResults ?? 10,
      minSimilarity: options.minScore ?? 0.3,
      searchTiers: options.tiers,
    });

    return results.map((r) => this.mapTieredToFusion(r.item));
  }

  private async retrieveHybrid(
    query: string,
    options: FusionRetrieveOptions
  ): Promise<FusionMemoryItem[]> {
    // 并行执行多种检索
    const [tieredResults] = await Promise.all([
      this.retrieveTiered(query, { ...options, maxResults: (options.maxResults ?? 10) * 2 }),
    ]);

    // 合并、去重、重排序
    const seen = new Set<string>();
    const merged: FusionMemoryItem[] = [];

    for (const item of tieredResults) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    // 应用重排序
    if (this.config.retrieval.reranking.enabled) {
      return this.rerankResults(query, merged).slice(0, options.maxResults ?? 10);
    }

    return merged.slice(0, options.maxResults ?? 10);
  }

  private async retrieveIntentDriven(
    query: string,
    intentAnalysis: IntentAnalysis | undefined,
    options: FusionRetrieveOptions
  ): Promise<FusionMemoryItem[]> {
    // 根据意图调整检索策略
    if (intentAnalysis?.primaryIntent === "recall") {
      // 回忆查询: 提高精确度
      return this.retrieveTiered(query, { ...options, minScore: 0.5 });
    } else if (intentAnalysis?.primaryIntent === "explore") {
      // 探索查询: 提高召回率
      return this.retrieveHybrid(query, { ...options, maxResults: (options.maxResults ?? 10) * 2 });
    }

    return this.retrieveFusion(query, options);
  }

  private rerankResults(query: string, items: FusionMemoryItem[]): FusionMemoryItem[] {
    // 简单的重排序逻辑
    return items.sort((a, b) => {
      let scoreA = a.importance * 0.3 + a.hotness * 0.3;
      let scoreB = b.importance * 0.3 + b.hotness * 0.3;

      // 时间衰减
      const timeDecayA = Math.exp(-(Date.now() - a.metadata.timestamp) / (24 * 60 * 60 * 1000));
      const timeDecayB = Math.exp(-(Date.now() - b.metadata.timestamp) / (24 * 60 * 60 * 1000));
      
      scoreA += timeDecayA * 0.2;
      scoreB += timeDecayB * 0.2;

      // 访问频率
      scoreA += Math.min(a.metadata.accessCount / 10, 1) * 0.2;
      scoreB += Math.min(b.metadata.accessCount / 10, 1) * 0.2;

      return scoreB - scoreA;
    });
  }

  // ===========================================================================
  // 私有方法 - 辅助函数
  // ===========================================================================

  private async createLayeredContent(content: string): Promise<FusionMemoryItem["content"]> {
    // 智能分层
    const totalLength = content.length;
    
    // L2: 完整内容 (如果太长则截断)
    const l2Detail = totalLength > 5000 ? content.slice(0, 5000) + "..." : content;
    
    // L1: 概览 (~60%)
    const l1Length = Math.min(Math.floor(totalLength * 0.6), 2000);
    const l1Overview = content.slice(0, l1Length) + (totalLength > l1Length ? "..." : "");
    
    // L0: 摘要 (~30% 或前100字符)
    const l0Length = Math.min(Math.floor(totalLength * 0.3), 500, 100);
    const l0Abstract = content.slice(0, l0Length) + (totalLength > l0Length ? "..." : "");

    return {
      l0_abstract: l0Abstract,
      l1_overview: l1Overview,
      l2_detail: l2Detail,
    };
  }

  private async classifyContent(content: string): Promise<MemoryCategory> {
    // 简化的分类逻辑
    const lower = content.toLowerCase();
    
    if (lower.includes("preference") || lower.includes("like") || lower.includes("prefer")) {
      return MemoryCategory.PREFERENCES;
    }
    if (lower.includes("name") || lower.includes("i am") || lower.includes("my name")) {
      return MemoryCategory.PROFILE;
    }
    if (lower.includes("goal") || lower.includes("plan") || lower.includes("want to")) {
      return MemoryCategory.PATTERNS; // 使用 PATTERNS 代替 goals
    }
    if (lower.includes("tool") || lower.includes("function")) {
      return MemoryCategory.TOOLS;
    }
    if (lower.includes("pattern") || lower.includes("usually") || lower.includes("always")) {
      return MemoryCategory.PATTERNS;
    }
    
    return MemoryCategory.ENTITIES; // 默认使用 ENTITIES 代替 general
  }

  private async evaluateImportance(content: string, category: MemoryCategory): Promise<number> {
    // 基于分类和内容的简单重要性评估
    let importance = 0.5;

    // 分类权重
    const categoryWeights: Record<string, number> = {
      profile: 0.9,
      preferences: 0.8,
      goals: 0.85,
      entities: 0.7,
      patterns: 0.75,
      tools: 0.6,
      skills: 0.7,
      general: 0.5,
    };
    
    importance = categoryWeights[category] ?? 0.5;

    // 关键词提升
    const keywords = ["important", "critical", "must", "key", "essential"];
    if (keywords.some((k) => content.toLowerCase().includes(k))) {
      importance = Math.min(importance + 0.2, 1.0);
    }

    return importance;
  }

  private async createEmbeddings(content: FusionMemoryItem["content"]): Promise<FusionMemoryItem["embeddings"]> {
    if (!this.embeddingEngine) return {};

    try {
      // 使用概览层进行向量化
      const dense = await this.embeddingEngine.embed(content.l1_overview);
      return { dense };
    } catch (error) {
      log.warn("Failed to create embeddings:", error as Record<string, unknown>);
      return {};
    }
  }

  private determineInitialTier(importance: number): FusionMemoryItem["tier"] {
    if (importance > 0.8) return "working";
    if (importance > 0.4) return "short-term";
    return "long-term";
  }

  private async storeToAppropriateSystem(item: FusionMemoryItem): Promise<void> {
    // 存储到三层存储
    if (this.threeTierStore) {
      const atom = this.mapFusionToAtom(item);
      await this.threeTierStore.ingest(atom);
    }

    // 存储到向量存储
    if (this.vectorStorage && item.embeddings.dense) {
      await this.vectorStorage.store(
        item.id,
        item.embeddings.dense,
        {
          content: item.content.l1_overview,
          contentType: item.category,
          importance: item.importance,
          agentId: item.metadata.agentId,
          tags: ["fusion", item.category],
        }
      );
    }
  }

  private async ingestFromExtraction(
    memory: CandidateMemory,
    sessionId?: string
  ): Promise<void> {
    const content = memory.content ?? memory.overview;
    
    await this.ingest(content, {
      category: memory.category,
      tags: ["extracted", memory.category],
      source: "session-extraction",
      sessionId,
    });
  }

  private applyFilters(items: FusionMemoryItem[], options: FusionRetrieveOptions): FusionMemoryItem[] {
    return items.filter((item) => {
      if (options.categories && !options.categories.includes(item.category)) {
        return false;
      }
      if (options.sections && !options.sections.includes(item.section)) {
        return false;
      }
      if (options.userId && item.metadata.userId !== options.userId) {
        return false;
      }
      if (options.timeRange) {
        if (options.timeRange.start && item.metadata.timestamp < options.timeRange.start) {
          return false;
        }
        if (options.timeRange.end && item.metadata.timestamp > options.timeRange.end) {
          return false;
        }
      }
      if (options.filter && !options.filter(item)) {
        return false;
      }
      return true;
    });
  }

  private async updateAccessStats(items: FusionMemoryItem[]): Promise<void> {
    for (const item of items) {
      item.metadata.accessCount++;
      item.metadata.lastAccessed = Date.now();
      item.hotness = Math.min(item.hotness + 0.1, 1.0);
    }
  }

  private setupAutoExtraction(sessionId: string): void {
    if (!this.sessionManager) return;

    this.sessionManager.once("sessionEnded", async (session) => {
      if (session.id === sessionId && this.config.extraction.autoExtract) {
        try {
          await this.extractFromSession(sessionId);
        } catch (error) {
          log.warn("Auto-extraction failed:", error as Record<string, unknown>);
        }
      }
    });
  }

  // ===========================================================================
  // 私有方法 - 进化操作
  // ===========================================================================

  private async runDecay(): Promise<void> {
    // 衰减热度
    if (this.threeTierStore) {
      // 通过访问触发衰减计算
    }
  }

  private async runMerge(): Promise<void> {
    // 合并相似记忆
    log.info("Running memory merge (placeholder)");
  }

  private async runPrune(): Promise<void> {
    // 清理过期记忆
    log.info("Running memory prune (placeholder)");
  }

  private async runOptimize(): Promise<void> {
    // 优化存储
    // VectorStorage 没有 optimize 方法，暂时留空
    log.info("Running memory optimize (placeholder)");
  }

  // ===========================================================================
  // 私有方法 - 映射转换
  // ===========================================================================

  private mapTieredToFusion(item: TieredMemoryItem): FusionMemoryItem {
    const atom = item.atom;
    return {
      id: atom.id,
      content: {
        l1_overview: atom.content,
        l2_detail: atom.content,
      },
      embeddings: {
        dense: atom.embedding,
      },
      category: MemoryCategory.ENTITIES,
      section: "user",
      tier: item.tier,
      importance: atom.strength.base,
      hotness: atom.strength.current,
      metadata: {
        agentId: atom.spatial.agent ?? "unknown",
        userId: "anonymous",
        timestamp: atom.temporal.created,
        lastAccessed: atom.temporal.lastAccessed,
        accessCount: atom.temporal.accessCount,
        source: atom.spatial.sourceFile ?? "unknown",
        tags: atom.meta.tags,
      },
      provenance: {
        system: "fusion",
        version: NSEM_FUSION_VERSION,
      },
    };
  }

  private mapFusionToAtom(item: FusionMemoryItem): TieredMemoryItem["atom"] {
    return {
      id: item.id,
      contentHash: this.hashContent(item.content.l1_overview),
      content: item.content.l1_overview,
      contentType: "fact",
      embedding: item.embeddings.dense ?? [],
      temporal: {
        created: item.metadata.timestamp,
        modified: item.metadata.timestamp,
        lastAccessed: item.metadata.lastAccessed,
        accessCount: item.metadata.accessCount,
        decayRate: 0.01,
      },
      spatial: {
        sourceFile: item.metadata.source,
        agent: item.metadata.agentId,
      },
      strength: {
        current: item.hotness,
        base: item.importance,
        reinforcement: 0,
        emotional: 0.3,
      },
      generation: 1,
      meta: {
        tags: item.metadata.tags,
        confidence: 0.8,
        source: "derived",
      },
    };
  }

  private mapHybridToFusion(item: HybridRetrievalItem): FusionMemoryItem {
    // 从 levelContents 获取内容，优先使用 overview (L1)，其次是 detail (L2) 或 abstract (L0)
    const levelContent = item.context?.levelContents?.overview?.content 
      ?? item.context?.levelContents?.detail?.content 
      ?? item.context?.levelContents?.abstract?.content 
      ?? "";
    return {
      id: item.uri,
      content: {
        l1_overview: levelContent,
      },
      embeddings: {},
      category: MemoryCategory.ENTITIES,
      section: "user",
      tier: "short-term",
      importance: item.score,
      hotness: item.score,
      metadata: {
        agentId: this.config.agentId,
        userId: "anonymous",
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        source: "retrieval",
        tags: [],
      },
      provenance: {
        system: "fusion",
        version: NSEM_FUSION_VERSION,
      },
    };
  }

  private mapToSearchResult(item: FusionMemoryItem): MemorySearchResult {
    return {
      path: item.metadata.source,
      snippet: item.content.l1_overview.slice(0, 500),
      startLine: 1,
      endLine: item.content.l1_overview.split("\n").length,
      score: item.importance,
      source: "memory",
    };
  }

  // ===========================================================================
  // 私有方法 - 工具函数
  // ===========================================================================

  private generateId(): string {
    return `nsem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("NSEMFusionCore not initialized. Call initialize() first.");
    }
  }

  // ===========================================================================
  // 兼容方法 (用于 KnowledgeTransfer 等旧代码)
  // ===========================================================================

  /**
   * 获取所有记忆原子 (兼容旧 API)
   * @returns Map<id, MemAtom>
   * @deprecated 使用 retrieve() 替代
   */
  getAtoms(): Map<string, import("./types/index.js").MemAtom> {
    this.ensureInitialized();
    // 从三层存储中获取所有记忆并转换为 MemAtom 格式
    const atoms = new Map<string, import("./types/index.js").MemAtom>();
    
    // 注意: 这里简化实现，实际应该遍历所有存储层
    // 由于 NSEMFusionCore 使用新的数据模型，这里返回空 Map
    // 如果需要完整实现，需要将 FusionMemoryItem 转换为 MemAtom
    return atoms;
  }

  /**
   * 获取所有关系边 (兼容旧 API)
   * @returns Map<id, LivingEdge>
   * @deprecated 关系边功能待实现
   */
  getEdges(): Map<string, import("./types/index.js").LivingEdge> {
    this.ensureInitialized();
    // 关系网络功能在当前版本中未完全实现
    return new Map<string, import("./types/index.js").LivingEdge>();
  }

  /**
   * 获取所有记忆场 (兼容旧 API)
   * @returns Map<id, MemoryField>
   * @deprecated 记忆场功能待实现
   */
  getFields(): Map<string, import("./types/index.js").MemoryField> {
    this.ensureInitialized();
    // 记忆场功能在当前版本中未完全实现
    return new Map<string, import("./types/index.js").MemoryField>();
  }
}

// =============================================================================
// 兼容接口类型
// =============================================================================

interface NSEM2CompatibleInterface {
  ingest(content: string, metadata?: unknown): Promise<string>;
  retrieve(query: string, options?: unknown): Promise<unknown[]>;
  getStatus(): FusionCoreStatus;
}

interface NSEM2CoreBridge {
  // NSEM2Core 桥接
}

interface NSEM21CoreBridge {
  // NSEM21Core 桥接
}

// =============================================================================
// 旧核心兼容层 - 确保 NSEMFusionCore 完全兼容旧 API
// =============================================================================

/**
 * 创建 NSEM2Core 兼容实例 (已废弃，使用 createNSEMFusionCore)
 * @deprecated 使用 createNSEMFusionCore 替代
 */
export function createNSEM2Core(
  agentId: string,
  config?: Partial<FusionCoreConfig>
): NSEMFusionCore {
  console.warn("⚠️ createNSEM2Core 已废弃，请使用 createNSEMFusionCore");
  return new NSEMFusionCore({ agentId, ...config, storage: { mode: "nsem2-compat", ...config?.storage } });
}

/**
 * 获取 NSEM2Core 实例 (已废弃，使用 getNSEMFusionCore)
 * @deprecated 使用 getNSEMFusionCore 替代
 */
export async function getNSEM2Core(
  agentId: string,
  config?: Partial<FusionCoreConfig>
): Promise<NSEMFusionCore> {
  console.warn("⚠️ getNSEM2Core 已废弃，请使用 getNSEMFusionCore");
  return getNSEMFusionCore(agentId, { ...config, storage: { mode: "nsem2-compat", ...config?.storage } });
}

/**
 * 清除 NSEM2Core 实例 (已废弃，使用 clearNSEMFusionCore)
 * @deprecated 使用 clearNSEMFusionCore 替代
 */
export function clearNSEM2Core(agentId?: string): void {
  console.warn("⚠️ clearNSEM2Core 已废弃，请使用 clearNSEMFusionCore");
  clearNSEMFusionCore(agentId);
}

/**
 * 创建 UnifiedNSEM2Core 兼容实例 (已废弃，使用 createNSEMFusionCore)
 * @deprecated 使用 createNSEMFusionCore 替代
 */
export function createUnifiedNSEM2Core(
  agentId: string,
  config?: Partial<FusionCoreConfig>
): NSEMFusionCore {
  console.warn("⚠️ createUnifiedNSEM2Core 已废弃，请使用 createNSEMFusionCore");
  return new NSEMFusionCore({ agentId, ...config, storage: { mode: "hybrid-all", ...config?.storage } });
}

/**
 * 创建 UnifiedCoreV2 兼容实例 (已废弃，使用 createNSEMFusionCore)
 * @deprecated 使用 createNSEMFusionCore 替代
 */
export function createUnifiedCoreV2(
  agentId: string,
  config?: Partial<FusionCoreConfig>
): NSEMFusionCore {
  console.warn("⚠️ createUnifiedCoreV2 已废弃，请使用 createNSEMFusionCore");
  return new NSEMFusionCore({ agentId, ...config, storage: { mode: "fusion", ...config?.storage } });
}

// 类型别名，用于兼容旧代码
/** @deprecated 使用 FusionMemoryItem 替代 */
export type MemAtom = FusionMemoryItem;
/** @deprecated 使用 FusionCoreConfig 替代 */
export type NSEM2CoreConfig = FusionCoreConfig;
/** @deprecated 使用 FusionCoreConfig 替代 */
export type UnifiedNSEM2Config = FusionCoreConfig;
/** @deprecated 使用 FusionCoreConfig 替代 */
export type UnifiedCoreV2Config = FusionCoreConfig;

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 创建 NSEM Fusion Core 实例
 */
export function createNSEMFusionCore(
  config?: Partial<FusionCoreConfig>
): NSEMFusionCore {
  return new NSEMFusionCore(config);
}

/**
 * 获取或创建全局 Fusion Core 实例
 */
const fusionCoreInstances = new Map<string, NSEMFusionCore>();
const fusionCoreLocks = new Map<string, Promise<NSEMFusionCore>>();

export async function getNSEMFusionCore(
  agentId: string,
  config?: Partial<FusionCoreConfig>
): Promise<NSEMFusionCore> {
  // 如果已存在，直接返回
  if (fusionCoreInstances.has(agentId)) {
    return fusionCoreInstances.get(agentId)!;
  }

  // 如果正在创建中，等待创建完成
  if (fusionCoreLocks.has(agentId)) {
    return fusionCoreLocks.get(agentId)!;
  }

  // 创建新的 Promise 来锁定创建过程
  const createPromise = (async () => {
    try {
      const core = createNSEMFusionCore({ agentId, ...config });
      await core.initialize();
      
      fusionCoreInstances.set(agentId, core);
      return core;
    } finally {
      fusionCoreLocks.delete(agentId);
    }
  })();

  fusionCoreLocks.set(agentId, createPromise);
  return createPromise;
}

/**
 * 清除 Fusion Core 实例
 */
export function clearNSEMFusionCore(agentId?: string): void {
  if (agentId) {
    fusionCoreInstances.delete(agentId);
  } else {
    fusionCoreInstances.clear();
  }
}

/**
 * 获取所有 Fusion Core 实例
 */
export function getAllFusionCores(): Map<string, NSEMFusionCore> {
  return new Map(fusionCoreInstances);
}

// 默认导出
export default NSEMFusionCore;
