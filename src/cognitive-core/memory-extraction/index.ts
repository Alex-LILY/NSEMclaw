/**
 * 记忆提取系统
 * 
 * 与 OpenViking 对齐的完整记忆提取流程
 * 融合到 Nsemclaw 三层记忆架构
 */

// 类型定义
export {
  MemoryCategory,
  DedupDecision,
  MemoryActionDecision,
  getMemorySection,
  getDefaultCategories,
  isToolSkillCandidate,
} from "./types.js";

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
  UnifiedMemoryItem,
  ToolStats,
  SkillStats,
  SectionConfig,
  MemoryExtractionConfig,
  DeduplicationConfig,
  SessionEvent,
  ExtractionEvent,
} from "./types.js";

// SessionConfig is exported from SessionManager.js

// 会话管理
export {
  SessionManager,
  createSessionManager,
} from "./SessionManager.js";

export type {
  SessionConfig as SessionManagerConfig,
  SessionStats,
  SessionMessageInput,
} from "./SessionManager.js";

// 记忆提取
export {
  MemoryExtractor,
  createMemoryExtractor,
} from "./MemoryExtractor.js";

export type {
  LLMConfig,
} from "./MemoryExtractor.js";

// 记忆去重
export {
  MemoryDeduplicator,
  createMemoryDeduplicator,
} from "./MemoryDeduplicator.js";

export type {
  Embedder,
  LLMInterface,
  MemoryStorageQuery,
  DeduplicatorConfig,
} from "./MemoryDeduplicator.js";

// 统一存储
export {
  UnifiedMemoryStore,
  createUnifiedMemoryStore,
} from "./UnifiedMemoryStore.js";

export type {
  StorageAdapter,
  HotnessScorerAdapter,
} from "./UnifiedMemoryStore.js";
