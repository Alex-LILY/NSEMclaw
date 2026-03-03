/**
 * 决策引擎模块
 *
 * 融合自进化决策记忆系统的决策能力
 * 基于现有的 DecisionStrategyEngine 实现
 */

// 从现有实现导出所有内容
export {
  // 主类
  DecisionStrategyEngine,

  // 工厂函数
  createDecisionEngine,
  createEpsilonGreedyEngine,
  createUCBEngine,
  createThompsonSamplingEngine,
  createSoftmaxEngine,

  // 辅助函数
  actionFromMemAtom,
  contextFromActivatedMemory,

  // 常量
  DEFAULT_DECISION_ENGINE_CONFIG,
} from "./DecisionStrategyEngine.js";

// 类型导出
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
} from "./DecisionStrategyEngine.js";

// 默认导出
export { default } from "./DecisionStrategyEngine.js";
