/**
 * 分层检索器 (Hierarchical Retriever) - 修正版
 * 
 * 参考 OpenViking 的 hierarchical_retriever.py
 * 修复分数传播公式和收敛检测算法
 * 添加权限控制支持
 */

import { EventEmitter } from "events";
import { ContextLevel } from "../context/ContextLevel.js";
import { UnifiedContext } from "../context/UnifiedContext.js";
import { 
  RetrievalTracer, 
  RetrievalTrajectory,
} from "../context/RetrievalTracer.js";
import { 
  RequestContext, 
  PermissionChecker,
  createDefaultContext,
} from "../security/RequestContext.js";

/**
 * 检索模式
 */
export type RetrievalMode = "thinking" | "quick";

/**
 * 检索选项
 */
export interface RetrievalOptions {
  /** 查询 */
  query: string;
  /** 查询向量 (dense) */
  queryVector?: number[];
  /** 稀疏查询向量 */
  sparseQueryVector?: Record<string, number>;
  /** 目标目录 */
  targetDirectories?: string[];
  /** 上下文类型过滤 */
  contextType?: string;
  /** 检索层级 */
  level?: ContextLevel;
  /** 结果限制 */
  limit?: number;
  /** 分数阈值 */
  scoreThreshold?: number;
  /** 分数比较方式: true 使用 >=, false 使用 > */
  scoreGte?: boolean;
  /** 检索模式 */
  mode?: RetrievalMode;
  /** 最大收敛轮次 */
  maxConvergenceRounds?: number;
  /** 分数传播系数 */
  scorePropagationAlpha?: number;
  /** 热度权重 */
  hotnessAlpha?: number;
  /** 全局搜索 TopK */
  globalSearchTopK?: number;
  /** 请求上下文 (权限控制) */
  requestContext?: RequestContext;
}

/**
 * 检索候选
 */
export interface RetrievalCandidate {
  uri: string;
  context: UnifiedContext;
  score: number;
  level: ContextLevel;
  source: "vector" | "sparse" | "hybrid" | "propagated";
  parentScore?: number;
  depth: number;
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  query: string;
  matchedContexts: UnifiedContext[];
  searchedDirectories: string[];
  trajectory: RetrievalTrajectory;
  totalTimeMs: number;
  candidateCount: number;
}

/**
 * 分层检索器配置
 */
export interface HierarchicalRetrieverConfig {
  /** 最大收敛轮次 */
  maxConvergenceRounds: number;
  /** 分数传播系数 (alpha) - 子节点权重 */
  scorePropagationAlpha: number;
  /** 目录主导比例 */
  directoryDominanceRatio: number;
  /** 全局搜索 TopK */
  globalSearchTopK: number;
  /** 热度权重 */
  hotnessAlpha: number;
  /** 预过滤限制 */
  preFilterLimit: number;
  /** 是否启用追踪 */
  enableTracing: boolean;
  /** 追踪历史大小 */
  tracerHistorySize: number;
}

/**
 * 默认配置
 */
export const DEFAULT_RETRIEVER_CONFIG: HierarchicalRetrieverConfig = {
  maxConvergenceRounds: 3,
  scorePropagationAlpha: 0.5,  // 参考 OpenViking
  directoryDominanceRatio: 1.2,
  globalSearchTopK: 3,
  hotnessAlpha: 0.2,
  preFilterLimit: 20,
  enableTracing: true,
  tracerHistorySize: 100,
};

/**
 * 分层检索器 - 修正版
 * 
 * 核心算法修正:
 * 1. 分数传播: final_score = child_score * alpha + parent_score * (1 - alpha)
 * 2. 收敛检测: 检查 top-k 是否稳定且数量足够
 * 3. 层级过滤: L0/L1 目录递归，L2 是叶子节点
 */
export class HierarchicalRetriever extends EventEmitter {
  private config: HierarchicalRetrieverConfig;
  private tracer: RetrievalTracer;
  private contextStore: Map<string, UnifiedContext>;
  private vectorIndex: Map<string, number[]>;  // URI -> vector

  constructor(
    config: Partial<HierarchicalRetrieverConfig> = {},
    contextStore?: Map<string, UnifiedContext>
  ) {
    super();
    this.config = { ...DEFAULT_RETRIEVER_CONFIG, ...config };
    this.tracer = new RetrievalTracer(this.config.tracerHistorySize);
    this.contextStore = contextStore ?? new Map();
    this.vectorIndex = new Map();
  }

  // ========================================================================
  // 索引管理
  // ========================================================================

  /**
   * 添加上下文到索引
   */
  addContext(context: UnifiedContext): void {
    this.contextStore.set(context.uri, context);
    
    if (context.vector) {
      this.vectorIndex.set(context.uri, context.vector);
    }
  }

  /**
   * 批量添加上下文
   */
  addContexts(contexts: UnifiedContext[]): void {
    for (const context of contexts) {
      this.addContext(context);
    }
  }

  /**
   * 移除上下文
   */
  removeContext(uri: string): boolean {
    this.vectorIndex.delete(uri);
    return this.contextStore.delete(uri);
  }

  // ========================================================================
  // 核心检索算法 (修正版)
  // ========================================================================

  /**
   * 执行分层检索 - 修正版
   * 
   * 支持权限控制：根据 requestContext 过滤可访问的 URI
   */
  async retrieve(options: RetrievalOptions): Promise<RetrievalResult> {
    const startTime = Date.now();
    
    // 获取请求上下文（权限控制）
    const ctx = options.requestContext ?? createDefaultContext();
    
    // 合并配置
    const maxConvergenceRounds = options.maxConvergenceRounds ?? this.config.maxConvergenceRounds;
    const alpha = options.scorePropagationAlpha ?? this.config.scorePropagationAlpha;
    const globalSearchTopK = options.globalSearchTopK ?? this.config.globalSearchTopK;
    const limit = options.limit ?? 5;

    // 开始追踪
    if (this.config.enableTracing) {
      this.tracer.startTracing(options.query, {
        level: options.level,
        limit,
        mode: options.mode,
        user: ctx.user.userId,
        role: ctx.role,
      });
    }

    try {
      // 步骤 1: 确定起始目录（带权限控制）
      const rootUris = this.getRootUris(options.targetDirectories, options.contextType, ctx);

      // 步骤 2: 全局向量搜索
      const globalResults = await this.globalVectorSearch(
        options.queryVector,
        options.sparseQueryVector,
        options.contextType,
        options.targetDirectories,
        globalSearchTopK
      );

      // 步骤 3: 合并起始点
      const startingPoints = this.mergeStartingPoints(options.query, rootUris, globalResults);

      // 步骤 4: 递归搜索 (修正版算法)
      const candidates = await this.recursiveSearch({
        query: options.query,
        queryVector: options.queryVector,
        sparseQueryVector: options.sparseQueryVector,
        startingPoints,
        limit,
        mode: options.mode ?? "thinking",
        threshold: options.scoreThreshold,
        scoreGte: options.scoreGte ?? false,
        contextType: options.contextType,
        targetDirs: options.targetDirectories,
        maxConvergenceRounds,
        alpha,
      });

      // 步骤 5: 应用热度评分
      if ((options.hotnessAlpha ?? this.config.hotnessAlpha) > 0) {
        this.applyHotnessScores(
          candidates, 
          options.hotnessAlpha ?? this.config.hotnessAlpha
        );
      }

      // 步骤 6: 排序和限制
      const sortedCandidates = this.sortAndLimitCandidates(candidates, limit);

      // 步骤 7: 转换为结果
      const matchedContexts = sortedCandidates.map(c => c.context);
      const finalUris = matchedContexts.map(c => c.uri);

      // 结束追踪
      let trajectory: RetrievalTrajectory;
      if (this.config.enableTracing) {
        trajectory = this.tracer.finishTracing(finalUris, true);
      } else {
        trajectory = this.createEmptyTrajectory(options.query);
      }

      const result: RetrievalResult = {
        query: options.query,
        matchedContexts,
        searchedDirectories: rootUris,
        trajectory,
        totalTimeMs: Date.now() - startTime,
        candidateCount: candidates.size,
      };

      this.emit("retrievalComplete", result);
      return result;

    } catch (error) {
      if (this.config.enableTracing) {
        this.tracer.abortTracing(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  /**
   * 递归搜索 - 修正版
   * 
   * 关键修正:
   * 1. 分数传播公式: child_score * alpha + parent_score * (1 - alpha)
   * 2. 收敛检测: 检查 top-k 是否稳定且数量足够
   * 3. 层级检查: L2 是叶子节点，不再递归
   */
  private async recursiveSearch(params: {
    query: string;
    queryVector?: number[];
    sparseQueryVector?: Record<string, number>;
    startingPoints: Array<[string, number]>;
    limit: number;
    mode: RetrievalMode;
    threshold?: number;
    scoreGte: boolean;
    contextType?: string;
    targetDirs?: string[];
    maxConvergenceRounds: number;
    alpha: number;
  }): Promise<Map<string, RetrievalCandidate>> {
    const collected = new Map<string, RetrievalCandidate>();
    const dirQueue: Array<[number, string, number]> = [];  // [negScore, uri, level]
    const visited = new Set<string>();
    let prevTopkUris = new Set<string>();
    let convergenceRounds = 0;

    const effectiveThreshold = params.threshold ?? 0;

    const passesThreshold = (score: number): boolean => {
      return params.scoreGte ? score >= effectiveThreshold : score > effectiveThreshold;
    };

    // 初始化: 处理起始点
    for (const [uri, score] of params.startingPoints) {
      // 起始点默认为 L0 层级
      dirQueue.push([-score, uri, 0]);
    }

    // 按分数排序队列
    dirQueue.sort((a, b) => a[0] - b[0]);

    while (dirQueue.length > 0) {
      const [negScore, currentUri, currentLevel] = dirQueue.shift()!;
      const currentScore = -negScore;

      if (visited.has(currentUri)) continue;
      visited.add(currentUri);

      // 追踪进入目录
      if (this.config.enableTracing) {
        this.tracer.traceEnterDirectory(currentUri, currentScore, 0);
      }

      // 搜索子项
      const preFilterLimit = Math.max(params.limit * 2, this.config.preFilterLimit);
      const results = await this.searchChildren({
        parentUri: currentUri,
        queryVector: params.queryVector,
        sparseQueryVector: params.sparseQueryVector,
        contextType: params.contextType,
        targetDirs: params.targetDirs,
        limit: preFilterLimit,
      });

      if (results.length === 0) continue;

      // 处理结果
      for (const result of results) {
        // ==================== 修正 1: 分数传播公式 ====================
        // OpenViking: final_score = child_score * alpha + parent_score * (1 - alpha)
        // 注意: 子节点权重更高 (alpha)，父节点提供上下文 (1-alpha)
        const propagatedScore = currentScore !== undefined && currentScore > 0
          ? result.score * params.alpha + currentScore * (1 - params.alpha)
          : result.score;
        
        if (!passesThreshold(propagatedScore)) continue;

        const existing = collected.get(result.uri);
        if (!existing || existing.score < propagatedScore) {
          const candidate: RetrievalCandidate = {
            uri: result.uri,
            context: result.context,
            score: propagatedScore,
            level: result.level,
            source: result.source,
            parentScore: currentScore,
            depth: visited.size,
          };
          collected.set(result.uri, candidate);

          // 追踪分数传播
          if (this.config.enableTracing) {
            this.tracer.tracePropagate(currentUri, result.uri, propagatedScore, params.alpha);
          }
        }

        // ==================== 修正 2: 层级检查 ====================
        // OpenViking: Only recurse into directories (L0/L1). L2 files are terminal hits.
        const childLevel = result.context.currentLevel;
        const isTerminal = childLevel === 2 || result.context.isLeaf;
        
        if (!isTerminal && !visited.has(result.uri)) {
          dirQueue.push([-propagatedScore, result.uri, childLevel]);
        }
      }

      // 重新排序队列
      dirQueue.sort((a, b) => a[0] - b[0]);

      // ==================== 修正 3: 收敛检测 ====================
      const currentTopk = this.getTopkUris(collected, params.limit);
      
      // OpenViking 关键检查: top-k 必须稳定且数量足够
      const topkStable = this.setsEqual(prevTopkUris, currentTopk);
      const topkComplete = currentTopk.size >= params.limit;
      
      if (topkStable && topkComplete) {
        convergenceRounds++;
        if (this.config.enableTracing) {
          this.tracer.traceConvergenceCheck(convergenceRounds, false, params.maxConvergenceRounds);
        }
        if (convergenceRounds >= params.maxConvergenceRounds) {
          break;
        }
      } else {
        convergenceRounds = 0;
        prevTopkUris = currentTopk;
        if (this.config.enableTracing) {
          this.tracer.traceConvergenceCheck(convergenceRounds, true, params.maxConvergenceRounds);
        }
      }
    }

    return collected;
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 全局向量搜索
   */
  private async globalVectorSearch(
    queryVector?: number[],
    sparseQueryVector?: Record<string, number>,
    contextType?: string,
    targetDirectories?: string[],
    limit: number = 3
  ): Promise<Array<{ uri: string; score: number }>> {
    const results: Array<{ uri: string; score: number }> = [];

    for (const [uri, vector] of this.vectorIndex) {
      // 类型过滤
      if (contextType) {
        const context = this.contextStore.get(uri);
        if (context?.contextType !== contextType) continue;
      }

      // 目录过滤
      if (targetDirectories && targetDirectories.length > 0) {
        const inTargetDir = targetDirectories.some(dir => uri.startsWith(dir));
        if (!inTargetDir) continue;
      }

      // 计算相似度
      let score = 0;
      if (queryVector) {
        score = this.cosineSimilarity(queryVector, vector);
      }

      if (score > 0) {
        results.push({ uri, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    if (this.config.enableTracing) {
      this.tracer.traceVectorSearch("global", queryVector, topResults.length, 0);
    }

    return topResults;
  }

  /**
   * 获取根目录 URI
   */
  private getRootUris(
    targetDirectories?: string[], 
    contextType?: string,
    ctx?: RequestContext
  ): string[] {
    // 如果指定了目标目录，进行权限过滤
    if (targetDirectories && targetDirectories.length > 0) {
      if (ctx) {
        // 过滤掉无权限访问的目录
        return targetDirectories.filter(uri => PermissionChecker.isAccessible(uri, ctx));
      }
      return targetDirectories;
    }

    // 使用权限控制获取可访问的根 URI
    if (ctx) {
      const mappedType = contextType as "memory" | "resource" | "skill" | undefined;
      return PermissionChecker.getAccessibleRootUris(ctx, mappedType);
    }

    // 默认目录（无权限控制时）
    const typeToDir: Record<string, string> = {
      skill: "viking://agent/default/skills",
      memory: "viking://agent/default/memories",
      resource: "viking://agent/default/resources",
      experience: "viking://agent/default/experiences",
      knowledge: "viking://agent/default/knowledge",
    };

    if (contextType && typeToDir[contextType]) {
      return [typeToDir[contextType]];
    }

    return Object.values(typeToDir);
  }

  /**
   * 合并起始点
   */
  private mergeStartingPoints(
    query: string,
    rootUris: string[],
    globalResults: Array<{ uri: string; score: number }>
  ): Array<[string, number]> {
    const points: Array<[string, number]> = [];
    const seen = new Set<string>();

    // 全局搜索结果 - 获取父目录作为起始点
    for (const result of globalResults) {
      const parentUri = this.getParentUri(result.uri);
      if (parentUri && !seen.has(parentUri)) {
        points.push([parentUri, result.score]);
        seen.add(parentUri);
      }
    }

    // 根目录作为起始点
    for (const uri of rootUris) {
      if (!seen.has(uri)) {
        points.push([uri, 0]);
        seen.add(uri);
      }
    }

    if (this.config.enableTracing) {
      this.tracer.traceMerge("root", points.map(p => p[0]), points.length);
    }

    return points;
  }

  /**
   * 搜索子项
   */
  private async searchChildren(params: {
    parentUri: string;
    queryVector?: number[];
    sparseQueryVector?: Record<string, number>;
    contextType?: string;
    targetDirs?: string[];
    limit: number;
  }): Promise<Array<{
    uri: string;
    context: UnifiedContext;
    score: number;
    level: ContextLevel;
    source: "vector" | "sparse" | "hybrid";
  }>> {
    const results: Array<{
      uri: string;
      context: UnifiedContext;
      score: number;
      level: ContextLevel;
      source: "vector" | "sparse" | "hybrid";
    }> = [];

    for (const [uri, context] of this.contextStore) {
      // 检查是否是子项
      if (!this.isChildUri(params.parentUri, uri)) continue;

      // 类型过滤
      if (params.contextType && context.contextType !== params.contextType) continue;

      // 计算分数
      let score = 0;
      let source: "vector" | "sparse" | "hybrid" = "vector";

      if (params.queryVector && context.vector) {
        score = this.cosineSimilarity(params.queryVector, context.vector);
      }

      if (score > 0) {
        results.push({
          uri,
          context,
          score,
          level: context.currentLevel,
          source,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, params.limit);
  }

  /**
   * 应用热度评分
   */
  private applyHotnessScores(
    candidates: Map<string, RetrievalCandidate>,
    hotnessAlpha: number
  ): void {
    for (const [uri, candidate] of candidates) {
      const hotnessScore = candidate.context.hotnessScore;
      // 混合分数: (1-alpha) * semantic_score + alpha * hotness
      candidate.score = (1 - hotnessAlpha) * candidate.score + hotnessAlpha * hotnessScore;
    }
  }

  /**
   * 排序和限制候选
   */
  private sortAndLimitCandidates(
    candidates: Map<string, RetrievalCandidate>,
    limit: number
  ): RetrievalCandidate[] {
    const sorted = Array.from(candidates.values())
      .sort((a, b) => b.score - a.score);
    return sorted.slice(0, limit);
  }

  /**
   * 获取 TopK URI
   */
  private getTopkUris(candidates: Map<string, RetrievalCandidate>, k: number): Set<string> {
    const sorted = Array.from(candidates.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, k);
    return new Set(sorted.map(([uri]) => uri));
  }

  /**
   * 比较两个集合是否相等
   */
  private setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  /**
   * 获取父 URI
   */
  private getParentUri(uri: string): string | undefined {
    const lastSlash = uri.lastIndexOf("/");
    if (lastSlash <= "viking://".length) return undefined;
    return uri.slice(0, lastSlash);
  }

  /**
   * 检查是否是子 URI
   */
  private isChildUri(parentUri: string, childUri: string): boolean {
    return childUri.startsWith(parentUri + "/") && childUri !== parentUri;
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
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

  /**
   * 创建空轨迹
   */
  private createEmptyTrajectory(query: string): RetrievalTrajectory {
    return {
      queryId: "",
      query,
      steps: [],
      finalResults: [],
      totalTimeMs: 0,
      convergenceRounds: 0,
      converged: false,
    };
  }

  // ========================================================================
  // 公共接口
  // ========================================================================

  /**
   * 获取最后检索轨迹
   */
  getLastTrajectory(): RetrievalTrajectory | undefined {
    return this.tracer.getLastTrajectory();
  }

  /**
   * 获取所有轨迹历史
   */
  getTrajectoryHistory(): RetrievalTrajectory[] {
    return this.tracer.getTrajectoryHistory();
  }

  /**
   * 获取检索统计
   */
  getStats() {
    return this.tracer.calculateStats();
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.tracer.clearHistory();
  }
}

/**
 * 创建分层检索器
 */
export function createHierarchicalRetriever(
  config?: Partial<HierarchicalRetrieverConfig>,
  contextStore?: Map<string, UnifiedContext>
): HierarchicalRetriever {
  return new HierarchicalRetriever(config, contextStore);
}
