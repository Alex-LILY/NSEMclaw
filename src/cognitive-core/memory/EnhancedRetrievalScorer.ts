/**
 * 增强检索评分系统
 *
 * 融合自进化决策记忆系统的综合检索评分算法:
 * Score = 0.4 × Content_Sim + 0.2 × Context_Sim + 0.2 × Importance + 0.1 × Time_Decay + 0.1 × Frequency
 *
 * 与现有的 temporal-decay.ts 和 hybrid.ts 兼容
 */

import type { MemAtom } from "../types/index.js";

// ============================================================================
// 评分配置
// ============================================================================

export interface ScoringWeights {
  /** 内容相似度权重 (默认 0.4) */
  contentSimilarity: number;
  /** 上下文相似度权重 (默认 0.2) */
  contextSimilarity: number;
  /** 重要性权重 (默认 0.2) */
  importance: number;
  /** 时间衰减权重 (默认 0.1) */
  temporalDecay: number;
  /** 访问频率权重 (默认 0.1) */
  frequency: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  /** 时间衰减半衰期 (天，默认 7) */
  temporalHalfLifeDays: number;
  /** 最大频率奖励 (默认 0.5) */
  maxFrequencyBoost: number;
  /** 最小分数阈值 (默认 0.1) */
  minScoreThreshold: number;
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  contentSimilarity: 0.4,
  contextSimilarity: 0.2,
  importance: 0.2,
  temporalDecay: 0.1,
  frequency: 0.1,
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: DEFAULT_SCORING_WEIGHTS,
  temporalHalfLifeDays: 7,
  maxFrequencyBoost: 0.5,
  minScoreThreshold: 0.1,
};

// ============================================================================
// 向量工具
// ============================================================================

/**
 * 计算余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// 评分结果
// ============================================================================

export interface ScoringResult {
  /** 总分 */
  totalScore: number;
  /** 各维度分数 */
  components: {
    contentSimilarity: number;
    contextSimilarity: number;
    importance: number;
    temporalDecay: number;
    frequency: number;
  };
  /** 是否通过阈值 */
  passedThreshold: boolean;
}

// ============================================================================
// 增强检索评分器
// ============================================================================

export class EnhancedRetrievalScorer {
  private config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = {
      ...DEFAULT_SCORING_CONFIG,
      ...config,
      weights: { ...DEFAULT_SCORING_WEIGHTS, ...config.weights },
    };
  }

  // ========================================================================
  // 核心评分方法
  // ========================================================================

  /**
   * 计算记忆的综合检索分数
   *
   * 公式: Score = w1*Content_Sim + w2*Context_Sim + w3*Importance + w4*Time_Decay + w5*Frequency
   */
  score(
    atom: MemAtom,
    queryVector: number[],
    queryContextVector?: number[],
    currentTime: number = Date.now(),
  ): ScoringResult {
    const w = this.config.weights;

    // 1. 内容相似度 (0.4)
    const contentSim = cosineSimilarity(atom.embedding, queryVector);

    // 2. 上下文相似度 (0.2)
    let contextSim = 0;
    if (queryContextVector && atom.spatial.workspace) {
      // 使用内容的 embedding 作为简化的上下文表示
      contextSim = cosineSimilarity(atom.embedding, queryContextVector) * 0.5;
    }

    // 3. 重要性分数 (0.2)
    const importance = atom.strength.current;

    // 4. 时间衰减 (0.1) - 艾宾浩斯遗忘曲线
    const temporalDecay = this.computeEbbinghausDecay(
      atom.temporal.lastAccessed,
      atom.temporal.accessCount,
      currentTime,
    );

    // 5. 访问频率 (0.1)
    const frequency = this.computeFrequencyBoost(atom.temporal.accessCount);

    // 综合评分
    const totalScore =
      w.contentSimilarity * contentSim +
      w.contextSimilarity * contextSim +
      w.importance * importance +
      w.temporalDecay * temporalDecay +
      w.frequency * frequency;

    return {
      totalScore,
      components: {
        contentSimilarity: contentSim,
        contextSimilarity: contextSim,
        importance,
        temporalDecay,
        frequency,
      },
      passedThreshold: totalScore >= this.config.minScoreThreshold,
    };
  }

  /**
   * 批量评分
   */
  scoreMany(
    atoms: MemAtom[],
    queryVector: number[],
    queryContextVector?: number[],
    currentTime: number = Date.now(),
  ): Array<{ atom: MemAtom; result: ScoringResult }> {
    return atoms.map((atom) => ({
      atom,
      result: this.score(atom, queryVector, queryContextVector, currentTime),
    }));
  }

  // ========================================================================
  // 艾宾浩斯遗忘曲线
  // ========================================================================

  /**
   * 基于艾宾浩斯遗忘曲线计算时间衰减
   *
   * 公式: R = e^(-t/S)
   * 其中: R = 保留率, t = 时间, S = 记忆强度
   *
   * 增强版考虑访问次数：频繁访问的记忆衰减慢
   */
  private computeEbbinghausDecay(
    lastAccessed: number,
    accessCount: number,
    currentTime: number,
  ): number {
    const hoursElapsed = (currentTime - lastAccessed) / (1000 * 60 * 60);

    // 基础记忆强度 (受访问次数影响)
    const baseStrength = 1.0 + Math.log1p(accessCount) * 0.5;

    // 半衰期 (天)
    const halfLifeDays = this.config.temporalHalfLifeDays * baseStrength;
    const halfLifeHours = halfLifeDays * 24;

    // 艾宾浩斯衰减
    const retention = Math.exp(-hoursElapsed / halfLifeHours);

    return Math.max(0, Math.min(1, retention));
  }

  // ========================================================================
  // 频率计算
  // ========================================================================

  /**
   * 计算访问频率奖励
   *
   * 使用对数增长避免过度加权
   */
  private computeFrequencyBoost(accessCount: number): number {
    // 对数增长: log(1 + x) * scale
    const boost = Math.log1p(accessCount) * 0.1;
    return Math.min(boost, this.config.maxFrequencyBoost);
  }

  // ========================================================================
  // 排序和筛选
  // ========================================================================

  /**
   * 排序并筛选记忆
   */
  rankAndFilter(
    scored: Array<{ atom: MemAtom; result: ScoringResult }>,
    options: {
      maxResults?: number;
      minScore?: number;
    } = {},
  ): Array<{ atom: MemAtom; score: number; components: ScoringResult["components"] }> {
    const { maxResults = 10, minScore = this.config.minScoreThreshold } = options;

    // 筛选并排序
    return scored
      .filter(({ result }) => result.totalScore >= minScore)
      .sort((a, b) => b.result.totalScore - a.result.totalScore)
      .slice(0, maxResults)
      .map(({ atom, result }) => ({
        atom,
        score: result.totalScore,
        components: result.components,
      }));
  }

  // ========================================================================
  // 配置管理
  // ========================================================================

  /**
   * 更新权重
   */
  setWeights(weights: Partial<ScoringWeights>): void {
    this.config.weights = { ...this.config.weights, ...weights };
  }

  /**
   * 获取当前权重
   */
  getWeights(): ScoringWeights {
    return { ...this.config.weights };
  }

  /**
   * 设置时间半衰期
   */
  setTemporalHalfLife(days: number): void {
    this.config.temporalHalfLifeDays = days;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createEnhancedScorer(config?: Partial<ScoringConfig>): EnhancedRetrievalScorer {
  return new EnhancedRetrievalScorer(config);
}
