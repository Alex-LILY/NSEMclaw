/**
 * 统一上下文管理模块
 * 
 * 导出分层上下文管理相关的所有类型和类
 */

// 层级定义
export {
  ContextLevel,
  ContextLevelUtils,
  type LevelContent,
  type ThreeLevelContent,
  getMostDetailedContent,
  getContentAtLevel,
  getAvailableLevels,
} from "./ContextLevel.js";

// 统一上下文
export {
  UnifiedContext,
  type UnifiedContextData,
  type ContextType,
  type ContextCategory,
  type ResourceContentType,
  type UserIdentifier,
  createSkillContext,
  createMemoryContext,
  parseURI,
  buildURI,
} from "./UnifiedContext.js";

// 检索轨迹
export {
  RetrievalTracer,
  type RetrievalTrajectory,
  type RetrievalStep,
  type RetrievalAction,
  type RetrievalStats,
  createRetrievalTracer,
} from "./RetrievalTracer.js";
