/**
 * 感知层 - 嵌入引擎模块
 */

export {
  SmartEmbeddingEngine,
  createSmartEmbeddingEngine,
  LIGHTWEIGHT_MODELS,
} from "./SmartEmbeddingEngine.js";

export type {
  SmartEmbeddingConfig,
  SmartEmbeddingEngine as ISmartEmbeddingEngine,
} from "./SmartEmbeddingEngine.js";

export {
  UnifiedEmbeddingEngine,
  createUnifiedEmbeddingEngine,
} from "./UnifiedEmbeddingEngine.js";

export type {
  UnifiedEmbeddingConfig,
  UnifiedEmbeddingEngine as IUnifiedEmbeddingEngine,
} from "./UnifiedEmbeddingEngine.js";
