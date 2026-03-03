/**
 * Nsemclaw Cognitive Core
 *
 * 统一认知架构入口
 * - 神经符号进化记忆 (NSEM 2.0)
 * - 三层记忆存储系统 (工作记忆/短期记忆/长期记忆)
 * - 智能嵌入引擎
 * - 统一类型定义
 *
 * 注意: 此模块已整合 evolution/memory/ 的所有功能
 */

// ============================================================================
// 统一类型定义 (单一类型源)
// ============================================================================

export * from "./types/index.js";

// ============================================================================
// 配置类型和函数
// ============================================================================

export {
  NSEM2UserConfigSchema,
  CognitiveCoreConfigSchema,
  getNSEM2Config,
  isNSEMEnabled,
  validateCognitiveCoreConfig,
  DEFAULT_NSEM2_USER_CONFIG,
  DEFAULT_NSEM2_CONFIG,
} from "./config.js";

export type {
  NSEM2UserConfig,
  CognitiveCoreConfig,
  /** @deprecated 使用 NSEM2UserConfig */
  NSEM2Config,
} from "./config.js";

// ============================================================================
// 核心实现
// ============================================================================

export { NSEM2Core, getNSEM2Core, clearNSEM2Core } from "./mind/nsem/NSEM2Core.js";
export type { NSEM2Core as MemoryEcosystem } from "./mind/nsem/NSEM2Core.js";

export {
  SmartEmbeddingEngine,
  createSmartEmbeddingEngine,
  LIGHTWEIGHT_MODELS,
} from "./mind/perception/SmartEmbeddingEngine.js";

export {
  UnifiedEmbeddingEngine,
  createUnifiedEmbeddingEngine,
} from "./mind/perception/UnifiedEmbeddingEngine.js";

// ============================================================================
// 三层记忆存储系统 (融合自进化决策记忆系统)
// ============================================================================

export {
  // 三层记忆存储
  ThreeTierMemoryStore,
  WORKING_MEMORY_CONFIG,
  TIME_WINDOW_CONFIG,
  TIER_THRESHOLD_CONFIG,
  // 增强检索评分
  EnhancedRetrievalScorer,
  createEnhancedScorer,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_SCORING_WEIGHTS,
  // 选择性记忆继承
  SelectiveMemoryInheritance,
  createSelectiveMemoryInheritance,
  PersistentSelectiveMemoryInheritance,
  createPersistentSelectiveMemoryInheritance,
  PersistentMemoryStorage,
} from "./memory/index.js";

export type {
  // 三层记忆类型
  MemoryTier,
  Vector,
  TieredMemoryItem,
  ThreeTierMemoryConfig,
  MemoryRetrievalResult,
  ThreeTierMemoryStats,
  TierTransitionEvent,
  // 评分类型
  ScoringWeights,
  ScoringConfig,
  ScoringResult,
  // 选择性记忆继承类型
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
  PersistentStorageConfig,
} from "./memory/index.js";

// ============================================================================
// 决策策略引擎
// ============================================================================

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

// ============================================================================
// 集成层 (Nsemclaw 适配器)
// ============================================================================

export { NSEM2Adapter } from "./integration/NSEM2Adapter.js";
export type { NSEM2AdapterConfig } from "./integration/NSEM2Adapter.js";

// ============================================================================
// P1: 集成版 NSEM2Core (集成 ThreeTierMemoryStore + EnhancedRetrievalScorer)
// ============================================================================

export {
  IntegratedNSEM2Core,
  getIntegratedNSEM2Core,
  clearIntegratedNSEM2Core,
  getIntegratedNSEM2CoreInstance,
} from "./integration/index.js";

export type { IntegratedNSEM2Config } from "./integration/index.js";

// ============================================================================
// P2: 进化系统 (遗传算法参数优化 + 知识迁移)
// ============================================================================

export {
  // 遗传算法参数优化
  GeneticParameterOptimizer,
  createGeneticOptimizer,
  createDefaultFitnessEvaluator,
  DEFAULT_PARAMETERS,
  DEFAULT_OPTIMIZER_CONFIG,
  PARAMETER_BOUNDS,
  // 知识迁移
  KnowledgeTransferSystem,
  IntegratedNSEM2Adapter,
  createKnowledgeTransferSystem,
  createIntegratedNSEM2Adapter,
  DEFAULT_TRANSFER_CONFIG,
} from "./evolution/index.js";

export type {
  // 遗传算法类型
  OptimizableParameters,
  Individual,
  GeneticOptimizerConfig,
  OptimizationResult,
  FitnessEvaluator,
  // 知识迁移类型
  KnowledgePackage,
  TransferConfig,
  TransferResult,
  TransferRecord,
  TransferStats,
  KnowledgeSourceAdapter,
} from "./evolution/index.js";

// ============================================================================
// P3: 元认知监控 + 多智能体协作
// ============================================================================

export {
  // 元认知监控
  MetaCognitionMonitor,
  createMetaCognitionMonitor,
  DEFAULT_META_COGNITION_CONFIG,
} from "./meta-cognition/index.js";

export {
  // 多智能体协作
  MultiAgentCollaborationSystem,
  createMultiAgentCollaborationSystem,
  DEFAULT_STRATEGIES,
} from "./multi-agent/index.js";

export type {
  // 元认知类型
  CognitiveOperation,
  PerformanceMetrics,
  CognitiveState,
  CognitiveStrategy,
  StrategyEvaluation,
  MetaCognitionConfig,
  ReflectionRecord,
  AnomalyEvent,
} from "./meta-cognition/index.js";

export type {
  // 多智能体类型
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

// ============================================================================
// P3 增强: 弹性子代理协调器 (基于 Agent 长时间运行和纠错优化)
// ============================================================================

export {
  // 弹性子代理协调器
  ResilientSubagentOrchestrator,
  createResilientSubagentOrchestrator,
  // 核心组件
  CircuitBreaker,
  SmartRetryExecutor,
  TimeoutManager,
  DependencyGraph,
  DeadLetterQueue,
  // 默认配置
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_CASCADE_CONFIG,
  DEFAULT_DLQ_CONFIG,
} from "./multi-agent/index.js";

export type {
  // 弹性系统类型
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

// ============================================================================
// 向后兼容导出 (从 evolution/ 迁移)
// ============================================================================

/** @deprecated 使用 NSEM2Core */
export { NSEM2Core as EvolutionEngine } from "./mind/nsem/NSEM2Core.js";

/** @deprecated 使用 SmartEmbeddingEngine */
export { SmartEmbeddingEngine as EmbeddingEngine } from "./mind/perception/SmartEmbeddingEngine.js";

// ============================================================================
// 版本信息
// ============================================================================

export const COGNITIVE_CORE_VERSION = "2.0.0";
export const NSEM_VERSION = "2.0.0";
export const MEMORY_STORE_VERSION = "1.0.0";
export const DECISION_ENGINE_VERSION = "1.0.0";

// ============================================================================
// 模块说明
// ============================================================================

/**
 * 迁移指南:
 *
 * 从 evolution/memory/:
 *   - MemoryEcosystem → NSEM2Core
 *   - 类型定义 → 从 cognitive-core/types 导入
 *
 * 从 evolution/adapter/:
 *   - 适配器逻辑 → 使用 NSEM2Adapter (单独导出)
 *
 * 快速开始:
 * ```typescript
 * import { NSEM2Core, getNSEM2Core } from "nsemclaw/cognitive-core";
 *
 * const nsem = await getNSEM2Core(cfg, agentId, memoryConfig);
 * await nsem.start();
 * ```
 *
 * 三层记忆存储系统使用:
 * ```typescript
 * import { ThreeTierMemoryStore, getThreeTierMemoryStore } from "nsemclaw/cognitive-core";
 *
 * const store = getThreeTierMemoryStore({ workingMemoryCapacity: 15 });
 * store.start();
 *
 * // 摄入记忆
 * const item = await store.ingest(memAtom);
 *
 * // 检索记忆
 * const results = await store.retrieve(query);
 *
 * // 访问记忆
 * const memory = await store.access(atomId);
 * ```
 */
