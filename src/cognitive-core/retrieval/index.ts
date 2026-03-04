/**
 * 分层检索模块
 * 
 * 导出分层检索相关的所有类型和类
 */

// 基础分层检索
export {
  HierarchicalRetriever,
  DEFAULT_RETRIEVER_CONFIG,
  createHierarchicalRetriever,
} from "./HierarchicalRetriever.js";

export type {
  RetrievalOptions,
  RetrievalCandidate,
  RetrievalResult,
  RetrievalMode,
  HierarchicalRetrieverConfig,
} from "./HierarchicalRetriever.js";

// 稀疏索引
export {
  SparseIndex,
  createSparseIndex,
} from "./SparseIndex.js";

export type {
  SparseVector,
  SparseSearchResult,
} from "./SparseIndex.js";

// 重排序
export {
  LightweightReranker,
  AdvancedReranker,
  DEFAULT_RERANKER_CONFIG,
  createReranker,
} from "./Reranker.js";

export type {
  RerankerConfig,
  RerankCandidate,
  RerankResult,
} from "./Reranker.js";

// 意图分析
export {
  IntentAnalyzer,
  DEFAULT_INTENT_CONFIG,
  createIntentAnalyzer,
} from "./IntentAnalyzer.js";

export type {
  IntentAnalyzerConfig,
  IntentType,
  TargetContextType,
  TypedQuery,
  IntentAnalysis,
  SessionContext,
  LLMQueryExpander,
} from "./IntentAnalyzer.js";

// 混合检索器 (集成所有功能)
export {
  HybridRetriever,
  DEFAULT_HYBRID_CONFIG,
  createHybridRetriever,
} from "./HybridRetriever.js";

export type {
  HybridRetrieverConfig,
  HybridRetrievalRequest,
  HybridRetrievalItem,
  HybridRetrievalResult,
} from "./HybridRetriever.js";
