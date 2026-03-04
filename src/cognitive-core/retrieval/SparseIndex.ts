/**
 * 稀疏向量索引 (Sparse Index)
 * 
 * 基于 BM25 的稀疏检索，支持 QMD 风格的关键词提取
 * 与 Dense 向量形成互补，实现 Hybrid 搜索
 */

import { extractKeywords, buildFtsQuery } from "../../memory/query-expansion.js";
import { bm25RankToScore } from "../../memory/hybrid.js";

/**
 * 稀疏向量
 */
export interface SparseVector {
  /** 词项 -> TF-IDF 权重 */
  terms: Map<string, number>;
  /** 文档长度 (词项数) */
  docLength: number;
}

/**
 * 稀疏检索结果
 */
export interface SparseSearchResult {
  uri: string;
  score: number;
  matchedTerms: string[];
  source: "bm25" | "hybrid";
}

/**
 * BM25 参数
 */
interface BM25Params {
  /** 词频饱和度参数 (通常 1.2-2.0) */
  k1: number;
  /** 长度归一化参数 (通常 0.75) */
  b: number;
}

const DEFAULT_BM25_PARAMS: BM25Params = {
  k1: 1.5,
  b: 0.75,
};

/**
 * 稀疏索引管理器
 * 
 * 实现 BM25 算法的稀疏向量检索
 */
export class SparseIndex {
  /** 倒排索引: 词项 -> 文档集合 */
  private termDocs: Map<string, Set<string>> = new Map();
  
  /** 文档稀疏向量: URI -> 稀疏向量 */
  private docVectors: Map<string, SparseVector> = new Map();
  
  /** 文档文本缓存 (用于调试) */
  private docTexts: Map<string, string> = new Map();
  
  /** BM25 参数 */
  private bm25Params: BM25Params;
  
  /** 平均文档长度 */
  private avgDocLength: number = 0;
  
  /** 总文档数 */
  private totalDocs: number = 0;

  constructor(params: Partial<BM25Params> = {}) {
    this.bm25Params = { ...DEFAULT_BM25_PARAMS, ...params };
  }

  // ========================================================================
  // 索引管理
  // ========================================================================

  /**
   * 添加文档到索引
   */
  addDocument(uri: string, text: string): void {
    // 提取关键词
    const keywords = extractKeywords(text);
    
    if (keywords.length === 0) {
      // 即使没有关键词也记录，避免后续 null 检查
      this.docVectors.set(uri, { terms: new Map(), docLength: 0 });
      this.docTexts.set(uri, text);
      return;
    }

    // 计算词频
    const termFreq = new Map<string, number>();
    for (const term of keywords) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    // 构建稀疏向量 (使用 log TF)
    const terms = new Map<string, number>();
    for (const [term, freq] of termFreq) {
      const tf = Math.log1p(freq);  // log(1 + tf)
      terms.set(term, tf);
      
      // 更新倒排索引
      if (!this.termDocs.has(term)) {
        this.termDocs.set(term, new Set());
      }
      this.termDocs.get(term)!.add(uri);
    }

    // 存储文档向量
    this.docVectors.set(uri, { terms, docLength: keywords.length });
    this.docTexts.set(uri, text);

    // 更新统计
    this.updateStats();
  }

  /**
   * 批量添加文档
   */
  addDocuments(docs: Array<{ uri: string; text: string }>): void {
    for (const { uri, text } of docs) {
      this.addDocument(uri, text);
    }
  }

  /**
   * 移除文档
   */
  removeDocument(uri: string): boolean {
    const vector = this.docVectors.get(uri);
    if (!vector) return false;

    // 从倒排索引中移除
    for (const term of vector.terms.keys()) {
      const docs = this.termDocs.get(term);
      if (docs) {
        docs.delete(uri);
        if (docs.size === 0) {
          this.termDocs.delete(term);
        }
      }
    }

    this.docVectors.delete(uri);
    this.docTexts.delete(uri);
    this.updateStats();
    
    return true;
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    this.totalDocs = this.docVectors.size;
    
    if (this.totalDocs === 0) {
      this.avgDocLength = 0;
      return;
    }

    let totalLength = 0;
    for (const vector of this.docVectors.values()) {
      totalLength += vector.docLength;
    }
    this.avgDocLength = totalLength / this.totalDocs;
  }

  // ========================================================================
  // 检索
  // ========================================================================

  /**
   * BM25 搜索
   */
  search(query: string, topK: number = 10): SparseSearchResult[] {
    const queryTerms = extractKeywords(query);
    
    if (queryTerms.length === 0 || this.totalDocs === 0) {
      return [];
    }

    const scores = new Map<string, { score: number; matched: string[] }>();

    for (const term of queryTerms) {
      const docs = this.termDocs.get(term);
      if (!docs) continue;

      // IDF 计算
      const idf = this.computeIDF(docs.size);

      for (const docId of docs) {
        const docVector = this.docVectors.get(docId)!;
        const tf = docVector.terms.get(term) || 0;
        
        // BM25 公式
        const bm25Score = this.computeBM25Score(tf, docVector.docLength, idf);
        
        const existing = scores.get(docId);
        if (existing) {
          existing.score += bm25Score;
          existing.matched.push(term);
        } else {
          scores.set(docId, { score: bm25Score, matched: [term] });
        }
      }
    }

    // 排序并返回
    return Array.from(scores.entries())
      .map(([uri, { score, matched }]) => ({
        uri,
        score: bm25RankToScore(score),  // 归一化到 0-1
        matchedTerms: matched,
        source: "bm25" as const,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 计算 BM25 分数
   */
  private computeBM25Score(
    tf: number,
    docLength: number,
    idf: number
  ): number {
    const { k1, b } = this.bm25Params;
    
    // 长度归一化
    const lengthNorm = this.avgDocLength > 0
      ? (1 - b) + b * (docLength / this.avgDocLength)
      : 1;
    
    // BM25 公式
    return idf * (tf * (k1 + 1)) / (tf + k1 * lengthNorm);
  }

  /**
   * 计算 IDF
   */
  private computeIDF(docFreq: number): number {
    // 平滑 IDF
    return Math.log(
      (this.totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1
    );
  }

  // ========================================================================
  // Hybrid 搜索支持
  // ========================================================================

  /**
   * 融合 Dense 和 Sparse 结果
   */
  fuseWithDenseResults(
    sparseResults: SparseSearchResult[],
    denseResults: Array<{ uri: string; score: number }>,
    sparseWeight: number = 0.3,
    denseWeight: number = 0.7
  ): Array<{ uri: string; score: number; sources: string[] }> {
    const combined = new Map<string, { sparse: number; dense: number }>();

    // 收集 sparse 分数
    for (const r of sparseResults) {
      combined.set(r.uri, { sparse: r.score, dense: 0 });
    }

    // 收集 dense 分数
    for (const r of denseResults) {
      const existing = combined.get(r.uri);
      if (existing) {
        existing.dense = r.score;
      } else {
        combined.set(r.uri, { sparse: 0, dense: r.score });
      }
    }

    // 加权融合
    return Array.from(combined.entries())
      .map(([uri, { sparse, dense }]) => ({
        uri,
        score: sparseWeight * sparse + denseWeight * dense,
        sources: [
          ...(sparse > 0 ? ["sparse"] : []),
          ...(dense > 0 ? ["dense"] : []),
        ],
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ========================================================================
  // 查询
  // ========================================================================

  /**
   * 获取文档的稀疏向量
   */
  getVector(uri: string): SparseVector | undefined {
    return this.docVectors.get(uri);
  }

  /**
   * 获取索引统计
   */
  getStats(): {
    totalDocs: number;
    totalTerms: number;
    avgDocLength: number;
    avgTermsPerDoc: number;
  } {
    let totalTermOccurrences = 0;
    for (const vector of this.docVectors.values()) {
      totalTermOccurrences += vector.docLength;
    }

    return {
      totalDocs: this.totalDocs,
      totalTerms: this.termDocs.size,
      avgDocLength: this.avgDocLength,
      avgTermsPerDoc: this.totalDocs > 0 ? totalTermOccurrences / this.totalDocs : 0,
    };
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.termDocs.clear();
    this.docVectors.clear();
    this.docTexts.clear();
    this.avgDocLength = 0;
    this.totalDocs = 0;
  }
}

/**
 * 创建稀疏索引
 */
export function createSparseIndex(params?: Partial<BM25Params>): SparseIndex {
  return new SparseIndex(params);
}
