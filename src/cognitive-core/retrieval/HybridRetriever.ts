/**
 * 混合检索器 (Hybrid Retriever)
 * 
 * 集成以下功能的统一检索入口：
 * 1. Dense 向量检索 (原有)
 * 2. Sparse 向量检索 (BM25)
 * 3. 分层检索 (Hierarchical)
 * 4. 意图分析 (Intent Analysis)
 * 5. 重排序 (Rerank)
 * 
 * 参考 OpenViking 的完整检索流程
 */

import { EventEmitter } from "events";
import type { NsemclawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ContextLevel } from "../context/ContextLevel.js";
import { UnifiedContext } from "../context/UnifiedContext.js";
import { RetrievalTrajectory } from "../context/RetrievalTracer.js";
import { HierarchicalRetriever, RetrievalResult } from "./HierarchicalRetriever.js";
import { SparseIndex, SparseSearchResult } from "./SparseIndex.js";
import { IntentAnalyzer, IntentAnalysis, TypedQuery } from "./IntentAnalyzer.js";
import { LightweightReranker, AdvancedReranker, RerankResult } from "./Reranker.js";
import type { SessionContext } from "./IntentAnalyzer.js";

const log = createSubsystemLogger("nsem-hybrid-retrieval");

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 混合检索配置
 */
export interface HybridRetrieverConfig {
  /** Nsemclaw 配置 */
  nsemConfig: NsemclawConfig;
  /** 是否启用意图分析 */
  enableIntentAnalysis: boolean;
  /** 是否启用稀疏检索 */
  enableSparse: boolean;
  /** 是否启用重排序 */
  enableRerank: boolean;
  /** 使用高级重排序 (需要加载模型) */
  useAdvancedRerank: boolean;
  /** Dense 权重 */
  denseWeight: number;
  /** Sparse 权重 */
  sparseWeight: number;
  /** 最大检索深度 */
  maxDepth: number;
  /** 结果限制 */
  limit: number;
  /** 分数阈值 */
  threshold: number;
}

/**
 * 默认配置
 */
export const DEFAULT_HYBRID_CONFIG: HybridRetrieverConfig = {
  nsemConfig: {} as NsemclawConfig,  // 必须提供
  enableIntentAnalysis: true,
  enableSparse: true,
  enableRerank: true,
  useAdvancedRerank: false,  // 默认使用轻量级
  denseWeight: 0.7,
  sparseWeight: 0.3,
  maxDepth: 3,
  limit: 10,
  threshold: 0.1,
};

/**
 * 检索请求
 */
export interface HybridRetrievalRequest {
  /** 查询文本 */
  query: string;
  /** 查询向量 (可选，如果不提供将自动计算) */
  queryVector?: number[];
  /** 目标层级 */
  level?: ContextLevel;
  /** 目标目录 */
  targetDirectories?: string[];
  /** 上下文类型过滤 */
  contextType?: string;
  /** 会话上下文 (用于意图分析) */
  sessionContext?: SessionContext;
  /** 结果限制 */
  limit?: number;
  /** 检索模式 */
  mode?: "quick" | "standard" | "deep";
}

/**
 * 检索结果项
 */
export interface HybridRetrievalItem {
  uri: string;
  context: UnifiedContext;
  score: number;
  denseScore?: number;
  sparseScore?: number;
  rerankScore?: number;
  sources: Array<"dense" | "sparse" | "hierarchical" | "rerank">;
  intentMatched?: string;
}

/**
 * 完整检索结果
 */
export interface HybridRetrievalResult {
  /** 原始查询 */
  query: string;
  /** 意图分析结果 */
  intentAnalysis?: IntentAnalysis;
  /** 检索结果 */
  items: HybridRetrievalItem[];
  /** 使用的查询列表 */
  executedQueries: string[];
  /** 检索轨迹 */
  trajectory: RetrievalTrajectory;
  /** 总耗时 */
  totalTimeMs: number;
  /** 统计信息 */
  stats: {
    denseCount: number;
    sparseCount: number;
    rerankCount: number;
    intentQueries: number;
  };
}

// ============================================================================
// 混合检索器
// ============================================================================

/**
 * 混合检索器
 * 
 * 完整的检索 pipeline：
 * 1. 意图分析 -> 生成多个类型化查询
 * 2. 并行执行 Dense + Sparse 检索
 * 3. 分层检索优化
 * 4. 结果融合
 * 5. 重排序
 */
export class HybridRetriever extends EventEmitter {
  private config: HybridRetrieverConfig;
  
  // 子模块
  private hierarchicalRetriever: HierarchicalRetriever;
  private sparseIndex: SparseIndex;
  private intentAnalyzer?: IntentAnalyzer;
  private reranker?: LightweightReranker | AdvancedReranker;
  
  // 上下文存储
  private contextStore: Map<string, UnifiedContext>;
  
  // 状态
  private isInitialized: boolean = false;

  constructor(config: Partial<HybridRetrieverConfig> = {}) {
    super();
    this.config = { ...DEFAULT_HYBRID_CONFIG, ...config } as HybridRetrieverConfig;
    
    this.contextStore = new Map();
    this.hierarchicalRetriever = new HierarchicalRetriever({}, this.contextStore);
    this.sparseIndex = new SparseIndex();
    
    // 延迟初始化可选模块
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.info("初始化混合检索器...");

    // 初始化意图分析器
    if (this.config.enableIntentAnalysis) {
      try {
        this.intentAnalyzer = new IntentAnalyzer(
          this.config.nsemConfig,
          { mode: "hybrid" }
        );
        await this.intentAnalyzer.initialize();
        log.info("意图分析器初始化完成");
      } catch (error) {
        log.warn(`意图分析器初始化失败: ${error}`);
      }
    }

    // 初始化重排序器
    if (this.config.enableRerank) {
      try {
        if (this.config.useAdvancedRerank) {
          this.reranker = new AdvancedReranker(
            this.config.nsemConfig,
            { enabled: true, topK: 20 }
          );
          await this.reranker.initialize();
          log.info("高级重排序器初始化完成");
        } else {
          this.reranker = new LightweightReranker({ enabled: true });
          log.info("轻量级重排序器初始化完成");
        }
      } catch (error) {
        log.warn(`重排序器初始化失败: ${error}`);
      }
    }

    this.isInitialized = true;
    this.emit("initialized");
    log.info("混合检索器初始化完成");
  }

  /**
   * 添加上下文到索引
   */
  addContext(context: UnifiedContext): void {
    // 添加到 Dense 索引
    this.hierarchicalRetriever.addContext(context);
    this.contextStore.set(context.uri, context);

    // 添加到 Sparse 索引
    if (this.config.enableSparse) {
      const text = context.getVectorizationText();
      if (text) {
        this.sparseIndex.addDocument(context.uri, text);
      }
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

  // ========================================================================
  // 核心检索
  // ========================================================================

  /**
   * 执行混合检索
   * 
   * 完整的检索 pipeline
   */
  async retrieve(request: HybridRetrievalRequest): Promise<HybridRetrievalResult> {
    const startTime = Date.now();
    
    if (!this.isInitialized) {
      await this.initialize();
    }

    log.info(`开始混合检索: "${request.query}"`);

    // 1. 意图分析
    let intentAnalysis: IntentAnalysis | undefined;
    let queriesToExecute: TypedQuery[] = [];

    if (this.intentAnalyzer && this.config.enableIntentAnalysis) {
      try {
        intentAnalysis = await this.intentAnalyzer.analyze(
          request.query,
          request.sessionContext
        );
        queriesToExecute = intentAnalysis.expandedQueries;
        log.info(`意图分析完成: ${intentAnalysis.primaryIntent}, 生成 ${queriesToExecute.length} 个查询`);
      } catch (error) {
        log.warn(`意图分析失败: ${error}`);
      }
    }

    // 如果没有意图分析，使用原始查询
    if (queriesToExecute.length === 0) {
      queriesToExecute = [{
        query: request.query,
        targetTypes: ["memory", "resource"],
        intent: "explore",
        priority: 1,
        confidence: 1.0,
      }];
    }

    // 2. 执行多个查询并收集结果
    const allResults = new Map<string, HybridRetrievalItem>();
    const executedQueries: string[] = [];

    for (const typedQuery of queriesToExecute.slice(0, 3)) {  // 最多执行3个查询
      const results = await this.executeSingleQuery(typedQuery, request);
      
      executedQueries.push(typedQuery.query);

      // 合并结果
      for (const item of results) {
        const existing = allResults.get(item.uri);
        if (existing) {
          // 取最高分数
          existing.score = Math.max(existing.score, item.score);
          existing.denseScore = Math.max(
            existing.denseScore || 0,
            item.denseScore || 0
          );
          existing.sparseScore = Math.max(
            existing.sparseScore || 0,
            item.sparseScore || 0
          );
          // 合并来源
          for (const src of item.sources) {
            if (!existing.sources.includes(src)) {
              existing.sources.push(src);
            }
          }
        } else {
          allResults.set(item.uri, item);
        }
      }
    }

    // 3. 转换为数组并排序
    let items = Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, (request.limit ?? this.config.limit) * 2);  // 取多一倍用于重排序

    // 4. 重排序
    if (this.reranker && this.config.enableRerank && items.length > 0) {
      try {
        items = await this.performRerank(request.query, items, request.queryVector);
        log.info(`重排序完成: ${items.length} 个结果`);
      } catch (error) {
        log.warn(`重排序失败: ${error}`);
      }
    }

    // 5. 过滤和限制
    items = items
      .filter(item => item.score >= this.config.threshold)
      .slice(0, request.limit ?? this.config.limit);

    // 6. 获取轨迹
    const trajectory = this.hierarchicalRetriever.getLastTrajectory() || {
      queryId: "",
      query: request.query,
      steps: [],
      finalResults: items.map(i => i.uri),
      totalTimeMs: Date.now() - startTime,
      convergenceRounds: 0,
      converged: true,
    };

    const result: HybridRetrievalResult = {
      query: request.query,
      intentAnalysis,
      items,
      executedQueries,
      trajectory,
      totalTimeMs: Date.now() - startTime,
      stats: {
        denseCount: items.filter(i => i.sources.includes("dense")).length,
        sparseCount: items.filter(i => i.sources.includes("sparse")).length,
        rerankCount: items.filter(i => i.sources.includes("rerank")).length,
        intentQueries: queriesToExecute.length,
      },
    };

    log.info(`混合检索完成: ${items.length} 个结果, ${result.totalTimeMs}ms`);
    this.emit("retrievalComplete", result);
    
    return result;
  }

  /**
   * 执行单个查询
   */
  private async executeSingleQuery(
    typedQuery: TypedQuery,
    request: HybridRetrievalRequest
  ): Promise<HybridRetrievalItem[]> {
    const items: HybridRetrievalItem[] = [];
    const limit = request.limit ?? this.config.limit;

    // 1. Dense 检索 (Hierarchical)
    try {
      const denseResult = await this.hierarchicalRetriever.retrieve({
        query: typedQuery.query,
        queryVector: request.queryVector,
        level: request.level ?? ContextLevel.OVERVIEW,
        targetDirectories: request.targetDirectories,
        contextType: typedQuery.targetTypes[0],
        limit: limit * 2,  // 取多一些用于融合
      });

      for (const ctx of denseResult.matchedContexts) {
        items.push({
          uri: ctx.uri,
          context: ctx,
          score: this.config.denseWeight * (ctx.hotnessScore * 0.2 + 0.8),
          denseScore: ctx.hotnessScore * 0.2 + 0.8,
          sparseScore: 0,
          sources: ["dense", "hierarchical"],
          intentMatched: typedQuery.intent,
        });
      }
    } catch (error) {
      log.warn(`Dense 检索失败: ${error}`);
    }

    // 2. Sparse 检索 (BM25)
    if (this.config.enableSparse) {
      try {
        const sparseResults = this.sparseIndex.search(typedQuery.query, limit * 2);

        for (const sr of sparseResults) {
          const context = this.contextStore.get(sr.uri);
          if (!context) continue;

          const existing = items.find(i => i.uri === sr.uri);
          if (existing) {
            // 融合分数
            existing.sparseScore = sr.score;
            existing.score = this.config.denseWeight * (existing.denseScore || 0) +
                           this.config.sparseWeight * sr.score;
            if (!existing.sources.includes("sparse")) {
              existing.sources.push("sparse");
            }
          } else {
            items.push({
              uri: sr.uri,
              context,
              score: this.config.sparseWeight * sr.score,
              denseScore: 0,
              sparseScore: sr.score,
              sources: ["sparse"],
              intentMatched: typedQuery.intent,
            });
          }
        }
      } catch (error) {
        log.warn(`Sparse 检索失败: ${error}`);
      }
    }

    return items;
  }

  /**
   * 执行重排序
   */
  private async performRerank(
    query: string,
    items: HybridRetrievalItem[],
    queryVector?: number[]
  ): Promise<HybridRetrievalItem[]> {
    const rerankCandidates = items.map(item => ({
      uri: item.uri,
      context: item.context,
      originalScore: item.score,
      text: item.context.getVectorizationText() || item.context.getCurrentContent() || "",
    }));

    let reranked: Array<{ uri: string; context: UnifiedContext; originalScore: number; rerankScore?: number; finalScore: number }>;

    if (this.reranker instanceof AdvancedReranker) {
      // 高级重排序不需要 queryVector
      const results = await this.reranker.rerank(query, rerankCandidates);
      reranked = results;
    } else {
      // 轻量级重排序需要 queryVector
      if (!queryVector) {
        // 如果没有 queryVector，跳过轻量级重排序
        return items;
      }
      const results = await (this.reranker as LightweightReranker).rerank(
        query,
        queryVector,
        rerankCandidates
      );
      reranked = results;
    }

    // 更新 items
    return reranked.map(r => {
      const item = items.find(i => i.uri === r.uri)!;
      return {
        ...item,
        score: r.finalScore,
        rerankScore: r.rerankScore,
        sources: [...item.sources, "rerank"],
      };
    });
  }

  // ========================================================================
  // 快速检索 (跳过意图分析和重排序)
  // ========================================================================

  /**
   * 快速检索
   * 
   * 跳过意图分析和重排序，直接检索
   */
  async quickRetrieve(
    query: string,
    limit: number = 5
  ): Promise<HybridRetrievalResult> {
    const originalConfig = { ...this.config };
    
    // 临时禁用复杂功能
    this.config.enableIntentAnalysis = false;
    this.config.enableRerank = false;

    try {
      return await this.retrieve({ query, limit });
    } finally {
      // 恢复配置
      this.config = originalConfig;
    }
  }

  // ========================================================================
  // 查询
  // ========================================================================

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      contexts: this.contextStore.size,
      sparse: this.sparseIndex.getStats(),
      hierarchical: this.hierarchicalRetriever.getStats(),
    };
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.contextStore.clear();
    this.hierarchicalRetriever = new HierarchicalRetriever({}, this.contextStore);
    this.sparseIndex.clear();
    log.info("混合检索器已清空");
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.reranker instanceof AdvancedReranker) {
      this.reranker.destroy();
    }
    if (this.intentAnalyzer) {
      this.intentAnalyzer.destroy();
    }
    this.clear();
    this.removeAllListeners();
  }
}

/**
 * 创建混合检索器
 */
export function createHybridRetriever(
  config: Partial<HybridRetrieverConfig>
): HybridRetriever {
  return new HybridRetriever(config);
}
