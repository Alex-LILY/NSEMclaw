/**
 * NSEM认知核心集成模块
 *
 * 集成 ThreeTierMemoryStore、EnhancedRetrievalScorer 到 NSEM2Core
 * 新增：决策系统集成
 */

// NSEM2 核心集成
export {
  IntegratedNSEM2Core,
  getIntegratedNSEM2Core,
  clearIntegratedNSEM2Core,
  getIntegratedNSEM2CoreInstance,
  type IntegratedNSEM2Config,
} from "./IntegratedNSEM2Core.js";

// NSEM2 适配器
export { NSEM2Adapter } from "./NSEM2Adapter.js";
export type { NSEM2AdapterConfig } from "./NSEM2Adapter.js";

// 决策系统集成
export {
  DecisionIntegration,
  createDecisionIntegration,
  getDecisionIntegration,
  resetDecisionIntegration,
  type DecisionIntegrationConfig,
  type DecisionType,
  type ToolDecisionContext,
  type SubagentDecisionContext,
  type ReplyDecisionContext,
  type DecisionFeedback,
} from "./DecisionIntegration.js";

// 子代理决策集成
export {
  decideSubagentUsage,
  submitSubagentTaskFeedback,
  decideBatchSubagentUsage,
  estimateTaskComplexity,
  estimateTokens,
  ENABLE_SUBAGENT_DECISION,
  type SubagentDecision,
  type BatchTask,
  type BatchDecision,
} from "./SubagentDecisionIntegration.js";
