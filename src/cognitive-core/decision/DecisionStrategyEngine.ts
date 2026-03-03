/**
 * 决策策略引擎 - Decision Strategy Engine
 *
 * 实现多种决策策略，支持上下文感知决策和贝叶斯反馈更新
 * 与 NSEM2Core 类型系统深度集成
 *
 * 支持的策略:
 * - ε-贪婪 (Epsilon-Greedy): 平衡探索与利用
 * - UCB (Upper Confidence Bound): 基于置信上界的乐观探索
 * - 汤普森采样 (Thompson Sampling): 贝叶斯后验采样
 * - Softmax: 基于温度参数的概率选择
 */

import type { MemAtom, ContentType, Vector } from "../types/index.js";

// ============================================================================
// 基础类型定义
// ============================================================================

/** 动作/选项类型 */
export interface Action {
  /** 动作唯一ID */
  id: string;
  /** 动作描述 */
  description: string;
  /** 动作类型 */
  type: ContentType | "decision" | "exploration" | "exploitation";
  /** 关联的记忆原子ID */
  relatedAtomIds?: string[];
  /** 动作元数据 */
  meta?: Record<string, unknown>;
}

/** 动作价值估计 */
export interface ActionValue {
  /** 动作ID */
  actionId: string;
  /** 估计价值 Q(a) */
  estimatedValue: number;
  /** 选择次数 N(a) */
  selectCount: number;
  /** 总奖励累计 */
  totalReward: number;
  /** 奖励历史 (用于方差计算) */
  rewardHistory: number[];
  /** 后验分布参数 (用于汤普森采样) */
  posteriorParams?: BetaDistributionParams;
}

/** Beta分布参数 (汤普森采样) */
export interface BetaDistributionParams {
  /** 成功次数 (α) */
  alpha: number;
  /** 失败次数 (β) */
  beta: number;
}

/** 决策记录 */
export interface DecisionRecord {
  /** 记录ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 选中的动作ID */
  selectedActionId: string;
  /** 上下文信息 */
  context: DecisionContext;
  /** 使用的策略类型 */
  strategy: DecisionStrategyType;
  /** 策略特定参数 */
  strategyParams: StrategyParams;
  /** 决策结果 (后续反馈) */
  outcome?: DecisionOutcome;
  /** 决策时的动作价值估计 */
  actionValuesSnapshot: Record<string, ActionValue>;
  /** 决策置信度 */
  confidence: number;
  /** 探索标记 */
  isExploration: boolean;
}

/** 决策结果/反馈 */
export interface DecisionOutcome {
  /** 实际获得的奖励 */
  reward: number;
  /** 反馈时间戳 */
  feedbackTimestamp: number;
  /** 延迟 (从决策到反馈的时间) */
  latency: number;
  /** 结果描述 */
  description?: string;
  /** 关联的记忆更新 */
  memoryUpdates?: string[];
}

/** 决策上下文 */
export interface DecisionContext {
  /** 上下文ID */
  id: string;
  /** 上下文向量表示 */
  embedding?: Vector;
  /** 相关记忆场ID */
  activeFieldIds?: string[];
  /** 环境状态描述 */
  stateDescription?: string;
  /** 时间上下文 */
  temporalContext?: {
    timeOfDay?: number;
    dayOfWeek?: number;
    recencyBias?: number;
  };
  /** 用户/代理特定上下文 */
  agentContext?: Record<string, unknown>;
}

/** 策略类型 */
export type DecisionStrategyType = "epsilon-greedy" | "ucb" | "thompson-sampling" | "softmax";

/** 策略参数 */
export type StrategyParams =
  | EpsilonGreedyParams
  | UCBParams
  | ThompsonSamplingParams
  | SoftmaxParams;

/** ε-贪婪策略参数 */
export interface EpsilonGreedyParams {
  type: "epsilon-greedy";
  /** 探索率 ε (0-1) */
  epsilon: number;
  /** 自适应衰减率 */
  decayRate?: number;
  /** 最小探索率 */
  minEpsilon?: number;
}

/** UCB策略参数 */
export interface UCBParams {
  type: "ucb";
  /** 探索系数 c */
  explorationCoefficient: number;
  /** 使用UCB1-Tuned变体 */
  useTuned?: boolean;
}

/** 汤普森采样策略参数 */
export interface ThompsonSamplingParams {
  type: "thompson-sampling";
  /** 先验分布参数 */
  priorAlpha?: number;
  priorBeta?: number;
  /** 是否使用高斯分布 (连续奖励) */
  useGaussian?: boolean;
  /** 高斯先验方差 */
  priorVariance?: number;
}

/** Softmax策略参数 */
export interface SoftmaxParams {
  type: "softmax";
  /** 温度参数 τ */
  temperature: number;
  /** 自适应温度调整 */
  adaptive?: boolean;
  /** 最小温度 */
  minTemperature?: number;
}

/** 决策引擎配置 */
export interface DecisionEngineConfig {
  /** 默认策略类型 */
  defaultStrategy: DecisionStrategyType;
  /** 策略参数 */
  strategyParams: StrategyParams;
  /** 最大历史记录数 */
  maxHistorySize: number;
  /** 上下文相似度阈值 */
  contextSimilarityThreshold: number;
  /** 是否启用上下文感知 */
  enableContextAwareness: boolean;
  /** 是否启用贝叶斯更新 */
  enableBayesianUpdate: boolean;
  /** 冷却时间 (ms) */
  cooldownMs: number;
}

/** 决策结果 */
export interface DecisionResult {
  /** 选中的动作 */
  action: Action;
  /** 决策记录ID */
  recordId: string;
  /** 决策置信度 */
  confidence: number;
  /** 是否为探索性决策 */
  isExploration: boolean;
  /** 所有动作的分数 */
  actionScores: Record<string, number>;
  /** 策略类型 */
  strategy: DecisionStrategyType;
  /** 策略解释 */
  explanation: string;
}

/** 策略性能统计 */
export interface StrategyPerformance {
  /** 策略类型 */
  strategy: DecisionStrategyType;
  /** 使用次数 */
  usageCount: number;
  /** 平均奖励 */
  averageReward: number;
  /** 奖励方差 */
  rewardVariance: number;
  /** 探索率 */
  explorationRate: number;
  /** 收敛速度 */
  convergenceRate: number;
  /** 上下文命中率 */
  contextHitRate: number;
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_DECISION_ENGINE_CONFIG: DecisionEngineConfig = {
  defaultStrategy: "ucb",
  strategyParams: {
    type: "ucb",
    explorationCoefficient: Math.sqrt(2),
    useTuned: false,
  },
  maxHistorySize: 10000,
  contextSimilarityThreshold: 0.7,
  enableContextAwareness: true,
  enableBayesianUpdate: true,
  cooldownMs: 0,
};

// ============================================================================
// 决策策略引擎
// ============================================================================

export class DecisionStrategyEngine {
  private config: DecisionEngineConfig;

  // 动作价值存储: contextId -> actionId -> ActionValue
  private contextActionValues: Map<string, Map<string, ActionValue>> = new Map();

  // 全局动作价值 (上下文未知时使用)
  private globalActionValues: Map<string, ActionValue> = new Map();

  // 决策历史
  private decisionHistory: DecisionRecord[] = [];

  // 上下文历史
  private contextHistory: Map<string, DecisionContext> = new Map();

  // 策略性能统计
  private strategyStats: Map<DecisionStrategyType, StrategyPerformance> = new Map();

  // 当前策略参数 (支持动态调整)
  private currentStrategyParams: StrategyParams;

  // 上次决策时间
  private lastDecisionTime = 0;

  constructor(config: Partial<DecisionEngineConfig> = {}) {
    this.config = { ...DEFAULT_DECISION_ENGINE_CONFIG, ...config };
    this.currentStrategyParams = this.config.strategyParams;
    this.initializeStrategyStats();
  }

  // ========================================================================
  // 公共 API
  // ========================================================================

  /**
   * 执行决策
   * @param actions 可选动作列表
   * @param context 决策上下文
   * @param strategyOverride 临时覆盖策略
   */
  decide(
    actions: Action[],
    context?: DecisionContext,
    strategyOverride?: DecisionStrategyType,
  ): DecisionResult {
    // 冷却检查
    const now = Date.now();
    if (now - this.lastDecisionTime < this.config.cooldownMs) {
      throw new Error("Decision cooldown in effect");
    }
    this.lastDecisionTime = now;

    // 验证输入
    if (actions.length === 0) {
      throw new Error("No actions provided for decision");
    }

    // 确保上下文
    const ctx = context ?? this.createDefaultContext();
    this.contextHistory.set(ctx.id, ctx);

    // 获取或初始化动作价值
    const actionValues = this.getOrCreateActionValues(actions, ctx);

    // 选择策略
    const strategy = strategyOverride ?? this.config.defaultStrategy;
    const params = this.getStrategyParams(strategy);

    // 执行策略选择
    const selection = this.executeStrategy(actions, actionValues, strategy, params, ctx);

    // 更新选择统计
    this.updateSelectionStats(selection.actionId, actionValues);

    // 创建决策记录
    const record = this.createDecisionRecord(
      selection,
      actions,
      ctx,
      strategy,
      params,
      actionValues,
    );
    this.decisionHistory.push(record);
    this.maintainHistorySize();

    // 更新策略统计
    this.updateStrategyStats(strategy, selection.isExploration);

    return {
      action: actions.find((a) => a.id === selection.actionId)!,
      recordId: record.id,
      confidence: selection.confidence,
      isExploration: selection.isExploration,
      actionScores: selection.scores,
      strategy,
      explanation: this.generateExplanation(selection, strategy, actions),
    };
  }

  /**
   * 更新决策反馈 (贝叶斯更新)
   * @param recordId 决策记录ID
   * @param reward 实际奖励值
   * @param outcomeDescription 结果描述
   */
  updateFeedback(recordId: string, reward: number, outcomeDescription?: string): DecisionRecord {
    const record = this.decisionHistory.find((r) => r.id === recordId);
    if (!record) {
      throw new Error(`Decision record not found: ${recordId}`);
    }

    if (record.outcome) {
      throw new Error(`Feedback already provided for record: ${recordId}`);
    }

    // 创建结果记录
    const outcome: DecisionOutcome = {
      reward,
      feedbackTimestamp: Date.now(),
      latency: Date.now() - record.timestamp,
      description: outcomeDescription,
    };
    record.outcome = outcome;

    // 贝叶斯更新
    if (this.config.enableBayesianUpdate) {
      this.performBayesianUpdate(record, reward);
    } else {
      this.performStandardUpdate(record, reward);
    }

    // 更新策略性能统计
    this.updateStrategyPerformance(record.strategy, reward);

    return record;
  }

  /**
   * 批量更新反馈
   */
  batchUpdateFeedback(
    updates: Array<{ recordId: string; reward: number; description?: string }>,
  ): DecisionRecord[] {
    return updates.map((u) => this.updateFeedback(u.recordId, u.reward, u.description));
  }

  /**
   * 评估决策置信度
   * @param actionId 动作ID
   * @param context 上下文
   */
  evaluateConfidence(actionId: string, context?: DecisionContext): number {
    const ctx = context ?? this.createDefaultContext();
    const actionValues = this.getActionValuesForContext(ctx);
    const actionValue = actionValues.get(actionId);

    if (!actionValue) {
      return 0;
    }

    // 基于样本数量和经验方差计算置信度
    const sampleConfidence = Math.min(1, actionValue.selectCount / 10);

    // 计算奖励方差
    const variance = this.calculateVariance(actionValue.rewardHistory);
    const varianceConfidence = Math.max(0, 1 - variance);

    // 上下文匹配度
    let contextConfidence = 1;
    if (this.config.enableContextAwareness && context) {
      contextConfidence = this.calculateContextConfidence(context, actionId);
    }

    return sampleConfidence * 0.4 + varianceConfidence * 0.3 + contextConfidence * 0.3;
  }

  /**
   * 获取动作价值估计
   * @param actionId 动作ID
   * @param context 可选上下文，不提供则返回所有上下文中的聚合值
   */
  getActionValue(actionId: string, context?: DecisionContext): ActionValue | undefined {
    // 如果提供了上下文，优先查找该上下文的价值
    if (context && this.config.enableContextAwareness) {
      const contextValues = this.contextActionValues.get(context.id);
      if (contextValues?.has(actionId)) {
        return contextValues.get(actionId);
      }
    }

    // 查找全局价值
    const globalValue = this.globalActionValues.get(actionId);
    if (globalValue) {
      return globalValue;
    }

    // 尝试从所有上下文中聚合
    return this.aggregateActionValueFromContexts(actionId);
  }

  /**
   * 从所有上下文聚合动作价值
   */
  private aggregateActionValueFromContexts(actionId: string): ActionValue | undefined {
    let totalSelectCount = 0;
    let totalReward = 0;
    const allRewards: number[] = [];
    let totalAlpha = 1;
    let totalBeta = 1;
    let found = false;

    // 收集所有上下文中的数据
    for (const contextValues of this.contextActionValues.values()) {
      const av = contextValues.get(actionId);
      if (av && av.selectCount > 0) {
        found = true;
        totalSelectCount += av.selectCount;
        totalReward += av.totalReward;
        allRewards.push(...av.rewardHistory);
        if (av.posteriorParams) {
          totalAlpha += av.posteriorParams.alpha - 1;
          totalBeta += av.posteriorParams.beta - 1;
        }
      }
    }

    if (!found) {
      return undefined;
    }

    return {
      actionId,
      estimatedValue: totalSelectCount > 0 ? totalReward / totalSelectCount : 0,
      selectCount: totalSelectCount,
      totalReward: totalReward,
      rewardHistory: allRewards.slice(-100), // 限制历史长度
      posteriorParams: { alpha: totalAlpha, beta: totalBeta },
    };
  }

  /**
   * 获取策略性能统计
   */
  getStrategyPerformance(
    strategy?: DecisionStrategyType,
  ): StrategyPerformance | Map<DecisionStrategyType, StrategyPerformance> {
    if (strategy) {
      return this.strategyStats.get(strategy) ?? this.createEmptyStrategyPerformance(strategy);
    }
    return new Map(this.strategyStats);
  }

  /**
   * 获取决策历史
   */
  getDecisionHistory(limit?: number): DecisionRecord[] {
    const history = [...this.decisionHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * 切换策略
   */
  switchStrategy(strategy: DecisionStrategyType, params?: Partial<StrategyParams>): void {
    this.config.defaultStrategy = strategy;
    if (params) {
      this.currentStrategyParams = {
        ...this.getDefaultParams(strategy),
        ...params,
      } as StrategyParams;
    } else {
      this.currentStrategyParams = this.getDefaultParams(strategy);
    }
  }

  /**
   * 动态调整探索参数
   */
  adjustExploration(factor: number): void {
    const params = this.currentStrategyParams;

    switch (params.type) {
      case "epsilon-greedy": {
        const newEpsilon = Math.max(
          params.minEpsilon ?? 0.01,
          Math.min(1, params.epsilon * factor),
        );
        this.currentStrategyParams = { ...params, epsilon: newEpsilon };
        break;
      }
      case "softmax": {
        const newTemp = Math.max(params.minTemperature ?? 0.01, params.temperature * factor);
        this.currentStrategyParams = { ...params, temperature: newTemp };
        break;
      }
      case "ucb": {
        const newCoeff = Math.max(0.1, params.explorationCoefficient * factor);
        this.currentStrategyParams = { ...params, explorationCoefficient: newCoeff };
        break;
      }
    }
  }

  /**
   * 重置动作价值 (用于非平稳环境)
   * @param contextId 可选特定上下文ID，不提供则重置所有
   * @returns 是否成功重置
   */
  resetActionValues(contextId?: string): boolean {
    if (contextId) {
      return this.contextActionValues.delete(contextId);
    } else {
      this.contextActionValues.clear();
      this.globalActionValues.clear();
      return true;
    }
  }

  /**
   * 获取引擎状态
   */
  getState(): {
    config: DecisionEngineConfig;
    totalDecisions: number;
    contextCount: number;
    averageReward: number;
    currentStrategy: DecisionStrategyType;
  } {
    const totalReward = this.decisionHistory
      .filter((r) => r.outcome)
      .reduce((sum, r) => sum + (r.outcome?.reward ?? 0), 0);
    const completedDecisions = this.decisionHistory.filter((r) => r.outcome).length;

    return {
      config: this.config,
      totalDecisions: this.decisionHistory.length,
      contextCount: this.contextActionValues.size,
      averageReward: completedDecisions > 0 ? totalReward / completedDecisions : 0,
      currentStrategy: this.config.defaultStrategy,
    };
  }

  /**
   * 销毁引擎，清理资源
   */
  destroy(): void {
    this.contextActionValues.clear();
    this.globalActionValues.clear();
    this.decisionHistory = [];
    this.contextHistory.clear();
    this.strategyStats.clear();
  }

  // ========================================================================
  // 决策策略实现
  // ========================================================================

  private executeStrategy(
    actions: Action[],
    actionValues: Map<string, ActionValue>,
    strategy: DecisionStrategyType,
    params: StrategyParams,
    context: DecisionContext,
  ): {
    actionId: string;
    confidence: number;
    isExploration: boolean;
    scores: Record<string, number>;
  } {
    switch (strategy) {
      case "epsilon-greedy":
        return this.epsilonGreedy(actions, actionValues, params as EpsilonGreedyParams);
      case "ucb":
        return this.ucb(actions, actionValues, params as UCBParams);
      case "thompson-sampling":
        return this.thompsonSampling(actions, actionValues, params as ThompsonSamplingParams);
      case "softmax":
        return this.softmax(actions, actionValues, params as SoftmaxParams);
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * ε-贪婪策略
   * 以 ε 概率随机探索，否则选择当前最优
   */
  private epsilonGreedy(
    actions: Action[],
    actionValues: Map<string, ActionValue>,
    params: EpsilonGreedyParams,
  ): {
    actionId: string;
    confidence: number;
    isExploration: boolean;
    scores: Record<string, number>;
  } {
    const epsilon = params.epsilon;
    const isExploration = Math.random() < epsilon;
    const scores: Record<string, number> = {};

    // 计算所有动作的分数
    for (const action of actions) {
      const av = actionValues.get(action.id);
      scores[action.id] = av?.estimatedValue ?? 0;
    }

    if (isExploration) {
      // 随机选择
      const randomAction = actions[Math.floor(Math.random() * actions.length)]!;
      return {
        actionId: randomAction.id,
        confidence: epsilon / actions.length,
        isExploration: true,
        scores,
      };
    } else {
      // 选择最优
      const bestAction = this.selectBestAction(actions, actionValues);
      const bestValue = actionValues.get(bestAction.id)?.estimatedValue ?? 0;

      // 计算置信度 (与次优的差距)
      const secondBestValue =
        actions
          .filter((a) => a.id !== bestAction.id)
          .map((a) => actionValues.get(a.id)?.estimatedValue ?? 0)
          .sort((a, b) => b - a)[0] ?? 0;

      const confidence = Math.min(1, Math.max(0.5, 1 - secondBestValue / (bestValue + 0.001)));

      return {
        actionId: bestAction.id,
        confidence,
        isExploration: false,
        scores,
      };
    }
  }

  /**
   * UCB (Upper Confidence Bound) 策略
   * UCB(a) = Q(a) + c * sqrt(2 * ln(N) / N(a))
   */
  private ucb(
    actions: Action[],
    actionValues: Map<string, ActionValue>,
    params: UCBParams,
  ): {
    actionId: string;
    confidence: number;
    isExploration: boolean;
    scores: Record<string, number>;
  } {
    const totalSelections = Array.from(actionValues.values()).reduce(
      (sum, av) => sum + av.selectCount,
      0,
    );

    const c = params.explorationCoefficient;
    const scores: Record<string, number> = {};
    let maxScore = -Infinity;
    let bestActionId = "";

    for (const action of actions) {
      const av = actionValues.get(action.id);
      const qValue = av?.estimatedValue ?? 0;
      const nValue = av?.selectCount ?? 0;

      let ucbScore: number;

      if (nValue === 0) {
        // 未尝试过的动作给予最高优先级
        ucbScore = Infinity;
      } else {
        const explorationBonus = c * Math.sqrt((2 * Math.log(totalSelections + 1)) / nValue);

        if (params.useTuned) {
          // UCB1-Tuned: 考虑奖励方差
          const variance = this.calculateVariance(av?.rewardHistory ?? [0]);
          const tunedBonus = Math.min(
            0.25,
            variance + Math.sqrt((2 * Math.log(totalSelections + 1)) / nValue),
          );
          ucbScore = qValue + Math.sqrt((Math.log(totalSelections + 1) / nValue) * tunedBonus);
        } else {
          ucbScore = qValue + explorationBonus;
        }
      }

      scores[action.id] = ucbScore;

      if (ucbScore > maxScore) {
        maxScore = ucbScore;
        bestActionId = action.id;
      }
    }

    // 处理所有动作都未尝试的情况
    if (maxScore === Infinity) {
      const unexplored = actions.filter((a) => !actionValues.get(a.id)?.selectCount);
      bestActionId = unexplored[Math.floor(Math.random() * unexplored.length)]!.id;
    }

    const bestAv = actionValues.get(bestActionId);
    const confidence =
      bestAv && bestAv.selectCount > 0 ? Math.min(1, bestAv.estimatedValue / maxScore) : 0.5;

    return {
      actionId: bestActionId,
      confidence,
      isExploration: maxScore === Infinity || (bestAv?.selectCount ?? 0) < 5,
      scores,
    };
  }

  /**
   * 汤普森采样策略
   * 从贝塔分布采样选择动作
   */
  private thompsonSampling(
    actions: Action[],
    actionValues: Map<string, ActionValue>,
    params: ThompsonSamplingParams,
  ): {
    actionId: string;
    confidence: number;
    isExploration: boolean;
    scores: Record<string, number>;
  } {
    const scores: Record<string, number> = {};
    let maxSample = -Infinity;
    let bestActionId = "";
    const priorAlpha = params.priorAlpha ?? 1;
    const priorBeta = params.priorBeta ?? 1;

    for (const action of actions) {
      const av = actionValues.get(action.id);
      let sample: number;

      if (params.useGaussian) {
        // 高斯汤普森采样 (连续奖励)
        const history = av?.rewardHistory ?? [];
        const mean = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0;
        const variance = params.priorVariance ?? 1;
        const n = history.length || 1;
        // 后验方差
        const posteriorVar = variance / n;
        // 采样
        sample = this.sampleGaussian(mean, Math.sqrt(posteriorVar));
      } else {
        // Beta-伯努利汤普森采样
        const alpha = av?.posteriorParams?.alpha ?? priorAlpha;
        const beta = av?.posteriorParams?.beta ?? priorBeta;
        sample = this.sampleBeta(alpha, beta);
      }

      scores[action.id] = sample;

      if (sample > maxSample) {
        maxSample = sample;
        bestActionId = action.id;
      }
    }

    const bestAv = actionValues.get(bestActionId);
    const confidence =
      bestAv && bestAv.posteriorParams
        ? bestAv.posteriorParams.alpha /
          (bestAv.posteriorParams.alpha + bestAv.posteriorParams.beta)
        : 0.5;

    return {
      actionId: bestActionId,
      confidence,
      isExploration: (bestAv?.selectCount ?? 0) < 3,
      scores,
    };
  }

  /**
   * Softmax (Boltzmann) 策略
   * P(a) = exp(Q(a)/τ) / Σexp(Q(i)/τ)
   */
  private softmax(
    actions: Action[],
    actionValues: Map<string, ActionValue>,
    params: SoftmaxParams,
  ): {
    actionId: string;
    confidence: number;
    isExploration: boolean;
    scores: Record<string, number>;
  } {
    const temperature = params.temperature;
    const qValues = actions.map((a) => actionValues.get(a.id)?.estimatedValue ?? 0);

    // 数值稳定性处理：减去最大值
    const maxQ = Math.max(...qValues);
    const expValues = qValues.map((q) => Math.exp((q - maxQ) / temperature));
    const sumExp = expValues.reduce((a, b) => a + b, 0);

    const probabilities = expValues.map((exp) => exp / sumExp);

    // 累积概率采样
    const random = Math.random();
    let cumulative = 0;
    let selectedIndex = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i]!;
      if (random <= cumulative) {
        selectedIndex = i;
        break;
      }
    }

    const scores: Record<string, number> = {};
    actions.forEach((action, i) => {
      scores[action.id] = probabilities[i]!;
    });

    const selectedAction = actions[selectedIndex]!;
    const selectedProb = probabilities[selectedIndex]!;
    const maxProb = Math.max(...probabilities);

    // 置信度：选择概率与最大概率的比值
    const confidence = maxProb > 0 ? selectedProb / maxProb : 1 / actions.length;

    return {
      actionId: selectedAction.id,
      confidence,
      isExploration: selectedProb < maxProb * 0.8,
      scores,
    };
  }

  // ========================================================================
  // 贝叶斯更新机制
  // ========================================================================

  private performBayesianUpdate(record: DecisionRecord, reward: number): void {
    const actionId = record.selectedActionId;
    const contextId = record.context.id;

    // 更新上下文特定的价值
    const contextValues = this.contextActionValues.get(contextId);
    if (contextValues?.has(actionId)) {
      this.updateActionValueBayesian(contextValues.get(actionId)!, reward);
    }

    // 更新全局价值
    const globalValue = this.globalActionValues.get(actionId);
    if (globalValue) {
      this.updateActionValueBayesian(globalValue, reward);
    }
  }

  private updateActionValueBayesian(actionValue: ActionValue, reward: number): void {
    // 归一化奖励到 [0, 1] 用于 Beta 更新
    const normalizedReward = Math.max(0, Math.min(1, (reward + 1) / 2));

    // 初始化后验参数
    if (!actionValue.posteriorParams) {
      actionValue.posteriorParams = { alpha: 1, beta: 1 };
    }

    // Beta-Bernoulli 更新
    if (normalizedReward > 0.5) {
      actionValue.posteriorParams.alpha += 1;
    } else {
      actionValue.posteriorParams.beta += 1;
    }

    // 使用 MAP 估计更新 Q 值
    const { alpha, beta } = actionValue.posteriorParams;
    actionValue.estimatedValue = ((alpha - 1) / (alpha + beta - 2)) * 2 - 1; // 映射回 [-1, 1]

    // 同时保留样本均值作为对比
    actionValue.totalReward += reward;
    actionValue.rewardHistory.push(reward);

    // 限制历史长度
    if (actionValue.rewardHistory.length > 1000) {
      actionValue.rewardHistory = actionValue.rewardHistory.slice(-500);
    }
  }

  private performStandardUpdate(record: DecisionRecord, reward: number): void {
    const actionId = record.selectedActionId;
    const contextId = record.context.id;

    const updateValue = (av: ActionValue): void => {
      av.totalReward += reward;
      av.selectCount += 1;
      av.rewardHistory.push(reward);

      // 增量更新均值 (Q-learning 风格)
      const learningRate = 1 / av.selectCount;
      av.estimatedValue = av.estimatedValue + learningRate * (reward - av.estimatedValue);

      // 限制历史长度
      if (av.rewardHistory.length > 1000) {
        av.rewardHistory = av.rewardHistory.slice(-500);
      }
    };

    // 更新上下文价值
    const contextValues = this.contextActionValues.get(contextId);
    if (contextValues?.has(actionId)) {
      updateValue(contextValues.get(actionId)!);
    }

    // 更新全局价值
    const globalValue = this.globalActionValues.get(actionId);
    if (globalValue) {
      updateValue(globalValue);
    }
  }

  // ========================================================================
  // 上下文感知
  // ========================================================================

  private getOrCreateActionValues(
    actions: Action[],
    context: DecisionContext,
  ): Map<string, ActionValue> {
    // 尝试找到相似上下文
    const similarContextId = this.findSimilarContext(context);

    if (similarContextId && this.config.enableContextAwareness) {
      const existing = this.contextActionValues.get(similarContextId);
      if (existing) {
        // 复制已有上下文的价值估计
        const values = new Map(existing);
        // 添加新动作
        for (const action of actions) {
          if (!values.has(action.id)) {
            const newValue = this.createDefaultActionValue(action.id);
            values.set(action.id, newValue);
            // 同时初始化全局价值
            if (!this.globalActionValues.has(action.id)) {
              this.globalActionValues.set(action.id, { ...newValue });
            }
          }
        }
        this.contextActionValues.set(context.id, values);
        return values;
      }
    }

    // 创建新的动作价值映射
    const values = new Map<string, ActionValue>();
    for (const action of actions) {
      // 优先使用全局价值作为初始值
      const globalValue = this.globalActionValues.get(action.id);
      const value = globalValue
        ? { ...globalValue, selectCount: 0, rewardHistory: [] }
        : this.createDefaultActionValue(action.id);

      values.set(action.id, value);

      // 同时更新全局价值 (如果尚未存在)
      if (!this.globalActionValues.has(action.id)) {
        this.globalActionValues.set(action.id, { ...value });
      }
    }

    this.contextActionValues.set(context.id, values);
    return values;
  }

  private findSimilarContext(context: DecisionContext): string | undefined {
    if (!context.embedding) return undefined;

    let bestMatch: string | undefined;
    let bestSimilarity = this.config.contextSimilarityThreshold;

    for (const [ctxId, ctx] of this.contextHistory) {
      if (!ctx.embedding || ctxId === context.id) continue;

      const similarity = this.cosineSimilarity(context.embedding, ctx.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = ctxId;
      }
    }

    return bestMatch;
  }

  private calculateContextConfidence(context: DecisionContext, actionId: string): number {
    // 基于相似上下文的成功率计算置信度
    let totalSuccess = 0;
    let totalCount = 0;

    for (const record of this.decisionHistory) {
      if (record.selectedActionId !== actionId) continue;

      const ctxSimilarity =
        context.embedding && record.context.embedding
          ? this.cosineSimilarity(context.embedding, record.context.embedding)
          : 0;

      if (ctxSimilarity > this.config.contextSimilarityThreshold && record.outcome) {
        totalSuccess += record.outcome.reward > 0 ? 1 : 0;
        totalCount++;
      }
    }

    return totalCount > 0 ? totalSuccess / totalCount : 0.5;
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  private createDefaultActionValue(actionId: string): ActionValue {
    return {
      actionId,
      estimatedValue: 0,
      selectCount: 0,
      totalReward: 0,
      rewardHistory: [],
      posteriorParams: { alpha: 1, beta: 1 },
    };
  }

  private createDefaultContext(): DecisionContext {
    return {
      id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      temporalContext: {
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        recencyBias: 1,
      },
    };
  }

  private selectBestAction(actions: Action[], actionValues: Map<string, ActionValue>): Action {
    let bestAction = actions[0]!;
    let bestValue = actionValues.get(bestAction.id)?.estimatedValue ?? -Infinity;

    for (const action of actions.slice(1)) {
      const value = actionValues.get(action.id)?.estimatedValue ?? -Infinity;
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  private updateSelectionStats(actionId: string, actionValues: Map<string, ActionValue>): void {
    const av = actionValues.get(actionId);
    if (av) {
      av.selectCount += 1;
    }
  }

  private createDecisionRecord(
    selection: {
      actionId: string;
      confidence: number;
      isExploration: boolean;
      scores: Record<string, number>;
    },
    actions: Action[],
    context: DecisionContext,
    strategy: DecisionStrategyType,
    params: StrategyParams,
    actionValues: Map<string, ActionValue>,
  ): DecisionRecord {
    const actionValuesSnapshot: Record<string, ActionValue> = {};
    for (const [id, av] of actionValues) {
      actionValuesSnapshot[id] = { ...av };
    }

    return {
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      selectedActionId: selection.actionId,
      context,
      strategy,
      strategyParams: params,
      actionValuesSnapshot,
      confidence: selection.confidence,
      isExploration: selection.isExploration,
    };
  }

  private generateExplanation(
    selection: {
      actionId: string;
      confidence: number;
      isExploration: boolean;
      scores: Record<string, number>;
    },
    strategy: DecisionStrategyType,
    actions: Action[],
  ): string {
    const strategyNames: Record<DecisionStrategyType, string> = {
      "epsilon-greedy": "ε-贪婪",
      ucb: "UCB",
      "thompson-sampling": "汤普森采样",
      softmax: "Softmax",
    };

    const action = actions.find((a) => a.id === selection.actionId);
    const exploreText = selection.isExploration ? "探索性" : "利用性";

    return `使用${strategyNames[strategy]}策略进行${exploreText}决策，"${action?.description ?? selection.actionId}"(置信度: ${(selection.confidence * 100).toFixed(1)}%)`;
  }

  private maintainHistorySize(): void {
    if (this.decisionHistory.length > this.config.maxHistorySize) {
      this.decisionHistory = this.decisionHistory.slice(
        -Math.floor(this.config.maxHistorySize * 0.8),
      );
    }
  }

  private initializeStrategyStats(): void {
    const strategies: DecisionStrategyType[] = [
      "epsilon-greedy",
      "ucb",
      "thompson-sampling",
      "softmax",
    ];

    for (const strategy of strategies) {
      this.strategyStats.set(strategy, this.createEmptyStrategyPerformance(strategy));
    }
  }

  private createEmptyStrategyPerformance(strategy: DecisionStrategyType): StrategyPerformance {
    return {
      strategy,
      usageCount: 0,
      averageReward: 0,
      rewardVariance: 0,
      explorationRate: 0,
      convergenceRate: 0,
      contextHitRate: 0,
    };
  }

  private updateStrategyStats(strategy: DecisionStrategyType, isExploration: boolean): void {
    const stats = this.strategyStats.get(strategy);
    if (stats) {
      stats.usageCount += 1;
      if (isExploration) {
        stats.explorationRate =
          (stats.explorationRate * (stats.usageCount - 1) + 1) / stats.usageCount;
      }
    }
  }

  private updateStrategyPerformance(strategy: DecisionStrategyType, reward: number): void {
    const stats = this.strategyStats.get(strategy);
    if (!stats) return;

    const completedDecisions = this.decisionHistory.filter(
      (r) => r.strategy === strategy && r.outcome,
    ).length;

    // 增量更新平均奖励
    stats.averageReward = stats.averageReward + (reward - stats.averageReward) / completedDecisions;

    // 更新方差 (Welford算法)
    const delta = reward - stats.averageReward;
    stats.rewardVariance =
      (stats.rewardVariance * (completedDecisions - 1) + delta * delta) / completedDecisions;
  }

  private getStrategyParams(strategy: DecisionStrategyType): StrategyParams {
    if (this.currentStrategyParams.type === strategy) {
      return this.currentStrategyParams;
    }
    return this.getDefaultParams(strategy);
  }

  private getDefaultParams(strategy: DecisionStrategyType): StrategyParams {
    switch (strategy) {
      case "epsilon-greedy":
        return { type: "epsilon-greedy", epsilon: 0.1, decayRate: 0.995, minEpsilon: 0.01 };
      case "ucb":
        return { type: "ucb", explorationCoefficient: Math.sqrt(2), useTuned: false };
      case "thompson-sampling":
        return { type: "thompson-sampling", priorAlpha: 1, priorBeta: 1, useGaussian: false };
      case "softmax":
        return { type: "softmax", temperature: 1.0, adaptive: false, minTemperature: 0.1 };
    }
  }

  private getActionValuesForContext(context: DecisionContext): Map<string, ActionValue> {
    return this.contextActionValues.get(context.id) ?? this.globalActionValues;
  }

  // ========================================================================
  // 数学工具函数
  // ========================================================================

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  private sampleBeta(alpha: number, beta: number): number {
    // 使用 Marsaglia 方法从 Beta 分布采样
    const x = this.sampleGamma(alpha, 1);
    const y = this.sampleGamma(beta, 1);
    return x / (x + y);
  }

  private sampleGamma(shape: number, scale: number): number {
    // 简化版 Gamma 采样 (shape >= 1)
    if (shape < 1) {
      return this.sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    // Marsaglia and Tsang 方法
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x = this.sampleStandardNormal();
      let v = Math.pow(1 + c * x, 3);

      if (v > 0) {
        let u = Math.random();
        if (u < 1 - 0.0331 * x * x * x * x) {
          return d * v * scale;
        }
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
          return d * v * scale;
        }
      }
    }
  }

  private sampleStandardNormal(): number {
    // Box-Muller 变换
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private sampleGaussian(mean: number, std: number): number {
    return mean + std * this.sampleStandardNormal();
  }

  private cosineSimilarity(a: Vector, b: Vector): number {
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const ai = a[i]!;
      const bi = b[i]!;
      dot += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createDecisionEngine(
  config?: Partial<DecisionEngineConfig>,
): DecisionStrategyEngine {
  return new DecisionStrategyEngine(config);
}

// ============================================================================
// 预配置策略引擎
// ============================================================================

export const createEpsilonGreedyEngine = (epsilon = 0.1): DecisionStrategyEngine => {
  return createDecisionEngine({
    defaultStrategy: "epsilon-greedy",
    strategyParams: {
      type: "epsilon-greedy",
      epsilon,
      decayRate: 0.995,
      minEpsilon: 0.01,
    },
  });
};

export const createUCBEngine = (explorationCoefficient = Math.sqrt(2)): DecisionStrategyEngine => {
  return createDecisionEngine({
    defaultStrategy: "ucb",
    strategyParams: {
      type: "ucb",
      explorationCoefficient,
      useTuned: false,
    },
  });
};

export const createThompsonSamplingEngine = (useGaussian = false): DecisionStrategyEngine => {
  return createDecisionEngine({
    defaultStrategy: "thompson-sampling",
    strategyParams: {
      type: "thompson-sampling",
      priorAlpha: 1,
      priorBeta: 1,
      useGaussian,
    },
  });
};

export const createSoftmaxEngine = (temperature = 1.0): DecisionStrategyEngine => {
  return createDecisionEngine({
    defaultStrategy: "softmax",
    strategyParams: {
      type: "softmax",
      temperature,
      adaptive: false,
    },
  });
};

// ============================================================================
// 与 NSEM2Core 集成辅助函数
// ============================================================================

/**
 * 从 MemAtom 创建 Action
 */
export function actionFromMemAtom(atom: MemAtom, meta?: Record<string, unknown>): Action {
  return {
    id: atom.id,
    description: atom.content,
    type: atom.contentType,
    relatedAtomIds: [atom.id],
    meta: { ...meta, atomStrength: atom.strength.current },
  };
}

/**
 * 从 ActivatedMemory 创建决策上下文
 */
export function contextFromActivatedMemory(
  memory: {
    atoms: Array<{ atom: MemAtom; relevance: number }>;
    semantic: { centroid: Vector; coherence: number };
  },
  agentContext?: Record<string, unknown>,
): DecisionContext {
  return {
    id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    embedding: memory.semantic.centroid,
    activeFieldIds: memory.atoms.map((a) => a.atom.id),
    stateDescription: `Coherence: ${memory.semantic.coherence.toFixed(2)}`,
    temporalContext: {
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      recencyBias: 1,
    },
    agentContext,
  };
}

// ============================================================================
// 类型导出
// ============================================================================

export type { DecisionStrategyEngine as DecisionEngine };

export default DecisionStrategyEngine;
