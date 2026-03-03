/**
 * 智能嵌入引擎 - 轻量级模型管理
 *
 * 核心设计:
 * 1. 自动下载 NSEM 所需模型
 * 2. GPU 优先加载
 * 3. 渐进加载，按需卸载
 * 4. 智能回退，资源不足时降级
 */

import { totalmem } from "node:os";
import path from "node:path";
import type { ResolvedMemorySearchConfig } from "../../../agents/memory-search.js";
import type { NsemclawConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { EmbeddingProvider } from "../../../memory/embeddings.js";
import { createEmbeddingProvider, DEFAULT_LOCAL_MODEL } from "../../../memory/embeddings.js";
import {
  downloadAllNSEMModels,
  getModelPath,
  areAllModelsReady,
  isModelReady,
  NSEM_PREDEFINED_MODELS,
  type ModelDownloadConfig,
} from "../../utils/model-downloader.js";

const log = createSubsystemLogger("nsem-embedding");

export interface SmartEmbeddingConfig {
  cfg: NsemclawConfig;
  agentId: string;
  memoryConfig: ResolvedMemorySearchConfig;
  /** 资源限制模式 */
  resourceMode?: "minimal" | "balanced" | "performance";
  /** 是否自动下载模型 */
  autoDownloadModels?: boolean;
  /** 扩展模型路径（用于查询扩展） */
  expansionModelPath?: string;
  /** Reranker 模型路径 */
  rerankerModelPath?: string;
}

/**
 * 轻量模型路径推荐
 */
export const LIGHTWEIGHT_MODELS = {
  // 极简: 80MB，质量良好
  minimal: {
    embedding: "hf:qdrant/all-MiniLM-L6-v2-gguf/all-MiniLM-L6-v2-Q4_K_M.gguf",
    reranker: null, // 不使用重排
  },
  // 平衡: 300MB，质量优秀
  balanced: {
    embedding: DEFAULT_LOCAL_MODEL, // gemma-300M
    reranker: "hf:qdrant/bge-reranker-v2-m3-gguf/bge-reranker-v2-m3-Q4_K_M.gguf",
  },
  // 性能: 更大但更强
  performance: {
    embedding: DEFAULT_LOCAL_MODEL,
    reranker: "hf:BAAI/bge-reranker-large-gguf/bge-reranker-large-Q4_K_M.gguf",
  },
};

/**
 * GPU 配置选项
 */
interface GpuConfig {
  /** 是否启用 GPU */
  enabled: boolean;
  /** 显存大小 (MB) */
  vramMb?: number;
  /** 使用的 GPU 层数 */
  gpuLayers?: number;
}

export class SmartEmbeddingEngine {
  private config: SmartEmbeddingConfig;

  // 主嵌入模型 (常驻)
  private embeddingProvider: EmbeddingProvider | null = null;

  // 扩展模型（用于查询扩展，可选）
  private expansionProvider: EmbeddingProvider | null = null;

  // 重排模型 (按需加载，可卸载)
  private rerankerProvider: EmbeddingProvider | null = null;
  private rerankerLastUsed = 0;
  private readonly RERANKER_TTL = 5 * 60 * 1000; // 5分钟空闲后卸载
  private resourceMonitorTimer?: NodeJS.Timeout;

  // 资源模式
  private resourceMode: "minimal" | "balanced" | "performance";

  // GPU 配置
  private gpuConfig: GpuConfig;

  // 模型路径
  private modelPaths: {
    embedding: string;
    expansion?: string;
    reranker?: string;
  };

  constructor(config: SmartEmbeddingConfig) {
    this.config = config;
    this.resourceMode = config.resourceMode || "balanced";
    this.gpuConfig = this.detectGpuConfig();
    this.modelPaths = this.resolveModelPaths();

    // 根据系统内存自动选择模式
    this.autoDetectResourceMode();

    log.info(`SmartEmbeddingEngine 初始化`);
    log.info(`  资源模式: ${this.resourceMode}`);
    log.info(`  GPU: ${this.gpuConfig.enabled ? "启用" : "禁用"}`);
    log.info(`  嵌入模型: ${this.modelPaths.embedding}`);
    if (this.modelPaths.expansion) {
      log.info(`  扩展模型: ${this.modelPaths.expansion}`);
    }
    if (this.modelPaths.reranker) {
      log.info(`  Reranker: ${this.modelPaths.reranker}`);
    }
  }

  /**
   * 解析模型路径（优先使用配置，否则使用自动下载路径）
   */
  private resolveModelPaths(): { embedding: string; expansion?: string; reranker?: string } {
    const { cfg, memoryConfig } = this.config;

    // 嵌入模型路径
    let embeddingPath: string;
    if (memoryConfig.local?.modelPath) {
      embeddingPath = memoryConfig.local.modelPath;
    } else {
      // 使用 NSEM 预定义模型
      embeddingPath = NSEM_PREDEFINED_MODELS.embedding.hfPath!;
    }

    // 扩展模型路径
    let expansionPath: string | undefined;
    if (this.config.expansionModelPath) {
      expansionPath = this.config.expansionModelPath;
    } else if (isModelReady("expansion")) {
      expansionPath = getModelPath("expansion");
    }

    // Reranker 模型路径（可选）
    let rerankerPath: string | undefined;
    if (this.config.rerankerModelPath) {
      rerankerPath = this.config.rerankerModelPath;
    } else if (this.resourceMode !== "minimal" && isModelReady("reranker")) {
      rerankerPath = getModelPath("reranker");
    }

    return {
      embedding: embeddingPath,
      expansion: expansionPath,
      reranker: rerankerPath,
    };
  }

  /**
   * 检测 GPU 配置
   */
  private detectGpuConfig(): GpuConfig {
    // 检查环境变量或系统配置
    const gpuEnabled = process.env.NSEM_GPU_ENABLED !== "false";
    const vramMb = process.env.NSEM_GPU_VRAM_MB
      ? parseInt(process.env.NSEM_GPU_VRAM_MB, 10)
      : undefined;

    // 自动检测 GPU 层数
    let gpuLayers: number | undefined;
    if (gpuEnabled) {
      // 根据资源模式设置默认 GPU 层数
      switch (this.resourceMode) {
        case "minimal":
          gpuLayers = 0; // CPU only
          break;
        case "balanced":
          gpuLayers = 999; // 尽可能多的层数
          break;
        case "performance":
          gpuLayers = 999; // 全 GPU
          break;
      }
    }

    return {
      enabled: gpuEnabled,
      vramMb,
      gpuLayers,
    };
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    log.info(`初始化智能嵌入引擎 [模式: ${this.resourceMode}]`);

    // 如果需要，自动下载模型
    if (this.config.autoDownloadModels !== false) {
      await this.ensureModelsDownloaded();
    }

    // 加载主嵌入模型
    await this.loadEmbeddingModel();

    // 加载扩展模型（如果配置）
    if (this.modelPaths.expansion) {
      await this.loadExpansionModel();
    }

    // 启动资源监控
    this.startResourceMonitor();
  }

  /**
   * 确保模型已下载
   */
  private async ensureModelsDownloaded(): Promise<void> {
    if (areAllModelsReady()) {
      log.info("所有模型已就绪");
      return;
    }

    log.info("正在下载 NSEM 所需模型...");

    try {
      // 跟踪每个模型的上一次打印进度，避免日志刷屏
      const lastPrintedProgress: Record<string, number> = {};
      
      const downloaded = await downloadAllNSEMModels((modelName, progress) => {
        const lastPrinted = lastPrintedProgress[modelName] ?? -1;
        // 每 10% 打印一次，或者首次/完成时
        if (progress.percentage === 0 || progress.percentage >= 100 || progress.percentage - lastPrinted >= 10) {
          log.info(`下载 ${modelName}: ${progress.percentage}%`);
          lastPrintedProgress[modelName] = progress.percentage;
        }
      });

      log.info(`模型下载完成: ${Object.keys(downloaded).join(", ")}`);

      // 更新模型路径
      this.modelPaths = {
        embedding: this.modelPaths.embedding,
        expansion: getModelPath("expansion"),
        reranker: this.resourceMode !== "minimal" ? getModelPath("reranker") : undefined,
      };
    } catch (error) {
      log.error(`模型下载失败: ${error}`);
      // 下载失败不阻止启动，使用 fallback
    }
  }

  /**
   * 嵌入 - 主入口
   */
  async embed(text: string): Promise<number[]> {
    if (!this.embeddingProvider) {
      await this.loadEmbeddingModel();
    }
    return this.embeddingProvider!.embedQuery(text);
  }

  /**
   * 批量嵌入
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embeddingProvider) {
      await this.loadEmbeddingModel();
    }
    return this.embeddingProvider!.embedBatch(texts);
  }

  /**
   * 智能重排
   *
   * 根据资源模式决定是否使用重排
   */
  async rerank(
    query: string,
    candidates: Array<{ text: string; score: number }>,
  ): Promise<Array<{ text: string; score: number; rerankScore?: number }>> {
    // 极简模式：跳过重排
    if (this.resourceMode === "minimal") {
      return candidates;
    }

    // 候选太少：不需要重排
    if (candidates.length <= 3) {
      return candidates;
    }

    // 延迟加载重排模型
    if (!this.rerankerProvider) {
      await this.loadRerankerModel();
    }

    if (!this.rerankerProvider) {
      return candidates;
    }

    this.rerankerLastUsed = Date.now();

    // 使用重排模型
    try {
      const queryEmbedding = await this.rerankerProvider.embedQuery(query);

      const reranked = await Promise.all(
        candidates.slice(0, 20).map(async (candidate) => {
          // 只重排前20个
          const docEmbedding = await this.rerankerProvider!.embedQuery(candidate.text);
          const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
          return {
            ...candidate,
            rerankScore: similarity * 0.6 + candidate.score * 0.4,
          };
        }),
      );

      // 剩余候选保持原样
      const rest = candidates.slice(20).map((c) => ({ ...c }));

      return [...reranked, ...rest].sort(
        (a, b) =>
          ((b as unknown as { rerankScore?: number }).rerankScore ?? b.score) -
          ((a as unknown as { rerankScore?: number }).rerankScore ?? a.score),
      );
    } catch (e) {
      log.warn(`重排失败，返回原结果: ${e}`);
      return candidates;
    }
  }

  /**
   * 查询扩展（使用扩展模型）
   *
   * 如果配置了扩展模型，使用模型进行查询扩展
   * 否则使用轻量级规则扩展
   */
  async expandQuery(
    query: string,
  ): Promise<{ original: string; expanded: string; variants: string[]; variations: string[] }> {
    // 如果有扩展模型，使用模型进行扩展
    if (this.expansionProvider) {
      try {
        return await this.expandQueryWithModel(query);
      } catch (error) {
        log.warn(`模型扩展失败，回退到规则扩展: ${error}`);
      }
    }

    // 轻量级规则扩展
    return this.expandQueryWithRules(query);
  }

  /**
   * 使用扩展模型进行查询扩展
   */
  private async expandQueryWithModel(
    query: string,
  ): Promise<{ original: string; expanded: string; variants: string[]; variations: string[] }> {
    // TODO: 实现基于 LLM 的查询扩展
    // 目前回退到规则扩展
    return this.expandQueryWithRules(query);
  }

  /**
   * 使用规则进行查询扩展
   */
  private async expandQueryWithRules(
    query: string,
  ): Promise<{ original: string; expanded: string; variants: string[]; variations: string[] }> {
    const variants: string[] = [];
    const lower = query.toLowerCase();

    // 同义词替换规则
    const synonyms: Record<string, string[]> = {
      学习: ["掌握", "研究", "了解", "探索", "learn", "study", "master"],
      代码: ["程序", "脚本", "实现", "code", "program", "script"],
      问题: ["难题", "挑战", "疑问", "problem", "issue", "question"],
      解决: ["修复", "处理", "优化"],
      创建: ["建立", "生成", "构建"],
      删除: ["移除", "清理", "卸载"],
    };

    // 应用同义词扩展
    for (const [word, alts] of Object.entries(synonyms)) {
      if (lower.includes(word)) {
        for (const alt of alts.slice(0, 2)) {
          variants.push(query.replace(new RegExp(word, "gi"), alt));
        }
      }
    }

    // 添加通用扩展
    if (!lower.includes("如何") && !lower.includes("how")) {
      variants.push(`如何${query}`);
      variants.push(`how to ${query}`);
    }
    if (!lower.includes("最佳") && !lower.includes("best")) {
      variants.push(`${query} 最佳实践`);
      variants.push(`best way to ${query}`);
    }

    const uniqueVariants = [...new Set(variants)].slice(0, 5);
    return {
      original: query,
      expanded: uniqueVariants.join(" ") || query,
      variants: uniqueVariants,
      variations: uniqueVariants,
    };
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    resourceMode: "minimal" | "balanced" | "performance";
    embeddingLoaded: boolean;
    expansionLoaded: boolean;
    rerankerLoaded: boolean;
    rerankerIdle: number;
    gpuEnabled: boolean;
  } {
    return {
      resourceMode: this.resourceMode,
      embeddingLoaded: this.embeddingProvider !== null,
      expansionLoaded: this.expansionProvider !== null,
      rerankerLoaded: this.rerankerProvider !== null,
      rerankerIdle: Date.now() - this.rerankerLastUsed,
      gpuEnabled: this.gpuConfig.enabled,
    };
  }

  /**
   * 切换资源模式
   */
  async setResourceMode(mode: "minimal" | "balanced" | "performance"): Promise<void> {
    if (this.resourceMode === mode) return;

    log.info(`切换资源模式: ${this.resourceMode} → ${mode}`);
    this.resourceMode = mode;

    // 更新 GPU 配置
    this.gpuConfig = this.detectGpuConfig();

    // 降级时卸载模型
    if (mode === "minimal") {
      this.unloadReranker();
      this.unloadExpansion();
    }

    // 注意：重排模型和扩展模型采用延迟加载策略
    // 不在启动时预加载，第一次使用时才加载
    // 这样可以避免启动时的内存压力和崩溃风险
  }

  /**
   * 获取统计信息 (测试兼容)
   */
  getStats(): {
    resourceMode: string;
    modelLoaded: boolean;
    modelPath: string;
    memoryUsage: number;
    cacheSize: number;
    cacheHits: number;
  } {
    return {
      resourceMode: this.resourceMode,
      modelLoaded: this.embeddingProvider !== null,
      modelPath: this.modelPaths.embedding,
      memoryUsage: 0, // 简化实现
      cacheSize: 0,
      cacheHits: 0,
    };
  }

  /**
   * 切换模型 (测试兼容，实际是 setResourceMode 的别名)
   */
  async switchModel(mode: "minimal" | "balanced" | "performance"): Promise<void> {
    return this.setResourceMode(mode);
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private async loadEmbeddingModel(): Promise<void> {
    if (this.embeddingProvider) return;

    const { cfg, memoryConfig } = this.config;
    const modelPath = this.modelPaths.embedding;

    log.info(`加载嵌入模型: ${modelPath}`);
    if (this.gpuConfig.enabled) {
      log.info(`  GPU 层数: ${this.gpuConfig.gpuLayers}`);
    }

    const result = await createEmbeddingProvider({
      config: cfg,
      provider: "local",
      model: modelPath,
      fallback: "none",
      local: {
        modelPath,
        modelCacheDir: memoryConfig.local.modelCacheDir,
      },
    });

    if (result.provider) {
      this.embeddingProvider = result.provider;
      log.info("✅ 嵌入模型加载成功");
    } else {
      throw new Error(`嵌入模型加载失败: ${result.providerUnavailableReason}`);
    }
  }

  private async loadExpansionModel(): Promise<void> {
    if (this.expansionProvider) return;
    if (!this.modelPaths.expansion) return;

    const { cfg, memoryConfig } = this.config;
    const modelPath = this.modelPaths.expansion;

    log.info(`加载扩展模型: ${modelPath}`);

    try {
      const result = await createEmbeddingProvider({
        config: cfg,
        provider: "local",
        model: modelPath,
        fallback: "none",
        local: {
          modelPath,
          modelCacheDir: memoryConfig.local.modelCacheDir,
        },
      });

      if (result.provider) {
        this.expansionProvider = result.provider;
        log.info("✅ 扩展模型加载成功");
      }
    } catch (e) {
      log.warn(`扩展模型加载失败: ${e}`);
      // 扩展模型加载失败不影响主功能
    }
  }

  private async loadRerankerModel(): Promise<void> {
    if (this.rerankerProvider) return;
    if (this.resourceMode === "minimal") return;
    if (!this.modelPaths.reranker) return;

    const { cfg, memoryConfig } = this.config;
    const modelPath = this.modelPaths.reranker;

    log.info(`加载重排模型: ${modelPath}`);

    try {
      const result = await createEmbeddingProvider({
        config: cfg,
        provider: "local",
        model: modelPath,
        fallback: "none",
        local: {
          modelPath,
          modelCacheDir: memoryConfig.local.modelCacheDir,
        },
      });

      if (result.provider) {
        this.rerankerProvider = result.provider;
        this.rerankerLastUsed = Date.now();
        log.info("✅ 重排模型加载成功");
      }
    } catch (e) {
      log.warn(`重排模型加载失败，将不使用重排: ${e}`);
    }
  }

  private unloadReranker(): void {
    if (!this.rerankerProvider) return;

    log.info("卸载重排模型 (资源释放)");
    this.rerankerProvider = null;
  }

  private unloadExpansion(): void {
    if (!this.expansionProvider) return;

    log.info("卸载扩展模型 (资源释放)");
    this.expansionProvider = null;
  }

  private getDefaultModelForMode(): {
    embedding: string;
    reranker: string | null;
  } {
    return LIGHTWEIGHT_MODELS[this.resourceMode];
  }

  private autoDetectResourceMode(): void {
    // 尝试检测系统内存 (Node.js 限制，仅作参考)
    const totalMemGB = totalmem() / 1024 ** 3;

    if (totalMemGB < 8) {
      this.resourceMode = "minimal";
      log.info(`自动选择极简模式 (内存: ${totalMemGB.toFixed(1)}GB)`);
    } else if (totalMemGB < 16) {
      this.resourceMode = "balanced";
      log.info(`自动选择平衡模式 (内存: ${totalMemGB.toFixed(1)}GB)`);
    } else {
      this.resourceMode = "performance";
      log.info(`自动选择性能模式 (内存: ${totalMemGB.toFixed(1)}GB)`);
    }
  }

  private startResourceMonitor(): void {
    // 每30秒检查一次重排模型是否需要卸载
    this.resourceMonitorTimer = setInterval(() => {
      if (this.rerankerProvider && this.resourceMode !== "performance") {
        const idle = Date.now() - this.rerankerLastUsed;
        if (idle > this.RERANKER_TTL) {
          this.unloadReranker();
        }
      }
    }, 30000);
  }

  /**
   * 清理资源 - 重要：防止内存泄露
   */
  async cleanup(): Promise<void> {
    log.debug("清理 SmartEmbeddingEngine 资源");

    if (this.resourceMonitorTimer) {
      clearInterval(this.resourceMonitorTimer);
      this.resourceMonitorTimer = undefined;
    }

    this.unloadReranker();
    this.unloadExpansion();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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
}

/**
 * 创建智能嵌入引擎
 */
export async function createSmartEmbeddingEngine(
  cfg: NsemclawConfig,
  agentId: string,
  memoryConfig: ResolvedMemorySearchConfig,
  resourceModeOrOptions?:
    | "minimal"
    | "balanced"
    | "performance"
    | { forceResourceMode?: string; cacheSize?: number },
  nsemConfig?: { rerankerModel?: string; expansionModel?: string; autoDownloadModels?: boolean },
): Promise<SmartEmbeddingEngine> {
  let resourceMode: "minimal" | "balanced" | "performance" | undefined;

  if (typeof resourceModeOrOptions === "string") {
    resourceMode = resourceModeOrOptions;
  } else if (resourceModeOrOptions?.forceResourceMode) {
    resourceMode = resourceModeOrOptions.forceResourceMode as
      | "minimal"
      | "balanced"
      | "performance";
  }

  const engine = new SmartEmbeddingEngine({
    cfg,
    agentId,
    memoryConfig,
    resourceMode,
    autoDownloadModels: nsemConfig?.autoDownloadModels ?? true,
    rerankerModelPath: nsemConfig?.rerankerModel,
    expansionModelPath: nsemConfig?.expansionModel,
  });
  await engine.initialize();
  return engine;
}
