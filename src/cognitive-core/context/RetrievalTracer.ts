/**
 * 检索轨迹追踪系统 (Retrieval Tracer)
 * 
 * 参考 OpenViking 的可视化检索轨迹
 * 实现可观测的上下文检索过程，便于调试和优化
 */

import { ContextLevel } from "./ContextLevel.js";

/**
 * 检索动作类型
 */
export type RetrievalAction =
  | "enter_directory"      // 进入目录
  | "vector_search"        // 向量搜索
  | "sparse_search"        // 稀疏搜索
  | "hybrid_search"        // 混合搜索
  | "rerank"               // 重排序
  | "propagate"            // 分数传播
  | "filter"               // 过滤
  | "merge"                // 合并结果
  | "convergence_check"    // 收敛检查
  | "return";              // 返回结果

/**
 * 检索步骤
 */
export interface RetrievalStep {
  /** 步骤序号 */
  step: number;
  /** 时间戳 */
  timestamp: number;
  /** 动作类型 */
  action: RetrievalAction;
  /** 操作的 URI */
  uri: string;
  /** 相关性分数 */
  score?: number;
  /** 候选数量 */
  candidateCount?: number;
  /** 层级 */
  level?: ContextLevel;
  /** 详细描述 */
  description: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
  /** 耗时 (毫秒) */
  durationMs?: number;
}

/**
 * 检索轨迹
 */
export interface RetrievalTrajectory {
  /** 查询 ID */
  queryId: string;
  /** 查询文本 */
  query: string;
  /** 检索步骤 */
  steps: RetrievalStep[];
  /** 最终结果 URI 列表 */
  finalResults: string[];
  /** 总耗时 (毫秒) */
  totalTimeMs: number;
  /** 收敛轮次 */
  convergenceRounds: number;
  /** 是否收敛 */
  converged: boolean;
  /** 检索参数 */
  params?: Record<string, unknown>;
}

/**
 * 检索统计
 */
export interface RetrievalStats {
  totalQueries: number;
  averageTimeMs: number;
  convergenceRate: number;
  averageConvergenceRounds: number;
  actionDistribution: Record<RetrievalAction, number>;
  topVisitedDirectories: Array<{ uri: string; count: number }>;
}

/**
 * 检索轨迹追踪器
 */
export class RetrievalTracer {
  private currentQueryId: string | null = null;
  private currentSteps: RetrievalStep[] = [];
  private currentStartTime: number = 0;
  private stepCounter: number = 0;
  private convergenceRoundCounter: number = 0;
  private trajectoryHistory: RetrievalTrajectory[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * 开始新的检索追踪
   */
  startTracing(query: string, params?: Record<string, unknown>): string {
    const queryId = generateQueryId();
    this.currentQueryId = queryId;
    this.currentSteps = [];
    this.currentStartTime = Date.now();
    this.stepCounter = 0;
    this.convergenceRoundCounter = 0;

    // 记录开始步骤
    this.addStep({
      action: "enter_directory",
      uri: "root",
      description: `开始检索: "${query}"`,
      metadata: { params },
    });

    return queryId;
  }

  /**
   * 开始新的检索追踪 (别名)
   */
  start(query: string, params?: Record<string, unknown>): string {
    return this.startTracing(query, params);
  }

  /**
   * 添加检索步骤
   */
  addStep(partial: Omit<RetrievalStep, "step" | "timestamp">): void {
    if (!this.currentQueryId) return;

    const step: RetrievalStep = {
      step: ++this.stepCounter,
      timestamp: Date.now(),
      ...partial,
    };

    this.currentSteps.push(step);
  }

  /**
   * 记录进入目录
   */
  traceEnterDirectory(uri: string, score: number, candidateCount: number): void {
    this.addStep({
      action: "enter_directory",
      uri,
      score,
      candidateCount,
      description: `进入目录 ${uri}, 分数: ${score.toFixed(4)}, 候选数: ${candidateCount}`,
    });
  }

  /**
   * 记录向量搜索
   */
  traceVectorSearch(
    uri: string,
    queryVector?: number[],
    resultCount?: number,
    durationMs?: number
  ): void {
    this.addStep({
      action: "vector_search",
      uri,
      candidateCount: resultCount,
      description: `向量搜索: ${uri}, 结果数: ${resultCount ?? "unknown"}`,
      metadata: { vectorDimension: queryVector?.length },
      durationMs,
    });
  }

  /**
   * 记录稀疏搜索
   */
  traceSparseSearch(
    uri: string,
    terms: string[],
    resultCount?: number,
    durationMs?: number
  ): void {
    this.addStep({
      action: "sparse_search",
      uri,
      candidateCount: resultCount,
      description: `稀疏搜索: ${uri}, 查询词: [${terms.join(", ")}]`,
      metadata: { terms },
      durationMs,
    });
  }

  /**
   * 记录混合搜索
   */
  traceHybridSearch(
    uri: string,
    resultCount: number,
    durationMs?: number
  ): void {
    this.addStep({
      action: "hybrid_search",
      uri,
      candidateCount: resultCount,
      description: `混合搜索: ${uri}, 结果数: ${resultCount}`,
      durationMs,
    });
  }

  /**
   * 记录重排序
   */
  traceRerank(
    uri: string,
    beforeScores: number[],
    afterScores: number[],
    durationMs?: number
  ): void {
    const avgBefore = beforeScores.reduce((a, b) => a + b, 0) / beforeScores.length;
    const avgAfter = afterScores.reduce((a, b) => a + b, 0) / afterScores.length;

    this.addStep({
      action: "rerank",
      uri,
      description: `重排序: ${uri}, 平均分 ${avgBefore.toFixed(4)} -> ${avgAfter.toFixed(4)}`,
      metadata: {
        docCount: beforeScores.length,
        scoreImprovement: avgAfter - avgBefore,
      },
      durationMs,
    });
  }

  /**
   * 记录分数传播
   */
  tracePropagate(
    fromUri: string,
    toUri: string,
    score: number,
    alpha: number
  ): void {
    this.addStep({
      action: "propagate",
      uri: toUri,
      score,
      description: `分数传播: ${fromUri} -> ${toUri}, 传播分数: ${score.toFixed(4)} (α=${alpha})`,
      metadata: { fromUri, alpha },
    });
  }

  /**
   * 记录过滤
   */
  traceFilter(uri: string, beforeCount: number, afterCount: number, reason: string): void {
    this.addStep({
      action: "filter",
      uri,
      candidateCount: afterCount,
      description: `过滤: ${uri}, ${beforeCount} -> ${afterCount} (${reason})`,
      metadata: { beforeCount, afterCount, filterReason: reason },
    });
  }

  /**
   * 记录合并
   */
  traceMerge(uri: string, sources: string[], resultCount: number): void {
    this.addStep({
      action: "merge",
      uri,
      candidateCount: resultCount,
      description: `合并: ${uri}, 来源: [${sources.join(", ")}], 结果数: ${resultCount}`,
      metadata: { sources },
    });
  }

  /**
   * 记录收敛检查
   */
  traceConvergenceCheck(
    round: number,
    topkChanged: boolean,
    convergenceThreshold: number
  ): void {
    this.convergenceRoundCounter = round;
    
    this.addStep({
      action: "convergence_check",
      uri: "system",
      description: `收敛检查 (轮次 ${round}): ${topkChanged ? "未收敛" : "已收敛"}`,
      metadata: { round, topkChanged, convergenceThreshold },
    });
  }

  /**
   * 结束检索追踪
   */
  finishTracing(finalResults: string[], converged: boolean = true): RetrievalTrajectory {
    if (!this.currentQueryId) {
      throw new Error("No active tracing session");
    }

    // 记录返回步骤
    this.addStep({
      action: "return",
      uri: "root",
      candidateCount: finalResults.length,
      description: `检索完成，返回 ${finalResults.length} 个结果`,
    });

    const trajectory: RetrievalTrajectory = {
      queryId: this.currentQueryId,
      query: this.getQueryFromSteps(),
      steps: [...this.currentSteps],
      finalResults,
      totalTimeMs: Date.now() - this.currentStartTime,
      convergenceRounds: this.convergenceRoundCounter,
      converged,
    };

    // 保存到历史
    this.trajectoryHistory.push(trajectory);
    this.trimHistory();

    // 清理当前追踪
    this.currentQueryId = null;
    this.currentSteps = [];
    this.stepCounter = 0;
    this.convergenceRoundCounter = 0;

    return trajectory;
  }

  /**
   * 完成检索追踪 (finishTracing 的别名)
   */
  complete(finalResults: string[], converged: boolean = true): RetrievalTrajectory {
    return this.finishTracing(finalResults, converged);
  }

  /**
   * 放弃当前追踪
   */
  abortTracing(reason: string): void {
    if (!this.currentQueryId) return;

    this.addStep({
      action: "return",
      uri: "root",
      description: `检索中止: ${reason}`,
      metadata: { aborted: true, reason },
    });

    this.currentQueryId = null;
    this.currentSteps = [];
  }

  /**
   * 获取当前轨迹
   */
  getCurrentTrajectory(): RetrievalTrajectory | null {
    if (!this.currentQueryId) return null;

    return {
      queryId: this.currentQueryId,
      query: this.getQueryFromSteps(),
      steps: [...this.currentSteps],
      finalResults: [],
      totalTimeMs: Date.now() - this.currentStartTime,
      convergenceRounds: this.convergenceRoundCounter,
      converged: false,
    };
  }

  /**
   * 获取历史轨迹
   */
  getTrajectoryHistory(): RetrievalTrajectory[] {
    return [...this.trajectoryHistory];
  }

  /**
   * 获取最近轨迹
   */
  getLastTrajectory(): RetrievalTrajectory | undefined {
    return this.trajectoryHistory[this.trajectoryHistory.length - 1];
  }

  /**
   * 获取当前轨迹 (getLastTrajectory 的别名)
   */
  getTrajectory(): RetrievalTrajectory | undefined {
    return this.getLastTrajectory();
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.trajectoryHistory = [];
  }

  /**
   * 计算检索统计
   */
  calculateStats(): RetrievalStats {
    if (this.trajectoryHistory.length === 0) {
      return {
        totalQueries: 0,
        averageTimeMs: 0,
        convergenceRate: 0,
        averageConvergenceRounds: 0,
        actionDistribution: {
          enter_directory: 0,
          vector_search: 0,
          sparse_search: 0,
          hybrid_search: 0,
          rerank: 0,
          propagate: 0,
          filter: 0,
          merge: 0,
          convergence_check: 0,
          return: 0,
        },
        topVisitedDirectories: [],
      };
    }

    const totalQueries = this.trajectoryHistory.length;
    const totalTime = this.trajectoryHistory.reduce((sum, t) => sum + t.totalTimeMs, 0);
    const convergedQueries = this.trajectoryHistory.filter(t => t.converged).length;
    const totalConvergenceRounds = this.trajectoryHistory.reduce((sum, t) => sum + t.convergenceRounds, 0);

    // 统计动作分布
    const actionDistribution: Record<RetrievalAction, number> = {
      enter_directory: 0,
      vector_search: 0,
      sparse_search: 0,
      hybrid_search: 0,
      rerank: 0,
      propagate: 0,
      filter: 0,
      merge: 0,
      convergence_check: 0,
      return: 0,
    };

    const directoryVisits = new Map<string, number>();

    for (const trajectory of this.trajectoryHistory) {
      for (const step of trajectory.steps) {
        actionDistribution[step.action]++;
        
        if (step.action === "enter_directory" || step.action === "vector_search") {
          const count = directoryVisits.get(step.uri) ?? 0;
          directoryVisits.set(step.uri, count + 1);
        }
      }
    }

    // 获取访问最多的目录
    const topVisitedDirectories = Array.from(directoryVisits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([uri, count]) => ({ uri, count }));

    return {
      totalQueries,
      averageTimeMs: totalTime / totalQueries,
      convergenceRate: convergedQueries / totalQueries,
      averageConvergenceRounds: totalConvergenceRounds / totalQueries,
      actionDistribution,
      topVisitedDirectories,
    };
  }

  /**
   * 格式化轨迹为可读文本
   */
  formatTrajectory(trajectory: RetrievalTrajectory): string {
    const lines: string[] = [
      `========================================`,
      `检索轨迹: ${trajectory.queryId}`,
      `查询: "${trajectory.query}"`,
      `总耗时: ${trajectory.totalTimeMs}ms`,
      `收敛: ${trajectory.converged ? "是" : "否"} (轮次: ${trajectory.convergenceRounds})`,
      `结果数: ${trajectory.finalResults.length}`,
      `----------------------------------------`,
    ];

    for (const step of trajectory.steps) {
      const time = new Date(step.timestamp).toLocaleTimeString();
      const score = step.score !== undefined ? ` [${step.score.toFixed(4)}]` : "";
      const count = step.candidateCount !== undefined ? ` (${step.candidateCount})` : "";
      
      lines.push(
        `[${time}] ${step.step}. ${step.action}: ${step.uri}${score}${count}`
      );
      lines.push(`    ${step.description}`);
      
      if (step.durationMs) {
        lines.push(`    耗时: ${step.durationMs}ms`);
      }
    }

    lines.push(`========================================`);
    return lines.join("\n");
  }

  /**
   * 导出为可视化数据 (用于前端展示)
   */
  exportForVisualization(trajectory: RetrievalTrajectory): unknown {
    return {
      query: trajectory.query,
      totalTimeMs: trajectory.totalTimeMs,
      converged: trajectory.converged,
      convergenceRounds: trajectory.convergenceRounds,
      resultCount: trajectory.finalResults.length,
      nodes: trajectory.steps.map(step => ({
        id: step.step,
        action: step.action,
        uri: step.uri,
        score: step.score,
        candidateCount: step.candidateCount,
        timestamp: step.timestamp,
        description: step.description,
        durationMs: step.durationMs,
      })),
      edges: trajectory.steps.slice(1).map((step, i) => ({
        from: i + 1,
        to: step.step,
      })),
    };
  }

  /**
   * 从步骤中提取查询
   */
  private getQueryFromSteps(): string {
    const firstStep = this.currentSteps[0];
    if (firstStep?.metadata?.params && typeof firstStep.metadata.params === "object") {
      const params = firstStep.metadata.params as Record<string, unknown>;
      if (typeof params.query === "string") {
        return params.query;
      }
    }
    
    // 从描述中提取
    const match = firstStep?.description.match(/开始检索: "(.+)"/);
    return match?.[1] ?? "unknown";
  }

  /**
   * 裁剪历史记录
   */
  private trimHistory(): void {
    if (this.trajectoryHistory.length > this.maxHistorySize) {
      this.trajectoryHistory = this.trajectoryHistory.slice(-this.maxHistorySize);
    }
  }
}

/**
 * 生成查询 ID
 */
function generateQueryId(): string {
  return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建检索追踪器
 */
export function createRetrievalTracer(maxHistorySize?: number): RetrievalTracer {
  return new RetrievalTracer(maxHistorySize);
}
