/**
 * NSEM认知核心 - 记忆模块
 *
 * NSEM记忆存储系统 + 增强检索评分 + 选择性记忆继承
 * 融合自进化决策记忆系统的优秀特性
 */

// ============================================================================
// NSEM记忆存储系统
// ============================================================================

export {
  ThreeTierMemoryStore,
  WORKING_MEMORY_CONFIG,
  TIME_WINDOW_CONFIG,
  TIER_THRESHOLD_CONFIG,
} from "./ThreeTierMemoryStore.js";

export type {
  MemoryTier,
  Vector,
  TieredMemoryItem,
  ThreeTierMemoryConfig,
  MemoryRetrievalResult,
  ThreeTierMemoryStats,
  TierTransitionEvent,
} from "./ThreeTierMemoryStore.js";

// ============================================================================
// 增强检索评分
// ============================================================================

export {
  EnhancedRetrievalScorer,
  createEnhancedScorer,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SCORING_CONFIG,
} from "./EnhancedRetrievalScorer.js";

export type { ScoringWeights, ScoringConfig, ScoringResult } from "./EnhancedRetrievalScorer.js";

// ============================================================================
// 选择性记忆继承系统 (关系网络)
// ============================================================================

export {
  SelectiveMemoryInheritance,
  createSelectiveMemoryInheritance,
  type InheritanceStrategy,
  type MemoryScope,
  type MemoryFilter,
  type MemorySubscription,
  type MemorySnapshot,
  type SelectiveMemoryItem,
  type ScopedMemoryItem,
  type WriteOperation,
  type InheritanceResult,
  type MemoryType,
} from "./SelectiveMemoryInheritance.js";

export {
  PersistentSelectiveMemoryInheritance,
  PersistentMemoryStorage,
  createPersistentSelectiveMemoryInheritance,
  type PersistentInheritanceConfig,
  type PersistentStorageConfig,
} from "./PersistentSelectiveMemoryInheritance.js";
