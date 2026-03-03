/**
 * 混合记忆搜索管理器
 *
 * 同时搜索 NSEM 认知核心和传统记忆系统 (qmd/builtin)
 * 合并结果，提供最佳记忆召回
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  MemoryEmbeddingProbeResult,
  MemoryProviderStatus,
  MemorySearchManager,
  MemorySearchResult,
  MemorySyncProgressUpdate,
} from "./types.js";

const log = createSubsystemLogger("memory-hybrid");

export interface HybridSearchManagerDeps {
  /** NSEM 认知核心管理器 */
  nsem: MemorySearchManager;
  /** 传统记忆系统管理器 (qmd 或 builtin) */
  traditional: MemorySearchManager;
  /** 配置选项 */
  options?: {
    /** NSEM 结果权重 (0-1) */
    nsemWeight?: number;
    /** 传统结果权重 (0-1) */
    traditionalWeight?: number;
    /** 去重相似度阈值 */
    dedupThreshold?: number;
    /** 最大结果数 */
    maxResults?: number;
  };
}



/**
 * 混合记忆搜索管理器
 *
 * 并行搜索 NSEM 和传统记忆系统，智能合并结果
 */
export class HybridSearchManager implements MemorySearchManager {
  private deps: HybridSearchManagerDeps;
  private options: Required<NonNullable<HybridSearchManagerDeps["options"]>>;

  constructor(deps: HybridSearchManagerDeps) {
    this.deps = deps;
    this.options = {
      nsemWeight: 1.0,
      traditionalWeight: 0.9,
      dedupThreshold: 0.85,
      maxResults: 10,
      ...deps.options,
    };
  }

  /**
   * 搜索记忆 - 同时搜索两个系统并合并结果
   */
  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    const maxResults = options?.maxResults ?? this.options.maxResults;
    const minScore = options?.minScore ?? 0.3;

    log.debug(`混合搜索: "${query}" (maxResults=${maxResults})`);

    // 并行搜索两个系统
    const [nsemResults, traditionalResults] = await Promise.allSettled([
      this.searchNSEM(query, options),
      this.searchTraditional(query, options),
    ]);

    const nsem = nsemResults.status === "fulfilled" ? nsemResults.value : [];
    const traditional = traditionalResults.status === "fulfilled" ? traditionalResults.value : [];

    if (nsemResults.status === "rejected") {
      log.warn(`NSEM 搜索失败: ${nsemResults.reason}`);
    }
    if (traditionalResults.status === "rejected") {
      log.warn(`传统记忆搜索失败: ${traditionalResults.reason}`);
    }

    // 合并结果
    const merged = this.mergeResults(nsem, traditional, maxResults, minScore);

    log.debug(`混合搜索完成: NSEM=${nsem.length}, 传统=${traditional.length}, 合并=${merged.length}`);

    return merged;
  }

  /**
   * 读取文件 - 优先传统系统（支持文件路径）
   * 如果传统系统失败，尝试 NSEM（通过原子内容）
   */
  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    // 首先尝试传统系统
    try {
      const result = await this.deps.traditional.readFile(params);
      if (result.text) {
        return result;
      }
    } catch (err) {
      log.debug(`传统系统读取失败，尝试 NSEM: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 如果传统系统失败或返回空，尝试从 NSEM 获取
    try {
      // NSEM 通过搜索获取内容
      const searchResult = await this.deps.nsem.search(params.relPath, { maxResults: 1 });
      if (searchResult.length > 0) {
        return {
          text: searchResult[0]!.snippet,
          path: params.relPath,
        };
      }
    } catch (err) {
      log.warn(`NSEM 读取失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 都失败了，尝试返回传统系统的结果（处理文件不存在的情况）
    try {
      return await this.deps.traditional.readFile(params);
    } catch {
      // 如果传统系统仍然失败，返回空结果
      return { text: "", path: params.relPath };
    }
  }

  /**
   * 同步文件 - 同时同步到两个系统
   */
  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    const results = await Promise.allSettled([
      this.deps.nsem.sync?.(params),
      this.deps.traditional.sync?.(params),
    ]);

    if (results[0].status === "rejected") {
      log.warn(`NSEM 同步失败: ${results[0].reason}`);
    }
    if (results[1].status === "rejected") {
      log.warn(`传统记忆同步失败: ${results[1].reason}`);
    }
  }

  /**
   * 获取状态 - 合并两个系统的状态
   */
  status(): MemoryProviderStatus {
    const nsemStatus = this.deps.nsem.status();
    const traditionalStatus = this.deps.traditional.status();

    // 从 custom 中获取扩展字段
    const nsemCustom = nsemStatus.custom ?? {};
    const traditionalCustom = traditionalStatus.custom ?? {};

    return {
      provider: "hybrid",
      backend: "builtin",
      // 保留原始状态信息在 custom 中
      custom: {
        nsem: nsemStatus,
        traditional: traditionalStatus,
        hybrid: {
          atoms: ((nsemCustom.atoms as number) ?? 0) + ((traditionalCustom.atoms as number) ?? 0),
          fields: ((nsemCustom.fields as number) ?? 0) + ((traditionalCustom.fields as number) ?? 0),
          health: Math.max(
            ((nsemCustom.health as number) ?? 0),
            ((traditionalCustom.health as number) ?? 0),
          ),
        },
      },
      // 如果有任何 fallback 信息
      fallback: nsemStatus.fallback ?? traditionalStatus.fallback,
    };
  }

  /**
   * 探测嵌入可用性
   */
  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    const results = await Promise.allSettled([
      this.deps.nsem.probeEmbeddingAvailability(),
      this.deps.traditional.probeEmbeddingAvailability(),
    ]);

    const nsem = results[0].status === "fulfilled" ? results[0].value : { ok: false };
    const traditional = results[1].status === "fulfilled" ? results[1].value : { ok: false };

    return {
      ok: nsem.ok || traditional.ok,
      error: nsem.error || traditional.error,
    };
  }

  /**
   * 探测向量可用性
   */
  async probeVectorAvailability(): Promise<boolean> {
    const results = await Promise.allSettled([
      this.deps.nsem.probeVectorAvailability(),
      this.deps.traditional.probeVectorAvailability(),
    ]);

    const nsem = results[0].status === "fulfilled" ? results[0].value : false;
    const traditional = results[1].status === "fulfilled" ? results[1].value : false;

    return nsem || traditional;
  }

  /**
   * 关闭两个系统
   */
  async close(): Promise<void> {
    await Promise.allSettled([this.deps.nsem.close?.(), this.deps.traditional.close?.()]);
  }

  /**
   * 重新索引 - 两个系统都重新索引
   */
  async reindex?(onProgress?: (update: MemorySyncProgressUpdate) => Promise<void>): Promise<void> {
    await Promise.allSettled([
      (this.deps.nsem as any).reindex?.(onProgress),
      (this.deps.traditional as any).reindex?.(onProgress),
    ]);
  }

  /**
   * 删除记忆 - 两个系统都删除
   */
  async delete?(filePath: string): Promise<void> {
    await Promise.allSettled([
      (this.deps.nsem as any).delete?.(filePath),
      (this.deps.traditional as any).delete?.(filePath),
    ]);
  }

  /**
   * 获取来源列表 - 合并两个系统的来源
   */
  async sources?(): Promise<string[]> {
    const results = await Promise.allSettled([
      (this.deps.nsem as any).sources?.() ?? [],
      (this.deps.traditional as any).sources?.() ?? [],
    ]);

    const nsemSources = results[0].status === "fulfilled" ? results[0].value : [];
    const traditionalSources = results[1].status === "fulfilled" ? results[1].value : [];

    return Array.from(new Set([...nsemSources, ...traditionalSources]));
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private async searchNSEM(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    try {
      const results = await this.deps.nsem.search(query, {
        maxResults: (options?.maxResults ?? 10) * 2, // 获取更多用于合并
        minScore: options?.minScore,
        sessionKey: options?.sessionKey,
      });

      // 标记来源并调整分数
      return results.map((r) => ({
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        score: (r.score ?? 0) * this.options.nsemWeight,
        snippet: r.snippet,
        source: "memory" as MemorySearchResult["source"],
        citation: r.citation,
      }));
    } catch (err) {
      log.warn(`NSEM 搜索错误: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  private async searchTraditional(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    try {
      const results = await this.deps.traditional.search(query, {
        maxResults: (options?.maxResults ?? 10) * 2,
        minScore: options?.minScore,
        sessionKey: options?.sessionKey,
      });

      // 标记来源并调整分数
      return results.map((r) => ({
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        score: (r.score ?? 0) * this.options.traditionalWeight,
        snippet: r.snippet,
        source: r.source,
        citation: r.citation,
      }));
    } catch (err) {
      log.warn(`传统记忆搜索错误: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * 合并两个系统的搜索结果
   *
   * 策略:
   * 1. 按分数加权
   * 2. 去重（基于内容相似度）
   * 3. 交错排序（确保两个系统的结果都有机会展示）
   */
  private mergeResults(
    nsemResults: MemorySearchResult[],
    traditionalResults: MemorySearchResult[],
    maxResults: number,
    minScore: number,
  ): MemorySearchResult[] {
    // 过滤低分结果
    const filteredNsem = nsemResults.filter((r) => (r.score ?? 0) >= minScore);
    const filteredTraditional = traditionalResults.filter((r) => (r.score ?? 0) >= minScore);

    // 去重：如果两个系统返回了相似的内容，保留分数高的
    const deduped = this.deduplicateResults(filteredNsem, filteredTraditional);

    // 按分数排序并截取
    const sorted = deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return sorted.slice(0, maxResults);
  }

  /**
   * 去重：基于内容相似度合并重复结果
   */
  private deduplicateResults(
    nsemResults: MemorySearchResult[],
    traditionalResults: MemorySearchResult[],
  ): MemorySearchResult[] {
    const nsem = nsemResults;
    const traditional = traditionalResults;
    const result: MemorySearchResult[] = [];
    const usedTraditional = new Set<number>();

    for (const nsemItem of nsem) {
      // 查找相似的传统结果
      let bestMatch: { index: number; similarity: number } | null = null;

      for (let i = 0; i < traditional.length; i++) {
        if (usedTraditional.has(i)) continue;

        const tradItem = traditional[i]!;
        const similarity = this.calculateSimilarity(nsemItem, tradItem);

        if (similarity >= this.options.dedupThreshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { index: i, similarity };
          }
        }
      }

      if (bestMatch) {
        // 合并两个结果，保留分数更高的信息
        const tradItem = traditional[bestMatch.index]!;
        const merged: MemorySearchResult = {
          path: nsemItem.path,
          startLine: nsemItem.startLine,
          endLine: nsemItem.endLine,
          score: Math.max(nsemItem.score ?? 0, tradItem.score ?? 0),
          snippet: nsemItem.snippet.length > tradItem.snippet.length ? nsemItem.snippet : tradItem.snippet,
          source: "memory",
          citation: nsemItem.citation ?? tradItem.citation,
        };
        result.push(merged);
        usedTraditional.add(bestMatch.index);
      } else {
        // 没有重复，直接添加
        result.push(nsemItem);
      }
    }

    // 添加未使用的传统结果
    for (let i = 0; i < traditional.length; i++) {
      if (!usedTraditional.has(i)) {
        result.push(traditional[i]!);
      }
    }

    return result;
  }

  /**
   * 计算两个记忆结果的相似度
   */
  private calculateSimilarity(a: { path: string; startLine?: number; endLine?: number; snippet: string }, b: { path: string; startLine?: number; endLine?: number; snippet: string }): number {
    // 如果路径相同，认为是同一个来源
    if (a.path === b.path && a.path) {
      // 检查行范围重叠
      const aStart = a.startLine ?? 0;
      const aEnd = a.endLine ?? aStart;
      const bStart = b.startLine ?? 0;
      const bEnd = b.endLine ?? bStart;

      const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
      const total = Math.max(aEnd, bEnd) - Math.min(aStart, bStart);

      if (total > 0 && overlap / total > 0.5) {
        return 1.0;
      }
    }

    // 基于内容相似度
    const aContent = (a.snippet ?? "").toLowerCase().slice(0, 200);
    const bContent = (b.snippet ?? "").toLowerCase().slice(0, 200);

    // 简单的 Jaccard 相似度
    const aWords = new Set(aContent.split(/\s+/));
    const bWords = new Set(bContent.split(/\s+/));

    const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }
}
