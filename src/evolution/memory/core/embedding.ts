/**
 * 嵌入引擎 - 处理语义向量
 *
 * 使用轻量级本地嵌入，避免外部依赖
 * 支持动态维度调整和相似度计算
 */

export type Vector = number[];

export interface EmbeddingConfig {
  /** 向量维度 */
  dimension: number;

  /** 本地模型路径（可选） */
  modelPath?: string;

  /** 相似度阈值 */
  similarityThreshold: number;

  /** 使用外部API */
  useExternalAPI: boolean;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  dimension: 384, // 轻量级嵌入维度
  similarityThreshold: 0.7,
  useExternalAPI: false,
};

export class EmbeddingEngine {
  private config: EmbeddingConfig;
  private cache: Map<string, Vector> = new Map();

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 生成文本嵌入
   *
   * 使用简化版的词频哈希 + 位置编码
   * 实际场景应使用预训练模型如 all-MiniLM-L6-v2
   */
  async embed(text: string): Promise<Vector> {
    // 检查缓存
    const cacheKey = this.hash(text);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 文本预处理
    const normalized = this.normalize(text);

    // 使用简化版语义编码
    const embedding = this.computeEmbedding(normalized);

    // 缓存
    this.cache.set(cacheKey, embedding);

    // 限制缓存大小
    if (this.cache.size > 10000) {
      const first = this.cache.keys().next().value as string | undefined;
      if (first) {
        this.cache.delete(first);
      }
    }

    return embedding;
  }

  /**
   * 批量嵌入
   */
  async embedBatch(texts: string[]): Promise<Vector[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  /**
   * 计算余弦相似度
   */
  similarity(a: Vector, b: Vector): number {
    if (a.length !== b.length) {
      throw new Error("向量维度不匹配");
    }

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
   * 欧氏距离
   */
  distance(a: Vector, b: Vector): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * 加权平均
   */
  weightedAverage(a: Vector, b: Vector, weightB: number): Vector {
    const weightA = 1 - weightB;
    return a.map((val, i) => val * weightA + b[i] * weightB);
  }

  /**
   * 向量插值
   */
  interpolate(a: Vector, b: Vector, t: number): Vector {
    return a.map((val, i) => val + (b[i] - val) * t);
  }

  /**
   * 向量归一化
   */
  normalizeVector(v: Vector): Vector {
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    if (norm === 0) return v;
    return v.map((x) => x / norm);
  }

  /**
   * 降维（用于可视化）
   */
  reduceDimension(vectors: Vector[], targetDim: 2 | 3 = 2): Vector[] {
    // 简化的PCA
    const n = vectors.length;
    const d = vectors[0].length;

    // 计算均值
    const mean = new Array(d).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < d; i++) {
        mean[i] += v[i];
      }
    }
    for (let i = 0; i < d; i++) {
      mean[i] /= n;
    }

    // 中心化
    const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

    // 简化：取前targetDim个主成分（实际是随机投影）
    const result: Vector[] = [];
    for (const v of centered) {
      const projected = new Array(targetDim).fill(0);
      for (let i = 0; i < targetDim; i++) {
        let sum = 0;
        for (let j = 0; j < d; j++) {
          sum += v[j] * Math.cos((i + 1) * (j + 1));
        }
        projected[i] = sum / Math.sqrt(d);
      }
      result.push(projected);
    }

    return result;
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  private hash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000); // 限制长度
  }

  /**
   * 简化的语义嵌入计算
   *
   * 使用字符n-gram + 位置编码的组合
   * 这不是真正的语义嵌入，但对于轻量级场景够用
   * 实际产品应使用Sentence Transformers或OpenAI API
   */
  private computeEmbedding(text: string): Vector {
    const dim = this.config.dimension;
    const embedding = new Array(dim).fill(0);

    // 字符n-gram特征
    const ngrams = this.extractNgrams(text, 3);

    for (let i = 0; i < ngrams.length; i++) {
      const ngram = ngrams[i];
      const position = i / ngrams.length; // 归一化位置

      // 哈希到不同维度
      for (let d = 0; d < dim; d++) {
        const hash = this.ngramHash(ngram, d);
        const positionEncoding = Math.sin(position * Math.PI * (d + 1));
        embedding[d] += hash * positionEncoding;
      }
    }

    // 归一化
    return this.normalizeVector(embedding);
  }

  private extractNgrams(text: string, n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.slice(i, i + n));
    }
    return ngrams.length > 0 ? ngrams : [text];
  }

  private ngramHash(ngram: string, dimension: number): number {
    let hash = dimension;
    for (let i = 0; i < ngram.length; i++) {
      hash = (hash << 5) - hash + ngram.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.sin(hash) * 0.5 + 0.5; // 归一化到0-1
  }
}
