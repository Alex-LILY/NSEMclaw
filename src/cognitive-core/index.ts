/**
 * Nsemclaw Cognitive Core 3.0 - Fusion Architecture
 * NSEM NSEM认知核心完全融合架构
 *
 * 新版本代号: Phoenix (凤凰)
 * - 彻底融合所有NSEM子系统
 * - 单一入口: NSEMFusionCore
 * - 统一数据模型: FusionMemoryItem
 * - 向后兼容所有历史API
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                         NSEM Fusion Core 3.0                                │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │   核心入口:                                                                 │
 * │   • NSEMFusionCore        - 融合核心主类                                    │
 * │   • createNSEMFusionCore  - 创建新实例                                      │
 * │   • getNSEMFusionCore     - 获取/创建单例                                   │
 * │                                                                             │
 * │   主要子系统:                                                               │
 * │   • 三层记忆存储  (ThreeTierMemoryStore)                                    │
 * │   • 8类记忆提取   (MemoryExtraction: 8 Categories)                          │
 * │   • 混合检索系统  (HybridRetriever)                                         │
 * │   • 会话管理      (SessionManager)                                          │
 * │   • 决策引擎      (DecisionStrategyEngine)                                  │
 * │   • 进化系统      (EvolutionEngine)                                         │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

// =============================================================================
// 版本信息
// =============================================================================

export const NSEM_VERSION = "3.0.0";
export const NSEM_CODENAME = "Phoenix";
export const NSEM_CORE_VERSION = "3.0.0";

// =============================================================================
// ⭐ 融合核心 (NSEM Fusion Core) - 主入口
// =============================================================================

import {
  NSEMFusionCore,
  createNSEMFusionCore,
  getNSEMFusionCore,
  clearNSEMFusionCore,
  getAllFusionCores,
  NSEM_FUSION_VERSION,
  NSEM_FUSION_CODENAME,
  // 旧核心兼容函数 (已废弃)
  createNSEM2Core,
  getNSEM2Core,
  clearNSEM2Core,
  createUnifiedNSEM2Core,
  createUnifiedCoreV2,
  // 类型别名 (已废弃)
  MemAtom,
  NSEM2CoreConfig,
  UnifiedNSEM2Config,
  // 类型导入
  type FusionCoreConfig,
  type FusionMemoryItem,
  type FusionCoreStatus,
  type FusionRetrieveOptions,
  type FusionRetrieveResult,
  type FusionIngestOptions,
} from "./NSEMFusionCore.js";

// 重新导出核心
export {
  NSEMFusionCore,
  createNSEMFusionCore,
  getNSEMFusionCore,
  clearNSEMFusionCore,
  getAllFusionCores,
  NSEM_FUSION_VERSION,
  NSEM_FUSION_CODENAME,
  // 旧核心兼容函数 (已废弃)
  /** @deprecated 使用 createNSEMFusionCore 替代 */
  createNSEM2Core,
  /** @deprecated 使用 getNSEMFusionCore 替代 */
  getNSEM2Core,
  /** @deprecated 使用 clearNSEMFusionCore 替代 */
  clearNSEM2Core,
  /** @deprecated 使用 createNSEMFusionCore 替代 */
  createUnifiedNSEM2Core,
  /** @deprecated 使用 createNSEMFusionCore 替代 */
  createUnifiedCoreV2,
  // 类型别名 (已废弃)
  /** @deprecated 使用 FusionMemoryItem 替代 */
  MemAtom,
  /** @deprecated 使用 FusionCoreConfig 替代 */
  NSEM2CoreConfig,
  /** @deprecated 使用 FusionCoreConfig 替代 */
  UnifiedNSEM2Config,
};

// =============================================================================
// ⚠️ 旧核心导出 (已废弃，将在 v4.0 中移除)
// =============================================================================
// 注: NSEM2Core, UnifiedNSEM2Core, UnifiedCoreV2 已在 v3.0.0 中合并到 NSEMFusionCore
// 旧的核心类现在作为 NSEMFusionCore 的别名导出，以保持向后兼容

/** 
 * @deprecated 自 v3.0.0 起废弃。使用 NSEMFusionCore 替代。
 * @see NSEMFusionCore
 */
export const NSEM2Core = NSEMFusionCore;

/** 
 * @deprecated 自 v3.0.0 起废弃。使用 NSEMFusionCore 替代。
 * @see NSEMFusionCore
 */
export const UnifiedNSEM2Core = NSEMFusionCore;

/** 
 * @deprecated 自 v3.0.0 起废弃。使用 NSEMFusionCore 替代。
 * @see NSEMFusionCore
 */
export const UnifiedCoreV2 = NSEMFusionCore;

/** 
 * @deprecated 自 v3.0.0 起废弃。使用 FusionCoreConfig 替代。
 */
export type UnifiedCoreV2Config = FusionCoreConfig;
/** 
 * @deprecated 自 v3.0.0 起废弃。使用 FusionMemoryItem 替代。
 */
export type UnifiedMemoryItem = FusionMemoryItem;
/** 
 * @deprecated 自 v3.0.0 起废弃。使用 FusionCoreStatus 替代。
 */
export type UnifiedCoreV2Status = FusionCoreStatus;

// =============================================================================
// 配置管理
// =============================================================================

export {
  CognitiveCoreConfigSchema,
  validateCognitiveCoreConfig,
} from "./config.js";

export type {
  CognitiveCoreConfig,
} from "./config.js";

// =============================================================================
// NSEM记忆存储系统 (Storage Layer)
// =============================================================================

export {
  ThreeTierMemoryStore,
  WORKING_MEMORY_CONFIG,
  TIME_WINDOW_CONFIG,
  TIER_THRESHOLD_CONFIG,
} from "./memory/ThreeTierMemoryStore.js";

export type {
  MemoryTier,
  Vector,
  TieredMemoryItem,
  ThreeTierMemoryConfig,
  MemoryRetrievalResult,
  ThreeTierMemoryStats,
  TierTransitionEvent,
} from "./memory/ThreeTierMemoryStore.js";

// 增强检索评分
export {
  EnhancedRetrievalScorer,
  createEnhancedScorer,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SCORING_CONFIG,
} from "./memory/EnhancedRetrievalScorer.js";

export type {
  ScoringWeights,
  ScoringConfig,
  ScoringResult,
} from "./memory/EnhancedRetrievalScorer.js";

// 选择性记忆继承
export {
  SelectiveMemoryInheritance,
  createSelectiveMemoryInheritance,
  PersistentSelectiveMemoryInheritance,
  createPersistentSelectiveMemoryInheritance,
} from "./memory/index.js";

export type {
  InheritanceStrategy,
  MemoryScope,
  MemoryFilter,
  MemorySubscription,
  MemorySnapshot,
  SelectiveMemoryItem,
  ScopedMemoryItem,
  WriteOperation,
  InheritanceResult,
  MemoryType,
  PersistentInheritanceConfig,
} from "./memory/index.js";

// =============================================================================
// 记忆提取系统 (Extraction Layer - 8类记忆)
// =============================================================================

export {
  SessionManager,
  MemoryExtractor,
  MemoryDeduplicator,
  MemoryCategory,
  DedupDecision,
  MemoryActionDecision,
  createSessionManager,
  createMemoryExtractor,
  createMemoryDeduplicator,
  getMemorySection,
  getDefaultCategories,
  isToolSkillCandidate,
} from "./memory-extraction/index.js";

export type {
  MemorySection,
  MessageRole,
  MessagePart,
  MessagePartType,
  SessionMessage,
  Session,
  ToolCallInfo,
  CandidateMemory,
  ToolSkillCandidateMemory,
  ExtractionResult,
  ExtractionStats,
  DedupResult,
  ExistingMemoryAction,
  ToolStats,
  SkillStats,
  SectionConfig,
  MemoryExtractionConfig,
  DeduplicationConfig,
  SessionEvent,
  ExtractionEvent,
  SessionStats,
  SessionMessageInput,
  LLMConfig,
  Embedder,
  LLMInterface,
  MemoryStorageQuery,
  DeduplicatorConfig,
} from "./memory-extraction/index.js";

// 统一记忆存储 (提取后的存储)
export {
  UnifiedMemoryStore,
  createUnifiedMemoryStore,
} from "./memory-extraction/UnifiedMemoryStore.js";

export type {
  StorageAdapter,
  HotnessScorerAdapter,
} from "./memory-extraction/UnifiedMemoryStore.js";

// =============================================================================
// 检索模块 (Retrieval Layer)
// =============================================================================

// 分层检索
export {
  HierarchicalRetriever,
  DEFAULT_RETRIEVER_CONFIG,
  createHierarchicalRetriever,
} from "./retrieval/index.js";

export type {
  RetrievalOptions,
  RetrievalCandidate,
  RetrievalResult,
  RetrievalMode,
  HierarchicalRetrieverConfig,
} from "./retrieval/index.js";

// 稀疏索引
export {
  SparseIndex,
  createSparseIndex,
} from "./retrieval/index.js";

export type {
  SparseVector,
  SparseSearchResult,
} from "./retrieval/index.js";

// 重排序
export {
  LightweightReranker,
  AdvancedReranker,
  DEFAULT_RERANKER_CONFIG,
  createReranker,
} from "./retrieval/index.js";

export type {
  RerankerConfig,
  RerankCandidate,
  RerankResult,
} from "./retrieval/index.js";

// 意图分析
export {
  IntentAnalyzer,
  DEFAULT_INTENT_CONFIG,
  createIntentAnalyzer,
} from "./retrieval/index.js";

export type {
  IntentAnalyzerConfig,
  IntentType,
  TargetContextType,
  TypedQuery,
  IntentAnalysis,
  SessionContext,
  LLMQueryExpander,
} from "./retrieval/index.js";

// 混合检索器 (集成所有功能)
export {
  HybridRetriever,
  DEFAULT_HYBRID_CONFIG,
  createHybridRetriever,
} from "./retrieval/index.js";

export type {
  HybridRetrieverConfig,
  HybridRetrievalRequest,
  HybridRetrievalItem,
  HybridRetrievalResult,
} from "./retrieval/index.js";

// =============================================================================
// 上下文管理 (Context Layer)
// =============================================================================

// 层级定义 (L0/L1/L2)
export {
  ContextLevel,
  ContextLevelUtils,
  getMostDetailedContent,
  getContentAtLevel,
  getAvailableLevels,
} from "./context/index.js";

export type {
  LevelContent,
  ThreeLevelContent,
} from "./context/index.js";

// 统一上下文
export {
  UnifiedContext,
  createSkillContext,
  createMemoryContext,
  parseURI,
  buildURI,
} from "./context/index.js";

export type {
  UnifiedContextData,
  ContextType,
  ContextCategory,
  ResourceContentType,
} from "./context/index.js";

// 检索轨迹
export {
  RetrievalTracer,
  createRetrievalTracer,
} from "./context/index.js";

export type {
  RetrievalTrajectory,
  RetrievalStep,
  RetrievalAction,
  RetrievalStats,
} from "./context/index.js";

// =============================================================================
// 生命周期管理 (Lifecycle Layer)
// =============================================================================

export {
  HotnessScorer,
  DEFAULT_HOTNESS_CONFIG,
  createHotnessScorer,
  computeHotnessScore,
  computeTimeDecayedHotness,
} from "./lifecycle/index.js";

export type {
  HotnessConfig,
  HotnessHistory,
} from "./lifecycle/index.js";

// =============================================================================
// 安全与权限控制 (Security Layer)
// =============================================================================

export {
  Role,
  UserIdentifier,
  RequestContext,
  PermissionChecker,
  PermissionError,
  createRequestContext,
  createRootContext,
  createDefaultContext,
} from "./security/index.js";

// Note: Permission types will be added in future updates
// export type {
//   Permission,
//   PermissionAction,
//   ResourceType,
//   AccessDecision,
// } from "./security/index.js";

// =============================================================================
// 决策策略引擎 (Decision Layer) - 可选模块
// =============================================================================

export {
  DecisionStrategyEngine,
  createDecisionEngine,
  createEpsilonGreedyEngine,
  createUCBEngine,
  createThompsonSamplingEngine,
  createSoftmaxEngine,
  actionFromMemAtom,
  contextFromActivatedMemory,
} from "./decision/index.js";

export type {
  Action,
  ActionValue,
  BetaDistributionParams,
  DecisionRecord,
  DecisionOutcome,
  DecisionContext,
  DecisionStrategyType,
  StrategyParams,
  EpsilonGreedyParams,
  UCBParams,
  ThompsonSamplingParams,
  SoftmaxParams,
  DecisionEngineConfig,
  DecisionResult,
  StrategyPerformance,
} from "./decision/index.js";

// 决策集成
export {
  DecisionIntegration,
  createDecisionIntegration,
  getDecisionIntegration,
  resetDecisionIntegration,
  decideSubagentUsage,
  submitSubagentTaskFeedback,
  decideBatchSubagentUsage,
  estimateTaskComplexity,
  estimateTokens,
  ENABLE_SUBAGENT_DECISION,
} from "./integration/index.js";

export type {
  DecisionIntegrationConfig,
  DecisionType,
  ToolDecisionContext,
  SubagentDecisionContext,
  ReplyDecisionContext,
  DecisionFeedback,
  SubagentDecision,
  BatchTask,
  BatchDecision,
} from "./integration/index.js";

// =============================================================================
// 进化系统 (Evolution Layer) - 可选模块
// =============================================================================

export {
  GeneticParameterOptimizer,
  createGeneticOptimizer,
  createDefaultFitnessEvaluator,
  DEFAULT_PARAMETERS,
  DEFAULT_OPTIMIZER_CONFIG,
  PARAMETER_BOUNDS,
  KnowledgeTransferSystem,
  createKnowledgeTransferSystem,
  DEFAULT_TRANSFER_CONFIG,
} from "./evolution/index.js";

export type {
  OptimizableParameters,
  Individual,
  GeneticOptimizerConfig,
  OptimizationResult,
  FitnessEvaluator,
  KnowledgePackage,
  TransferConfig,
  TransferResult,
  TransferRecord,
  TransferStats,
  KnowledgeSourceAdapter,
} from "./evolution/index.js";

// =============================================================================
// 元认知监控 (Meta-Cognition Layer) - 可选模块
// =============================================================================

export {
  MetaCognitionMonitor,
  createMetaCognitionMonitor,
  DEFAULT_META_COGNITION_CONFIG,
} from "./meta-cognition/index.js";

export type {
  CognitiveOperation,
  PerformanceMetrics,
  CognitiveState,
  CognitiveStrategy,
  StrategyEvaluation,
  MetaCognitionConfig,
  ReflectionRecord,
  AnomalyEvent,
} from "./meta-cognition/index.js";

// =============================================================================
// 多智能体协作 (Multi-Agent Layer) - 可选模块
// =============================================================================

export {
  MultiAgentCollaborationSystem,
  createMultiAgentCollaborationSystem,
  DEFAULT_STRATEGIES,
} from "./multi-agent/index.js";

export type {
  AgentRole,
  TaskType,
  SubagentConfig,
  CollaborationTask,
  TaskResult,
  CollaborationStrategy,
  CollaborationSession,
  AgentMessage,
  CollaborationStats,
} from "./multi-agent/index.js";

// 弹性子代理编排
export {
  ResilientSubagentOrchestrator,
  createResilientSubagentOrchestrator,
  CircuitBreaker,
  SmartRetryExecutor,
  TimeoutManager,
  DependencyGraph,
  DeadLetterQueue,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_CASCADE_CONFIG,
  DEFAULT_DLQ_CONFIG,
} from "./multi-agent/index.js";

export type {
  CircuitBreakerState,
  CircuitBreakerConfig,
  RetryPolicy,
  TimeoutConfig,
  ErrorCategory,
  CascadeFailureConfig,
  DeadLetterQueueConfig,
  ResilienceConfig,
  TaskDependency,
  TaskExecutionContext,
  ExecutionResult,
  DeadLetterEntry,
} from "./multi-agent/index.js";

// =============================================================================
// 感知层 (Perception Layer)
// =============================================================================

export {
  SmartEmbeddingEngine,
  createSmartEmbeddingEngine,
  LIGHTWEIGHT_MODELS,
} from "./mind/perception/SmartEmbeddingEngine.js";

export {
  UnifiedEmbeddingEngine,
  createUnifiedEmbeddingEngine,
} from "./mind/perception/UnifiedEmbeddingEngine.js";

// =============================================================================
// 存储层 (Storage Layer)
// =============================================================================

export {
  VectorStorage,
  getVectorStorage,
  releaseVectorStorage,
} from "./storage/VectorStorage.js";

export type {
  VectorStorageConfig,
  VectorSearchResult,
  VectorStorageStats,
} from "./storage/VectorStorage.js";

// =============================================================================
// 服务层 (Service Layer)
// =============================================================================

export {
  AutoIngestionService,
  createAutoIngestionService,
} from "./services/AutoIngestionService.js";

export {
  ImportanceScorer,
  createImportanceScorer,
  DEFAULT_IMPORTANCE_CONFIG,
} from "./services/ImportanceScorer.js";

export {
  PeriodicMaintenanceService,
  createPeriodicMaintenanceService,
} from "./services/PeriodicMaintenanceService.js";

// =============================================================================
// 工具函数 (Utilities)
// =============================================================================

export {
  // 通用工具
  debounce,
  throttle,
  memoize,
  generateUUID,
  deepClone,
  mergeDeep,
} from "./utils/common.js";

// =============================================================================
// 快速开始指南
// =============================================================================

/**
 * 🚀 快速开始 - NSEM Fusion Core 3.0
 *
 * ```typescript
 * import { 
 *   NSEMFusionCore, 
 *   createNSEMFusionCore,
 *   MemoryCategory,
 *   ContextLevel 
 * } from "nsemclaw/cognitive-core";
 *
 * // 方式1: 使用工厂函数 (推荐)
 * const core = createNSEMFusionCore({
 *   agentId: "my-agent",
 *   storage: { mode: "fusion" },
 *   extraction: { enabled: true },
 * });
 * await core.initialize();
 *
 * // 方式2: 使用单例模式
 * const core = await getNSEMFusionCore("my-agent", {
 *   storage: { mode: "three-tier" },
 * });
 *
 * // 存储记忆
 * const memory = await core.ingest("用户偏好 TypeScript", {
 *   category: "preferences",
 *   tags: ["tech", "coding"],
 * });
 *
 * // 检索记忆
 * const results = await core.retrieve("TypeScript 风格指南");
 *
 * // 分层检索 (节省 Token)
 * const overview = await core.retrieve("项目需求", {
 *   contextLevel: ContextLevel.OVERVIEW,
 * });
 *
 * // 会话管理
 * const sessionId = core.startSession("user-123");
 * core.recordMessage(sessionId, { role: "user", content: "..." });
 * core.recordMessage(sessionId, { role: "assistant", content: "..." });
 * await core.endSession(sessionId); // 自动提取记忆
 *
 * // 获取状态
 * console.log(core.getStatus());
 * // {
 * //   version: "3.0.0",
 * //   storage: { totalMemories: 150, ... },
 * //   extraction: { sessionsProcessed: 10, ... },
 * //   ...
 * // }
 * ```
 *
 * 📚 架构层级:
 * 1. **融合核心层** - NSEMFusionCore (统一入口)
 * 2. **功能模块层** - 存储/提取/检索/会话
 * 3. **基础设施层** - 向量存储/嵌入引擎/配置
 *
 * 🔧 存储模式:
 * - `fusion`       - 完全融合模式 (推荐)
 * - `three-tier`   - 仅三层存储
 * - `nsem2-compat` - NSEM2 兼容模式
 * - `hybrid-all`   - 启用所有后端
 *
 * 🎯 检索模式:
 * - `fusion`        - 智能融合检索
 * - `tiered`        - 分层检索
 * - `hybrid`        - 混合检索
 * - `intent-driven` - 意图驱动检索
 *
 * 💡 提示: 使用 `createSearchManagerAdapter()` 获取 MemorySearchManager 兼容接口
 */

// =============================================================================
// 向后兼容导出 (Legacy Exports)
// =============================================================================

// 兼容 2.x 版本的导出
export {
  // 核心类别名
  NSEMFusionCore as NSEMCognitiveCore,
  NSEMFusionCore as CognitiveCore,
};

export type {
  // 类型别名
  FusionMemoryItem as MemoryItem,
  FusionCoreConfig as CoreConfig,
};

// 默认导出: 融合核心
export { NSEMFusionCore as default };
