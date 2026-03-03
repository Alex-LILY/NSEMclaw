/**
 * 元认知监控系统 - P3 实现
 *
 * 实现对认知过程的自我监控、评估和调节
 * 包括: 性能监控、资源管理、策略选择、自我反思
 */

import { EventEmitter } from "events";
import type { MemAtom, MemoryQuery, ActivatedMemory } from "../types/index.js";
import { clamp, generateId } from "../utils/common.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 认知操作类型 */
export type CognitiveOperation =
  | "ingest" // 记忆摄入
  | "retrieve" // 记忆检索
  | "activate" // 记忆激活
  | "evolve" // 记忆进化
  | "decide" // 决策
  | "learn"; // 学习

/** 性能指标 */
export interface PerformanceMetrics {
  /** 操作类型 */
  operation: CognitiveOperation;
  /** 操作ID */
  operationId: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 耗时 (毫秒) */
  durationMs: number;
  /** 成功率 */
  success: boolean;
  /** 结果质量分数 (0-1) */
  qualityScore: number;
  /** 资源使用 */
  resourceUsage: {
    memoryDelta: number; // 内存变化 (MB)
    cpuTime: number; // CPU时间 (ms)
    ioOperations: number; // IO操作数
  };
  /** 详细指标 */
  details: Record<string, number>;
}

/** 认知状态 */
export interface CognitiveState {
  /** 整体健康度 (0-1) */
  health: number;
  /** 当前负载 (0-1) */
  load: number;
  /** 最近性能趋势 */
  performanceTrend: "improving" | "stable" | "degrading";
  /** 活跃操作数 */
  activeOperations: number;
  /** 队列长度 */
  queueLength: number;
  /** 错误率 */
  errorRate: number;
  /** 平均响应时间 */
  avgResponseTime: number;
}

/** 认知策略 */
export interface CognitiveStrategy {
  /** 策略ID */
  id: string;
  /** 策略名称 */
  name: string;
  /** 适用操作 */
  applicableTo: CognitiveOperation[];
  /** 策略参数 */
  parameters: Record<string, number>;
  /** 策略描述 */
  description: string;
}

/** 策略评估结果 */
export interface StrategyEvaluation {
  strategy: CognitiveStrategy;
  /** 预期性能 */
  expectedPerformance: {
    accuracy: number;
    speed: number;
    resourceUsage: number;
  };
  /** 历史平均性能 */
  historicalPerformance: {
    avgQuality: number;
    avgDuration: number;
    successRate: number;
  };
  /** 推荐度 (0-1) */
  recommendationScore: number;
}

/** 元认知配置 */
export interface MetaCognitionConfig {
  /** 监控间隔 (毫秒) */
  monitorIntervalMs: number;
  /** 历史窗口大小 */
  historyWindowSize: number;
  /** 性能阈值 - 响应时间警告 */
  responseTimeWarningMs: number;
  /** 性能阈值 - 响应时间危险 */
  responseTimeCriticalMs: number;
  /** 错误率阈值 */
  errorRateThreshold: number;
  /** 负载阈值 */
  loadThreshold: number;
  /** 是否启用自动调节 */
  enableAutoAdjustment: boolean;
  /** 自动调节策略 */
  adjustmentStrategy: "conservative" | "balanced" | "aggressive";
}

/** 反思记录 */
export interface ReflectionRecord {
  id: string;
  timestamp: number;
  /** 反思类型 */
  type: "performance" | "error" | "anomaly" | "scheduled";
  /** 反思内容 */
  content: string;
  /** 观察到的现象 */
  observations: string[];
  /** 分析结果 */
  analysis: {
    rootCause?: string;
    impact: "low" | "medium" | "high" | "critical";
    confidence: number;
  };
  /** 建议 */
  recommendations: string[];
  /** 已采取的行动 */
  actions: string[];
}

/** 异常事件 */
export interface AnomalyEvent {
  id: string;
  timestamp: number;
  /** 异常类型 */
  type: "performance_drop" | "error_spike" | "memory_leak" | "deadlock" | "anomaly";
  /** 严重程度 */
  severity: "low" | "medium" | "high" | "critical";
  /** 描述 */
  description: string;
  /** 相关指标 */
  metrics: Partial<PerformanceMetrics>;
  /** 上下文 */
  context: Record<string, unknown>;
  /** 是否已解决 */
  resolved: boolean;
  /** 解决方案 */
  resolution?: string;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: MetaCognitionConfig = {
  monitorIntervalMs: 5000,
  historyWindowSize: 100,
  responseTimeWarningMs: 1000,
  responseTimeCriticalMs: 5000,
  errorRateThreshold: 0.1,
  loadThreshold: 0.8,
  enableAutoAdjustment: true,
  adjustmentStrategy: "balanced",
};

// ============================================================================
// 元认知监控系统
// ============================================================================

export class MetaCognitionMonitor extends EventEmitter {
  private config: MetaCognitionConfig;

  // 性能历史
  private performanceHistory: PerformanceMetrics[] = [];

  // 当前操作
  private activeOperations = new Map<
    string,
    {
      operation: CognitiveOperation;
      startTime: number;
      context: Record<string, unknown>;
    }
  >();

  // 策略注册表
  private strategies = new Map<string, CognitiveStrategy>();

  // 策略性能统计
  private strategyStats = new Map<
    string,
    {
      uses: number;
      totalQuality: number;
      totalDuration: number;
      successes: number;
    }
  >();

  // 反思记录
  private reflections: ReflectionRecord[] = [];

  // 异常事件
  private anomalies: AnomalyEvent[] = [];

  // 监控状态
  private isMonitoring = false;
  private monitorTimer?: NodeJS.Timeout;

  // 当前状态
  private currentState: CognitiveState = {
    health: 1.0,
    load: 0.0,
    performanceTrend: "stable",
    activeOperations: 0,
    queueLength: 0,
    errorRate: 0.0,
    avgResponseTime: 0.0,
  };

  constructor(config: Partial<MetaCognitionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.registerDefaultStrategies();
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    this.monitorTimer = setInterval(() => {
      this.performMonitoringCycle();
    }, this.config.monitorIntervalMs);

    console.log("🧠 元认知监控系统已启动");
  }

  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }

    console.log("🛑 元认知监控系统已停止");
  }

  // ========================================================================
  // 操作追踪
  // ========================================================================

  /**
   * 开始追踪操作
   */
  beginOperation(operation: CognitiveOperation, context: Record<string, unknown> = {}): string {
    const operationId = generateId("op", operation + Date.now());

    this.activeOperations.set(operationId, {
      operation,
      startTime: Date.now(),
      context,
    });

    this.updateCurrentState();

    return operationId;
  }

  /**
   * 结束追踪操作
   */
  endOperation(
    operationId: string,
    success: boolean,
    qualityScore: number,
    details: Record<string, number> = {},
  ): PerformanceMetrics {
    const active = this.activeOperations.get(operationId);
    if (!active) {
      throw new Error(`操作未找到: ${operationId}`);
    }

    const endTime = Date.now();
    const durationMs = endTime - active.startTime;

    const metrics: PerformanceMetrics = {
      operation: active.operation,
      operationId,
      startTime: active.startTime,
      endTime,
      durationMs,
      success,
      qualityScore: clamp(qualityScore, 0, 1),
      resourceUsage: {
        memoryDelta: 0, // 需要外部提供
        cpuTime: durationMs, // 简化处理
        ioOperations: 0,
      },
      details,
    };

    // 记录性能
    this.recordPerformance(metrics);

    // 清理活跃操作
    this.activeOperations.delete(operationId);

    // 更新状态
    this.updateCurrentState();

    // 检查异常
    this.checkForAnomalies(metrics);

    // 发出事件
    this.emit("operationComplete", metrics);

    return metrics;
  }

  /**
   * 记录性能指标
   */
  private recordPerformance(metrics: PerformanceMetrics): void {
    this.performanceHistory.push(metrics);

    // 保持历史窗口大小
    if (this.performanceHistory.length > this.config.historyWindowSize) {
      this.performanceHistory.shift();
    }

    // 更新策略统计
    const strategyId = metrics.details["strategyId"];
    if (strategyId) {
      const stats = this.strategyStats.get(String(strategyId)) ?? {
        uses: 0,
        totalQuality: 0,
        totalDuration: 0,
        successes: 0,
      };

      stats.uses++;
      stats.totalQuality += metrics.qualityScore;
      stats.totalDuration += metrics.durationMs;
      if (metrics.success) stats.successes++;

      this.strategyStats.set(String(strategyId), stats);
    }
  }

  // ========================================================================
  // 状态监控
  // ========================================================================

  /**
   * 执行监控周期
   */
  private performMonitoringCycle(): void {
    this.updateCurrentState();

    const state = this.currentState;

    // 检查健康状态
    if (state.health < 0.5) {
      this.emit("healthAlert", {
        level: "critical",
        health: state.health,
        state,
      });

      this.createReflection({
        type: "anomaly",
        content: `系统健康度低: ${state.health.toFixed(2)}`,
        observations: [
          `错误率: ${(state.errorRate * 100).toFixed(1)}%`,
          `平均响应时间: ${state.avgResponseTime.toFixed(0)}ms`,
          `当前负载: ${(state.load * 100).toFixed(1)}%`,
        ],
        analysis: {
          impact: state.health < 0.3 ? "critical" : "high",
          confidence: 0.8,
        },
        recommendations: this.generateRecommendations(state),
        actions: [],
      });

      // 自动调节
      if (this.config.enableAutoAdjustment) {
        this.performAutoAdjustment(state);
      }
    }

    this.emit("stateUpdate", state);
  }

  /**
   * 更新当前状态
   */
  private updateCurrentState(): void {
    const recentMetrics = this.performanceHistory.slice(-20);

    if (recentMetrics.length === 0) {
      this.currentState = {
        health: 1.0,
        load: 0.0,
        performanceTrend: "stable",
        activeOperations: this.activeOperations.size,
        queueLength: 0,
        errorRate: 0.0,
        avgResponseTime: 0.0,
      };
      return;
    }

    // 计算平均响应时间
    const avgResponseTime =
      recentMetrics.reduce((sum, m) => sum + m.durationMs, 0) / recentMetrics.length;

    // 计算错误率
    const errors = recentMetrics.filter((m) => !m.success).length;
    const errorRate = errors / recentMetrics.length;

    // 计算负载
    const load = Math.min(1, this.activeOperations.size / 10);

    // 计算健康度
    let health = 1.0;

    // 响应时间影响
    if (avgResponseTime > this.config.responseTimeCriticalMs) {
      health -= 0.4;
    } else if (avgResponseTime > this.config.responseTimeWarningMs) {
      health -= 0.2;
    }

    // 错误率影响
    health -= errorRate * 2;

    // 负载影响
    if (load > this.config.loadThreshold) {
      health -= (load - this.config.loadThreshold) * 0.5;
    }

    health = clamp(health, 0, 1);

    // 计算趋势
    const olderMetrics = this.performanceHistory.slice(-40, -20);
    let performanceTrend: CognitiveState["performanceTrend"] = "stable";

    if (olderMetrics.length > 0) {
      const olderAvg =
        olderMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / olderMetrics.length;
      const recentAvg =
        recentMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / recentMetrics.length;

      if (recentAvg > olderAvg + 0.1) {
        performanceTrend = "improving";
      } else if (recentAvg < olderAvg - 0.1) {
        performanceTrend = "degrading";
      }
    }

    this.currentState = {
      health,
      load,
      performanceTrend,
      activeOperations: this.activeOperations.size,
      queueLength: this.activeOperations.size, // 简化处理
      errorRate,
      avgResponseTime,
    };
  }

  /**
   * 检查异常
   */
  private checkForAnomalies(metrics: PerformanceMetrics): void {
    // 响应时间异常
    if (metrics.durationMs > this.config.responseTimeCriticalMs) {
      this.createAnomaly({
        type: "performance_drop",
        severity: "high",
        description: `操作 ${metrics.operation} 响应时间过长: ${metrics.durationMs}ms`,
        metrics,
        context: {},
      });
    }

    // 错误异常
    if (!metrics.success) {
      const recentErrors = this.performanceHistory.slice(-10).filter((m) => !m.success).length;

      if (recentErrors >= 5) {
        this.createAnomaly({
          type: "error_spike",
          severity: "critical",
          description: `最近10次操作中有 ${recentErrors} 次失败`,
          metrics,
          context: {},
        });
      }
    }
  }

  // ========================================================================
  // 策略管理
  // ========================================================================

  /**
   * 注册策略
   */
  registerStrategy(strategy: CognitiveStrategy): void {
    this.strategies.set(strategy.id, strategy);

    if (!this.strategyStats.has(strategy.id)) {
      this.strategyStats.set(strategy.id, {
        uses: 0,
        totalQuality: 0,
        totalDuration: 0,
        successes: 0,
      });
    }
  }

  /**
   * 评估并选择最佳策略
   */
  evaluateStrategies(operation: CognitiveOperation): StrategyEvaluation[] {
    const applicableStrategies = Array.from(this.strategies.values()).filter((s) =>
      s.applicableTo.includes(operation),
    );

    return applicableStrategies
      .map((strategy) => {
        const stats = this.strategyStats.get(strategy.id) ?? {
          uses: 0,
          totalQuality: 0,
          totalDuration: 0,
          successes: 0,
        };

        const historicalPerformance = {
          avgQuality: stats.uses > 0 ? stats.totalQuality / stats.uses : 0.5,
          avgDuration: stats.uses > 0 ? stats.totalDuration / stats.uses : 1000,
          successRate: stats.uses > 0 ? stats.successes / stats.uses : 0.5,
        };

        // 计算预期性能
        const expectedPerformance = {
          accuracy: historicalPerformance.avgQuality,
          speed: 1 / (1 + historicalPerformance.avgDuration / 1000),
          resourceUsage: 0.5, // 简化
        };

        // 计算推荐度
        const recommendationScore =
          expectedPerformance.accuracy * 0.4 +
          expectedPerformance.speed * 0.3 +
          historicalPerformance.successRate * 0.3;

        return {
          strategy,
          expectedPerformance,
          historicalPerformance,
          recommendationScore,
        };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore);
  }

  /**
   * 选择最佳策略
   */
  selectBestStrategy(operation: CognitiveOperation): CognitiveStrategy | null {
    const evaluations = this.evaluateStrategies(operation);
    return evaluations[0]?.strategy ?? null;
  }

  // ========================================================================
  // 自我反思
  // ========================================================================

  /**
   * 创建反思记录
   */
  createReflection(partial: Omit<ReflectionRecord, "id" | "timestamp">): ReflectionRecord {
    const record: ReflectionRecord = {
      id: generateId("reflection", Date.now().toString()),
      timestamp: Date.now(),
      ...partial,
    };

    this.reflections.push(record);

    // 保持反思记录数量
    if (this.reflections.length > 50) {
      this.reflections.shift();
    }

    this.emit("reflection", record);

    return record;
  }

  /**
   * 执行定期反思
   */
  performReflection(): ReflectionRecord {
    const recentMetrics = this.performanceHistory.slice(-50);

    if (recentMetrics.length === 0) {
      return this.createReflection({
        type: "scheduled",
        content: "暂无性能数据可供反思",
        observations: [],
        analysis: { impact: "low", confidence: 1.0 },
        recommendations: [],
        actions: [],
      });
    }

    const avgQuality =
      recentMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / recentMetrics.length;
    const errorRate = recentMetrics.filter((m) => !m.success).length / recentMetrics.length;

    const observations: string[] = [
      `最近50次操作平均质量: ${(avgQuality * 100).toFixed(1)}%`,
      `错误率: ${(errorRate * 100).toFixed(1)}%`,
      `平均响应时间: ${recentMetrics.reduce((sum, m) => sum + m.durationMs, 0) / recentMetrics.length}ms`,
    ];

    const recommendations = this.generateRecommendations(this.currentState);

    return this.createReflection({
      type: "scheduled",
      content: `定期反思: 系统健康度 ${(this.currentState.health * 100).toFixed(1)}%`,
      observations,
      analysis: {
        impact: this.currentState.health < 0.5 ? "high" : "low",
        confidence: 0.75,
      },
      recommendations,
      actions: [],
    });
  }

  // ========================================================================
  // 自动调节
  // ========================================================================

  /**
   * 执行自动调节
   */
  private performAutoAdjustment(state: CognitiveState): void {
    console.log(`🔧 执行自动调节 (策略: ${this.config.adjustmentStrategy})`);

    const actions: string[] = [];

    switch (this.config.adjustmentStrategy) {
      case "conservative":
        // 保守策略: 减少并发，增加缓存
        actions.push("降低并发限制");
        actions.push("增加预缓存");
        break;

      case "balanced":
        // 平衡策略
        if (state.load > 0.8) {
          actions.push("启用负载均衡");
        }
        if (state.errorRate > 0.05) {
          actions.push("增加重试次数");
        }
        break;

      case "aggressive":
        // 激进策略: 积极清理和重置
        actions.push("清理过期记忆");
        actions.push("重置连接池");
        actions.push("增加工作线程");
        break;
    }

    this.emit("autoAdjustment", { state, actions });

    console.log(`   已执行 ${actions.length} 项调节措施`);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(state: CognitiveState): string[] {
    const recommendations: string[] = [];

    if (state.load > 0.8) {
      recommendations.push("考虑增加资源或降低负载");
    }

    if (state.errorRate > 0.05) {
      recommendations.push("检查错误日志，修复潜在问题");
    }

    if (state.avgResponseTime > 1000) {
      recommendations.push("优化慢查询，考虑增加索引");
    }

    if (state.performanceTrend === "degrading") {
      recommendations.push("性能下降，建议进行系统维护");
    }

    if (recommendations.length === 0) {
      recommendations.push("系统运行正常，继续保持");
    }

    return recommendations;
  }

  // ========================================================================
  // 默认策略
  // ========================================================================

  private registerDefaultStrategies(): void {
    this.registerStrategy({
      id: "speed-priority",
      name: "速度优先",
      applicableTo: ["retrieve", "activate"],
      parameters: { maxDepth: 2, topK: 10, useCache: 1 },
      description: "优先返回快速结果，牺牲部分精度",
    });

    this.registerStrategy({
      id: "quality-priority",
      name: "质量优先",
      applicableTo: ["retrieve", "activate", "decide"],
      parameters: { maxDepth: 4, topK: 20, rerank: 1 },
      description: "追求最高质量结果，允许更长耗时",
    });

    this.registerStrategy({
      id: "balanced",
      name: "平衡策略",
      applicableTo: ["ingest", "retrieve", "activate", "evolve", "decide", "learn"],
      parameters: { maxDepth: 3, topK: 15 },
      description: "在速度和质量之间取得平衡",
    });

    this.registerStrategy({
      id: "memory-efficient",
      name: "内存优化",
      applicableTo: ["evolve", "ingest"],
      parameters: { batchSize: 100, compression: 1 },
      description: "减少内存占用，适合资源受限环境",
    });
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  private createAnomaly(partial: Omit<AnomalyEvent, "id" | "timestamp" | "resolved">): void {
    const event: AnomalyEvent = {
      id: generateId("anomaly", Date.now().toString()),
      timestamp: Date.now(),
      resolved: false,
      ...partial,
    };

    this.anomalies.push(event);

    if (this.anomalies.length > 50) {
      this.anomalies.shift();
    }

    this.emit("anomaly", event);
  }

  // ========================================================================
  // 查询接口
  // ========================================================================

  getCurrentState(): CognitiveState {
    return { ...this.currentState };
  }

  getPerformanceHistory(): PerformanceMetrics[] {
    return [...this.performanceHistory];
  }

  getReflections(): ReflectionRecord[] {
    return [...this.reflections];
  }

  getAnomalies(): AnomalyEvent[] {
    return [...this.anomalies];
  }

  getStrategies(): CognitiveStrategy[] {
    return Array.from(this.strategies.values());
  }

  getStats() {
    return {
      totalOperations: this.performanceHistory.length,
      successRate:
        this.performanceHistory.length > 0
          ? this.performanceHistory.filter((m) => m.success).length / this.performanceHistory.length
          : 0,
      avgQuality:
        this.performanceHistory.length > 0
          ? this.performanceHistory.reduce((sum, m) => sum + m.qualityScore, 0) /
            this.performanceHistory.length
          : 0,
      activeStrategies: this.strategies.size,
      anomalyCount: this.anomalies.filter((a) => !a.resolved).length,
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createMetaCognitionMonitor(
  config?: Partial<MetaCognitionConfig>,
): MetaCognitionMonitor {
  return new MetaCognitionMonitor(config);
}

export { DEFAULT_CONFIG as DEFAULT_META_COGNITION_CONFIG };
