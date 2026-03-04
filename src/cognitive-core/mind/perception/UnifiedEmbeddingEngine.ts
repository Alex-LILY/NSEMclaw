/**
 * 统一嵌入引擎 - 复用 Nsemclaw 本地模型系统
 *
 * 不重新封装 GGUF，直接复用：
 * - src/memory/embeddings.ts 的 createLocalEmbeddingProvider
 * - 自动支持 hf:xxx 格式下载
 * - 复用 ~/.nsemclaw/models 缓存
 */

import type { ResolvedMemorySearchConfig } from "../../../agents/memory-search.js";
import type { NsemclawConfig } from "../../../config/config.js";
import type { EmbeddingProvider } from "../../../memory/embeddings.js";
import { createEmbeddingProvider } from "../../../memory/embeddings.js";

export interface UnifiedEmbeddingConfig {
  /** Nsemclaw 主配置 */
  cfg?: NsemclawConfig;
  /** Agent ID */
  agentId?: string;
  /** 记忆搜索配置 */
  memoryConfig?: ResolvedMemorySearchConfig;
}

/**
 * 统一嵌入引擎
 *
 * 复用 Nsemclaw 的本地模型基础设施：
 * 1. embedding-gemma-300M → 主嵌入
 * 2. bge-reranker-v2-m3 → 重排序 (如果配置了)
 * 3. query-expansion-1.7B → 查询扩展 (如果配置了)
 */
export class UnifiedEmbeddingEngine {
  private config: UnifiedEmbeddingConfig;

  // 主嵌入提供者 (gemma-300M)
  private embeddingProvider: EmbeddingProvider | null = null;

  // 重排提供者 (bge-reranker-v2-m3)
  private rerankerProvider: EmbeddingProvider | null = null;

  // 查询扩展提供者
  private expansionProvider: any | null = null;

  constructor(config: UnifiedEmbeddingConfig) {
    this.config = config;
  }

  /**
   * 初始化 - 复用 Nsemclaw 的模型加载
   */
  async initialize(): Promise<void> {
    const { cfg, memoryConfig } = this.config;

    // 如果没有提供配置，使用默认配置
    if (!cfg || !memoryConfig) {
      console.log("⚠️  UnifiedEmbeddingEngine: 未提供完整配置，使用默认配置");
      // 使用简单的默认实现
      this.embeddingProvider = null;
      return;
    }

    // 1. 主嵌入模型 (从现有配置)
    const embeddingResult = await createEmbeddingProvider({
      config: cfg,
      provider: memoryConfig.provider,
      remote: memoryConfig.remote,
      model: memoryConfig.model,
      fallback: memoryConfig.fallback,
      local: memoryConfig.local,
    });

    if (embeddingResult.provider) {
      this.embeddingProvider = embeddingResult.provider;
      console.log(`✅ 嵌入模型: ${embeddingResult.provider.model}`);
    } else {
      throw new Error(`无法加载嵌入模型: ${embeddingResult.providerUnavailableReason}`);
    }

    // 2. 重排模型 - 延迟加载（不在启动时加载，第一次使用时加载）
    // 只记录配置路径，实际加载在 rerank() 方法中进行
    const rerankerModel = this.getRerankerModelPath();
    if (rerankerModel) {
      console.log(`📝 重排模型已配置: ${rerankerModel} (将按需加载)`);
    }

    // 3. 查询扩展模型
    const expansionModel = this.getExpansionModelPath();
    if (expansionModel) {
      console.log(`📝 查询扩展模型配置: ${expansionModel}`);
      // TODO: 查询扩展需要不同的接口，这里仅标记
    }
  }

  /**
   * 嵌入 - 直接复用 Nsemclaw 实现
   */
  async embed(text: string): Promise<number[]> {
    if (!this.embeddingProvider) {
      throw new Error("嵌入引擎未初始化");
    }
    return this.embeddingProvider.embedQuery(text);
  }

  /**
   * 批量嵌入
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embeddingProvider) {
      throw new Error("嵌入引擎未初始化");
    }
    return this.embeddingProvider.embedBatch(texts);
  }

  /**
   * 重排序 - 使用 bge-reranker-v2-m3 (按需加载)
   */
  async rerank(
    query: string,
    candidates: Array<{ text: string; score: number }>,
  ): Promise<Array<{ text: string; score: number; rerankScore: number }>> {
    // 按需加载重排模型（第一次使用时加载）
    if (!this.rerankerProvider) {
      const rerankerModel = this.getRerankerModelPath();
      if (rerankerModel) {
        try {
          console.log(`🔄 首次使用，加载重排模型: ${rerankerModel}`);
          const { cfg, memoryConfig } = this.config;
          const rerankerResult = await createEmbeddingProvider({
            config: cfg ?? {} as NsemclawConfig,
            provider: "local",
            model: rerankerModel,
            fallback: "none",
            local: {
              modelPath: rerankerModel,
              modelCacheDir: memoryConfig?.local?.modelCacheDir,
            },
          });
          this.rerankerProvider = rerankerResult.provider;
          console.log(`✅ 重排模型加载成功`);
        } catch (e) {
          console.warn(`⚠️ 重排模型加载失败，将不使用重排: ${e}`);
          // 加载失败，返回原始分数
          return candidates.map((c) => ({ ...c, rerankScore: c.score }));
        }
      } else {
        // 没有配置重排模型，返回原始分数
        return candidates.map((c) => ({ ...c, rerankScore: c.score }));
      }
    }

    // 使用嵌入模型作为重排器 (简化实现)
    // 实际应该用 cross-encoder，但这里先用双塔近似
    if (!this.rerankerProvider) {
      // 重排模型加载失败，返回原始分数
      return candidates.map((c) => ({ ...c, rerankScore: c.score }));
    }
    const queryEmbedding = await this.rerankerProvider.embedQuery(query);

    const reranked = await Promise.all(
      candidates.map(async (candidate) => {
        const docEmbedding = await this.rerankerProvider!.embedQuery(candidate.text);
        const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
        return {
          ...candidate,
          rerankScore: similarity * 0.7 + candidate.score * 0.3, // 混合分数
        };
      }),
    );

    return reranked.sort((a, b) => b.rerankScore - a.rerankScore);
  }

  /**
   * 查询扩展 - 使用大模型生成变体
   */
  async expandQuery(query: string): Promise<{ original: string; variants: string[] }> {
    // 简化实现：使用规则扩展
    // 实际应该加载 query-expansion-1.7B 模型
    const variants: string[] = [];

    // 同义词扩展
    if (query.includes("学习")) {
      variants.push(query.replace("学习", "掌握"));
      variants.push(query.replace("学习", "研究"));
    }
    if (query.includes("代码")) {
      variants.push(query.replace("代码", "程序"));
      variants.push(query.replace("代码", "脚本"));
    }

    // 添加原查询的变体
    variants.push(query + " 方法");
    variants.push(query + " 教程");
    variants.push(query + " 最佳实践");

    return {
      original: query,
      variants: [...new Set(variants)].slice(0, 5),
    };
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private getRerankerModelPath(): string | null {
    // 从配置读取重排模型路径
    // 优先级: agent.nsem.rerankerModel > defaults.nsem.rerankerModel
    const cfg = this.config.cfg;
    const agentId = this.config.agentId;

    if (!cfg || !agentId) return null;

    const agentCfg = (
      cfg.agents?.[agentId as keyof typeof cfg.agents] as { nsem?: { rerankerModel?: string } }
    )?.nsem;
    const defaultCfg = (cfg.agents?.defaults as { nsem?: { rerankerModel?: string } })?.nsem;

    return agentCfg?.rerankerModel ?? defaultCfg?.rerankerModel ?? null;
  }

  private getExpansionModelPath(): string | null {
    const cfg = this.config.cfg;
    const agentId = this.config.agentId;

    if (!cfg || !agentId) return null;

    const agentCfg = (
      cfg.agents?.[agentId as keyof typeof cfg.agents] as { nsem?: { expansionModel?: string } }
    )?.nsem;
    const defaultCfg = (cfg.agents?.defaults as { nsem?: { expansionModel?: string } })?.nsem;

    return agentCfg?.expansionModel ?? defaultCfg?.expansionModel ?? null;
  }
}

/**
 * 创建统一嵌入引擎 (工厂函数)
 */
export async function createUnifiedEmbeddingEngine(
  cfg?: NsemclawConfig,
  agentId?: string,
  memoryConfig?: ResolvedMemorySearchConfig,
): Promise<UnifiedEmbeddingEngine> {
  const engine = new UnifiedEmbeddingEngine({ cfg, agentId, memoryConfig });
  await engine.initialize();
  return engine;
}
