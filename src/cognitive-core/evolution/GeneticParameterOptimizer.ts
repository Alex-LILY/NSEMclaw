/**
 * 遗传算法参数优化器 - P2 实现
 *
 * 使用遗传算法优化 NSEM2 的记忆参数配置
 * 包括: 衰减率、强化因子、激活阈值等
 */

import type { NSEM2Config } from "../types/index.js";
import { clamp } from "../utils/common.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 可优化的参数集合 */
export interface OptimizableParameters {
  /** 基础衰减率 */
  baseDecayRate: number;
  /** 强化学习因子 */
  reinforcementFactor: number;
  /** 激活阈值 */
  activationThreshold: number;
  /** 关系建立阈值 */
  relationThreshold: number;
  /** 遗忘阈值 */
  forgetThreshold: number;
  /** 场合并阈值 */
  fieldMergeThreshold: number;
  /** 传播衰减因子 */
  spreadDecayFactor: number;
  /** 最大传播深度 */
  maxSpreadDepth: number;
}

/** 个体 (参数配置) */
export interface Individual {
  /** 基因 (参数) */
  genes: OptimizableParameters;
  /** 适应度分数 */
  fitness: number;
  /** 评估次数 */
  evaluations: number;
  /** 代数 */
  generation: number;
  /** 元数据 */
  metadata: {
    createdAt: number;
    parentIds: string[];
    mutationCount: number;
  };
}

/** 优化器配置 */
export interface GeneticOptimizerConfig {
  /** 种群大小 */
  populationSize: number;
  /** 最大代数 */
  maxGenerations: number;
  /** 变异率 */
  mutationRate: number;
  /** 交叉率 */
  crossoverRate: number;
  /** 精英保留比例 */
  elitismRatio: number;
  /** 锦标赛选择大小 */
  tournamentSize: number;
  /** 收敛阈值 (适应度变化小于此值认为已收敛) */
  convergenceThreshold: number;
  /** 早停代数 (连续多少代无改善则停止) */
  earlyStopGenerations: number;
}

/** 优化结果 */
export interface OptimizationResult {
  /** 最优个体 */
  bestIndividual: Individual;
  /** 收敛代数 */
  convergedGeneration: number;
  /** 最终种群适应度统计 */
  fitnessStats: {
    min: number;
    max: number;
    avg: number;
    std: number;
  };
  /** 优化历史 */
  history: Array<{
    generation: number;
    bestFitness: number;
    avgFitness: number;
  }>;
}

/** 适应度评估函数 */
export type FitnessEvaluator = (params: OptimizableParameters) => Promise<number> | number;

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_PARAMETERS: OptimizableParameters = {
  baseDecayRate: 0.001,
  reinforcementFactor: 0.1,
  activationThreshold: 0.3,
  relationThreshold: 0.5,
  forgetThreshold: 0.05,
  fieldMergeThreshold: 0.7,
  spreadDecayFactor: 0.7,
  maxSpreadDepth: 3,
};

const DEFAULT_OPTIMIZER_CONFIG: GeneticOptimizerConfig = {
  populationSize: 50,
  maxGenerations: 100,
  mutationRate: 0.1,
  crossoverRate: 0.8,
  elitismRatio: 0.1,
  tournamentSize: 3,
  convergenceThreshold: 0.001,
  earlyStopGenerations: 20,
};

/** 参数边界 */
const PARAMETER_BOUNDS: Record<keyof OptimizableParameters, { min: number; max: number }> = {
  baseDecayRate: { min: 0.0001, max: 0.01 },
  reinforcementFactor: { min: 0.01, max: 0.5 },
  activationThreshold: { min: 0.1, max: 0.8 },
  relationThreshold: { min: 0.2, max: 0.9 },
  forgetThreshold: { min: 0.01, max: 0.2 },
  fieldMergeThreshold: { min: 0.3, max: 0.95 },
  spreadDecayFactor: { min: 0.3, max: 0.95 },
  maxSpreadDepth: { min: 1, max: 5 },
};

// ============================================================================
// 遗传算法参数优化器
// ============================================================================

export class GeneticParameterOptimizer {
  private config: GeneticOptimizerConfig;
  private population: Individual[] = [];
  private currentGeneration = 0;
  private fitnessEvaluator: FitnessEvaluator;
  private bestFitnessHistory: number[] = [];
  private noImprovementCount = 0;
  private isRunning = false;

  /** 进度回调 */
  onProgress?: (generation: number, bestFitness: number, avgFitness: number) => void;
  /** 完成回调 */
  onComplete?: (result: OptimizationResult) => void;

  constructor(fitnessEvaluator: FitnessEvaluator, config: Partial<GeneticOptimizerConfig> = {}) {
    this.fitnessEvaluator = fitnessEvaluator;
    this.config = { ...DEFAULT_OPTIMIZER_CONFIG, ...config };
  }

  // ========================================================================
  // 核心优化流程
  // ========================================================================

  /**
   * 运行优化
   */
  async optimize(): Promise<OptimizationResult> {
    if (this.isRunning) {
      throw new Error("优化已在进行中");
    }

    this.isRunning = true;
    this.currentGeneration = 0;
    this.bestFitnessHistory = [];
    this.noImprovementCount = 0;

    console.log("🧬 遗传算法参数优化开始");
    console.log(`   种群大小: ${this.config.populationSize}`);
    console.log(`   最大代数: ${this.config.maxGenerations}`);
    console.log(`   变异率: ${this.config.mutationRate}`);
    console.log(`   交叉率: ${this.config.crossoverRate}`);

    // 1. 初始化种群
    this.initializePopulation();

    // 2. 评估初始种群
    await this.evaluatePopulation();

    const history: OptimizationResult["history"] = [];
    let convergedGeneration = -1;

    // 3. 进化循环
    while (this.currentGeneration < this.config.maxGenerations) {
      this.currentGeneration++;

      // 创建新一代
      await this.createNextGeneration();

      // 评估新种群
      await this.evaluatePopulation();

      // 统计
      const stats = this.getFitnessStats();
      const bestIndividual = this.getBestIndividual();

      history.push({
        generation: this.currentGeneration,
        bestFitness: stats.max,
        avgFitness: stats.avg,
      });

      // 进度回调
      this.onProgress?.(this.currentGeneration, stats.max, stats.avg);

      // 检查收敛
      if (this.checkConvergence(stats.max)) {
        convergedGeneration = this.currentGeneration;
        console.log(`✅ 优化已收敛于第 ${convergedGeneration} 代`);
        break;
      }

      // 早停检查
      if (this.noImprovementCount >= this.config.earlyStopGenerations) {
        console.log(`⏹️ 早停: 连续 ${this.config.earlyStopGenerations} 代无改善`);
        break;
      }

      if (this.currentGeneration % 10 === 0) {
        console.log(
          `  第 ${this.currentGeneration} 代: 最佳=${stats.max.toFixed(4)}, 平均=${stats.avg.toFixed(4)}`,
        );
      }
    }

    this.isRunning = false;

    const result: OptimizationResult = {
      bestIndividual: this.getBestIndividual(),
      convergedGeneration: convergedGeneration > 0 ? convergedGeneration : this.currentGeneration,
      fitnessStats: this.getFitnessStats(),
      history,
    };

    this.onComplete?.(result);

    console.log("✅ 遗传算法优化完成");
    console.log(`   最佳适应度: ${result.fitnessStats.max.toFixed(4)}`);
    console.log(`   收敛代数: ${result.convergedGeneration}`);

    return result;
  }

  /**
   * 停止优化
   */
  stop(): void {
    this.isRunning = false;
  }

  // ========================================================================
  // 种群操作
  // ========================================================================

  /**
   * 初始化种群 - 随机生成
   */
  private initializePopulation(): void {
    this.population = [];

    for (let i = 0; i < this.config.populationSize; i++) {
      const individual = this.createRandomIndividual();
      this.population.push(individual);
    }
  }

  /**
   * 评估种群适应度
   */
  private async evaluatePopulation(): Promise<void> {
    const promises = this.population.map(async (individual) => {
      if (individual.fitness === 0) {
        const fitness = await this.fitnessEvaluator(individual.genes);
        individual.fitness = fitness;
        individual.evaluations++;
      }
    });

    await Promise.all(promises);
  }

  /**
   * 创建新一代
   */
  private async createNextGeneration(): Promise<void> {
    const newPopulation: Individual[] = [];

    // 精英保留
    const eliteCount = Math.floor(this.config.populationSize * this.config.elitismRatio);
    const sorted = [...this.population].sort((a, b) => b.fitness - a.fitness);

    for (let i = 0; i < eliteCount && i < sorted.length; i++) {
      const elite = sorted[i];
      if (elite) {
        newPopulation.push({
          ...elite,
          generation: this.currentGeneration,
        });
      }
    }

    // 生成新个体
    while (newPopulation.length < this.config.populationSize) {
      // 选择父代
      const parent1 = this.tournamentSelection();
      const parent2 = this.tournamentSelection();

      if (!parent1 || !parent2) continue;

      // 交叉
      let offspring: Individual;
      if (Math.random() < this.config.crossoverRate) {
        offspring = this.crossover(parent1, parent2);
      } else {
        offspring = Math.random() < 0.5 ? parent1 : parent2;
      }

      // 变异
      if (Math.random() < this.config.mutationRate) {
        offspring = this.mutate(offspring);
      }

      offspring.generation = this.currentGeneration;
      newPopulation.push(offspring);
    }

    this.population = newPopulation;
  }

  // ========================================================================
  // 遗传算子
  // ========================================================================

  /**
   * 锦标赛选择
   */
  private tournamentSelection(): Individual {
    let best: Individual | null = null;

    for (let i = 0; i < this.config.tournamentSize; i++) {
      const randomIdx = Math.floor(Math.random() * this.population.length);
      const candidate = this.population[randomIdx];

      if (!candidate) continue;

      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }

    return best ?? this.population[0]!;
  }

  /**
   * 交叉操作 - 均匀交叉
   */
  private crossover(parent1: Individual, parent2: Individual): Individual {
    const genes: Partial<OptimizableParameters> = {};

    for (const key of Object.keys(DEFAULT_PARAMETERS) as Array<keyof OptimizableParameters>) {
      // 均匀交叉: 随机从父代选择
      genes[key] = Math.random() < 0.5 ? parent1.genes[key] : parent2.genes[key];
    }

    return {
      genes: genes as OptimizableParameters,
      fitness: 0,
      evaluations: 0,
      generation: this.currentGeneration,
      metadata: {
        createdAt: Date.now(),
        parentIds: [parent1.metadata.createdAt.toString(), parent2.metadata.createdAt.toString()],
        mutationCount: 0,
      },
    };
  }

  /**
   * 变异操作 - 高斯变异
   */
  private mutate(individual: Individual): Individual {
    const genes = { ...individual.genes };

    for (const key of Object.keys(genes) as Array<keyof OptimizableParameters>) {
      if (Math.random() < 0.3) {
        // 每个基因有30%概率变异
        const bounds = PARAMETER_BOUNDS[key];
        const range = bounds.max - bounds.min;

        // 高斯变异
        const gaussian = this.boxMuller();
        const mutation = gaussian * range * 0.1; // 10% 的变异幅度

        genes[key] = clamp(genes[key] + mutation, bounds.min, bounds.max);

        // 整数参数特殊处理
        if (key === "maxSpreadDepth") {
          genes[key] = Math.round(genes[key]);
        }
      }
    }

    return {
      genes,
      fitness: 0,
      evaluations: 0,
      generation: this.currentGeneration,
      metadata: {
        createdAt: Date.now(),
        parentIds: [individual.metadata.createdAt.toString()],
        mutationCount: individual.metadata.mutationCount + 1,
      },
    };
  }

  /**
   * Box-Muller 变换生成正态分布随机数
   */
  private boxMuller(): number {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 创建随机个体
   */
  private createRandomIndividual(): Individual {
    const genes: Partial<OptimizableParameters> = {};

    for (const key of Object.keys(DEFAULT_PARAMETERS) as Array<keyof OptimizableParameters>) {
      const bounds = PARAMETER_BOUNDS[key];
      const value = bounds.min + Math.random() * (bounds.max - bounds.min);
      genes[key] = key === "maxSpreadDepth" ? Math.round(value) : value;
    }

    return {
      genes: genes as OptimizableParameters,
      fitness: 0,
      evaluations: 0,
      generation: 0,
      metadata: {
        createdAt: Date.now(),
        parentIds: [],
        mutationCount: 0,
      },
    };
  }

  /**
   * 获取最佳个体
   */
  getBestIndividual(): Individual {
    return this.population.reduce((best, current) =>
      current.fitness > best.fitness ? current : best,
    );
  }

  /**
   * 获取适应度统计
   */
  getFitnessStats() {
    const fitnesses = this.population.map((i) => i.fitness);
    const min = Math.min(...fitnesses);
    const max = Math.max(...fitnesses);
    const avg = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - avg, 2), 0) / fitnesses.length;
    const std = Math.sqrt(variance);

    return { min, max, avg, std };
  }

  /**
   * 检查收敛
   */
  private checkConvergence(currentBestFitness: number): boolean {
    if (this.bestFitnessHistory.length === 0) {
      this.bestFitnessHistory.push(currentBestFitness);
      return false;
    }

    const previousBest = this.bestFitnessHistory[this.bestFitnessHistory.length - 1];
    const improvement = Math.abs(currentBestFitness - previousBest);

    if (improvement < this.config.convergenceThreshold) {
      this.noImprovementCount++;
    } else {
      this.noImprovementCount = 0;
      this.bestFitnessHistory.push(currentBestFitness);
    }

    // 保持历史记录长度
    if (this.bestFitnessHistory.length > 10) {
      this.bestFitnessHistory.shift();
    }

    return improvement < this.config.convergenceThreshold && this.currentGeneration > 10;
  }

  // ========================================================================
  // 获取当前状态
  // ========================================================================

  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  getPopulation(): Individual[] {
    return [...this.population];
  }

  isOptimizing(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createGeneticOptimizer(
  fitnessEvaluator: FitnessEvaluator,
  config?: Partial<GeneticOptimizerConfig>,
): GeneticParameterOptimizer {
  return new GeneticParameterOptimizer(fitnessEvaluator, config);
}

/**
 * 默认适应度评估器 - 基于记忆系统的模拟性能
 */
export function createDefaultFitnessEvaluator(nsemConfig: Partial<NSEM2Config>): FitnessEvaluator {
  return (params: OptimizableParameters): number => {
    // 模拟评估: 基于参数的合理性计算适应度
    // 实际应用中应使用真实记忆系统的性能指标

    let fitness = 1.0;

    // 衰减率不宜过高或过低
    const decayScore = 1 - Math.abs(params.baseDecayRate - 0.001) * 100;
    fitness *= Math.max(0, decayScore);

    // 强化因子应适中
    const reinforcementScore = 1 - Math.abs(params.reinforcementFactor - 0.1) * 5;
    fitness *= Math.max(0, reinforcementScore);

    // 激活阈值不宜过高
    if (params.activationThreshold > 0.5) {
      fitness *= 0.8;
    }

    // 遗忘阈值应低于激活阈值
    if (params.forgetThreshold >= params.activationThreshold) {
      fitness *= 0.5;
    }

    // 场合并阈值应合理
    if (params.fieldMergeThreshold < 0.5) {
      fitness *= 0.9;
    }

    return Math.max(0, fitness);
  };
}

// ============================================================================
// 导出默认值
// ============================================================================

export { DEFAULT_PARAMETERS, DEFAULT_OPTIMIZER_CONFIG, PARAMETER_BOUNDS };
