/**
 * 重排序模块 (Reranker)
 * 
 * 使用 Nsem 内置的 bge-reranker-v2-m3 模型对检索结果进行精确重排
 * 支持按需加载和自动卸载以节省内存
 */

import { EventEmitter } from "events";
import type { NsemclawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { SmartEmbeddingEngine } from "../mind/perception/SmartEmbeddingEngine.js";
import type { UnifiedContext } from "../context/UnifiedContext.js";

const log = createSubsystemLogger("nsem-reranker");

/**
 * 重排序配置
 */
export interface RerankerConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 重排序前 N 个结果 */
  topK: number;
  /** 分数阈值 (低于此值的将被过滤) */
  threshold: number;
  /** 批处理大小 */
  batchSize: number;
  /** 混合权重: 原始分数权重 */
  originalWeight: number;
  /** 混合权重: 重排分数权重 */
  rerankWeight: number;
  /** 空闲后自动卸载时间 (毫秒) */
  autoUnloadMs: number;
}

/**
 * 默认配置
 */
export const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
  enabled: true,
  topK: 20,
  threshold: 0.1,
  batchSize: 8,
  originalWeight: 0.3,
  rerankWeight: 0.7,
  autoUnloadMs: 5 * 60 * 1000,  // 5分钟
};

/**
 * 重排序候选
 */
export interface RerankCandidate {
  uri: string;
  context: UnifiedContext;
  originalScore: number;
  text: string;
}

/**
 * 重排序结果
 */
export interface RerankResult {
  uri: string;
  context: UnifiedContext;
  originalScore: number;
  rerankScore: number;
  finalScore: number;
}

/**
 * 轻量级重排序器
 * 
 * 使用余弦相似度进行快速重排 (不需要专门的 cross-encoder)
 */
export class LightweightReranker extends EventEmitter {
  private config: RerankerConfig;

  constructor(config: Partial<RerankerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_RERANKER_CONFIG, ...config };
  }

  /**
   * 快速重排序
   * 使用向量相似度而非 cross-encoder，速度快但精度稍低
   */
  async rerank(
    query: string,
    queryVector: number[],
    candidates: RerankCandidate[]
  ): Promise<RerankResult[]> {
    if (!this.config.enabled || candidates.length === 0) {
      return candidates.map(c => ({
        uri: c.uri,
        context: c.context,
        originalScore: c.originalScore,
        rerankScore: c.originalScore,
        finalScore: c.originalScore,
      }));
    }

    // 只处理前 topK 个
    const topCandidates = candidates.slice(0, this.config.topK);
    
    const results: RerankResult[] = [];

    for (const candidate of topCandidates) {
      // 使用候选的向量计算相似度
      const candidateVector = candidate.context.vector;
      
      let rerankScore = candidate.originalScore;
      
      if (candidateVector && candidateVector.length === queryVector.length) {
        // 计算余弦相似度
        rerankScore = this.cosineSimilarity(queryVector, candidateVector);
      }

      // 混合分数
      const finalScore = 
        this.config.originalWeight * candidate.originalScore +
        this.config.rerankWeight * rerankScore;

      results.push({
        uri: candidate.uri,
        context: candidate.context,
        originalScore: candidate.originalScore,
        rerankScore,
        finalScore,
      });
    }

    // 添加剩余候选 (不重排)
    const rest = candidates.slice(this.config.topK).map(c => ({
      uri: c.uri,
      context: c.context,
      originalScore: c.originalScore,
      rerankScore: c.originalScore,
      finalScore: c.originalScore,
    }));

    // 按最终分数排序
    return [...results, ...rest]
      .filter(r => r.finalScore >= this.config.threshold)
      .sort((a, b) => b.finalScore - a.finalScore);
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
}

/**
 * 高级重排序器
 * 
 * 使用 bge-reranker-v2-m3 模型进行精确的 cross-encoder 重排
 * 支持按需加载和自动卸载
 */
export class AdvancedReranker extends EventEmitter {
  private config: RerankerConfig;
  private nsemConfig: NsemclawConfig;
  private engine?: SmartEmbeddingEngine;
  private lastUsed: number = 0;
  private unloadTimer?: NodeJS.Timeout;
  private isInitialized: boolean = false;

  constructor(
    nsemConfig: NsemclawConfig,
    config: Partial<RerankerConfig> = {}
  ) {
    super();
    this.nsemConfig = nsemConfig;
    this.config = { ...DEFAULT_RERANKER_CONFIG, ...config };
  }

  /**
   * 初始化重排序器 (按需)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.info("初始化高级重排序器 (使用 bge-reranker-v2-m3)");

    try {
      this.engine = new SmartEmbeddingEngine({
        cfg: this.nsemConfig,
        agentId: "reranker",
        memoryConfig: { provider: "local" },
        resourceMode: "balanced",
        autoDownloadModels: true,
      });

      await this.engine.initialize();
      this.isInitialized = true;
      this.lastUsed = Date.now();
      
      // 启动自动卸载监控
      this.startAutoUnloadMonitor();
      
      this.emit("initialized");
      log.info("重排序器初始化完成");
    } catch (error) {
      log.error(`重排序器初始化失败: ${error}`);
      throw error;
    }
  }

  /**
   * 重排序
   */
  async rerank(
    query: string,
    candidates: RerankCandidate[]
  ): Promise<RerankResult[]> {
    if (!this.config.enabled || candidates.length === 0) {
      return candidates.map(c => ({
        uri: c.uri,
        context: c.context,
        originalScore: c.originalScore,
        rerankScore: c.originalScore,
        finalScore: c.originalScore,
      }));
    }

    // 延迟初始化
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.lastUsed = Date.now();

    // 只处理前 topK 个
    const topCandidates = candidates.slice(0, this.config.topK);
    
    try {
      // 使用 SmartEmbeddingEngine 的 rerank 方法
      const rerankInputs = topCandidates.map(c => ({
        text: c.text,
        score: c.originalScore,
      }));

      const reranked = await this.engine!.rerank(query, rerankInputs);

      const results: RerankResult[] = topCandidates.map((c, i) => {
        const rerankScore = reranked[i].rerankScore ?? c.originalScore;
        const finalScore = 
          this.config.originalWeight * c.originalScore +
          this.config.rerankWeight * rerankScore;

        return {
          uri: c.uri,
          context: c.context,
          originalScore: c.originalScore,
          rerankScore,
          finalScore,
        };
      });

      // 添加剩余候选
      const rest = candidates.slice(this.config.topK).map(c => ({
        uri: c.uri,
        context: c.context,
        originalScore: c.originalScore,
        rerankScore: c.originalScore,
        finalScore: c.originalScore,
      }));

      // 过滤、排序
      return [...results, ...rest]
        .filter(r => r.finalScore >= this.config.threshold)
        .sort((a, b) => b.finalScore - a.finalScore);

    } catch (error) {
      log.warn(`重排序失败，返回原结果: ${error}`);
      return candidates.map(c => ({
        uri: c.uri,
        context: c.context,
        originalScore: c.originalScore,
        rerankScore: c.originalScore,
        finalScore: c.originalScore,
      }));
    }
  }

  /**
   * 启动自动卸载监控
   */
  private startAutoUnloadMonitor(): void {
    if (this.unloadTimer) {
      clearInterval(this.unloadTimer);
    }

    this.unloadTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastUsed;
      if (idleTime > this.config.autoUnloadMs) {
        this.unload();
      }
    }, 60000);  // 每分钟检查一次
  }

  /**
   * 卸载模型以释放内存
   */
  unload(): void {
    if (!this.isInitialized) return;

    log.info("卸载重排序模型以释放内存");
    
    // SmartEmbeddingEngine 会在一定时间后自动卸载 reranker
    // 这里我们只需要标记状态
    this.isInitialized = false;
    this.engine = undefined;
    
    if (this.unloadTimer) {
      clearInterval(this.unloadTimer);
      this.unloadTimer = undefined;
    }
    
    this.emit("unloaded");
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.unload();
    this.removeAllListeners();
  }
}

/**
 * 创建重排序器
 * 
 * 根据配置自动选择轻量级或高级版本
 */
export function createReranker(
  nsemConfig: NsemclawConfig,
  useAdvanced: boolean = false,
  config?: Partial<RerankerConfig>
): LightweightReranker | AdvancedReranker {
  if (useAdvanced) {
    return new AdvancedReranker(nsemConfig, config);
  }
  return new LightweightReranker(config);
}
