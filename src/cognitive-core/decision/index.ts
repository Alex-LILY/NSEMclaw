/**
 * 决策系统模块 - 智能、情感化、自适应
 *
 * 导出内容:
 * - DecisionStrategyEngine: 传统决策引擎（UCB/汤普森采样等）
 * - DecisionModelEngine: 轻量级LLM决策模型
 * - EmotionalIntelligence: 情感智能分析
 * - SmartDecisionService: 整合服务
 */

// 传统决策引擎
export {
  DecisionStrategyEngine,
  createDecisionEngine,
  createUCBEngine,
  createEpsilonGreedyEngine,
  createThompsonSamplingEngine,
  createSoftmaxEngine,
  getDecisionEngine,
  resetDecisionEngine,
  // 类型
  type Action,
  type ActionValue,
  type DecisionContext,
  type DecisionRecord,
  type DecisionOutcome,
  type DecisionResult,
  type DecisionStrategyType,
  type StrategyParams,
  type DecisionEngineConfig,
} from "./DecisionStrategyEngine.js";

// 决策模型引擎
export {
  DecisionModelEngine,
  createDecisionModelEngine,
  getDecisionModelEngine,
  resetDecisionModelEngine,
  // 类型
  type DecisionModelConfig,
  type ToolDecisionRequest,
  type SubagentDecisionRequest,
  type ReplyDecisionRequest,
  type MemoryDecisionRequest,
  type DecisionRequest,
  type EmotionalContext,
  type UserProfile,
  type RichDecisionContext,
  type EngineAdvice,
  type DecisionResponse,
} from "./DecisionModelEngine.js";

// 情感智能
export {
  EmotionalIntelligence,
  createEmotionalIntelligence,
  getEmotionalIntelligence,
  resetEmotionalIntelligence,
  // 类型
  type EmotionAnalysisOptions,
} from "./EmotionalIntelligence.js";

// 智能决策服务
export {
  SmartDecisionService,
  createSmartDecisionService,
  getSmartDecisionService,
  resetSmartDecisionService,
  // 类型
  type SmartDecisionConfig,
} from "./SmartDecisionService.js";
