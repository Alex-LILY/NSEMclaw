/**
 * 高性能向量存储系统
 *
 * 特性：
 * 1. 向量持久化到 SQLite
 * 2. 内存-磁盘分层存储（热/温/冷）
 * 3. 向量压缩（Float32 -> Float16）
 * 4. 按需动态加载
 * 5. 适配 128GB 内存 + 1TB 磁盘
 */

import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { Vector } from "../types/index.js";

const log = createSubsystemLogger("vector-storage");

// ============================================================================
// 类型定义
// ============================================================================

export interface VectorStorageConfig {
  /** 存储目录 */
  baseDir: string;
  /** 数据库名称 */
  dbName: string;
  /** 向量维度 */
  vectorDim: number;
  /** 是否启用 WAL 模式 */
  enableWAL: boolean;
  /** 压缩类型 */
  compression: "none" | "float16" | "int8";
  /** 热数据缓存大小 */
  hotCacheSize: number;
  /** 温数据缓存大小 */
  warmCacheSize: number;
}

export interface StoredVector {
  id: string;
  vector: Vector;
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
  importance: number;
  tier: "hot" | "warm" | "cold";
  metadata?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  similarity: number;
  /** @deprecated use similarity instead */
  score: number;
  vector: Vector;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 向量压缩工具
// ============================================================================

/**
 * Float32 向量压缩为 Float16 (节省 50% 空间)
 */
export function compressVectorToFloat16(vector: Vector): Buffer {
  const buffer = Buffer.alloc(vector.length * 2);
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i];
    const view = new DataView(buffer.buffer, i * 2);
    const sign = value < 0 ? 1 : 0;
    const abs = Math.abs(value);
    let exponent = Math.floor(Math.log2(abs));
    let mantissa = abs / Math.pow(2, exponent) - 1;

    if (exponent < -14) {
      mantissa = abs / Math.pow(2, -14);
      exponent = -15;
    }

    const biasedExp = exponent + 15;
    const half = (sign << 15) | ((biasedExp & 0x1f) << 10) | ((mantissa * 1024) & 0x3ff);
    view.setUint16(0, half, true);
  }
  return buffer;
}

/**
 * Float16 解压为 Float32
 */
export function decompressVectorFromFloat16(buffer: Buffer, dim: number): Vector {
  const vector: Vector = new Array(dim);
  for (let i = 0; i < dim; i++) {
    const view = new DataView(buffer.buffer, i * 2);
    const half = view.getUint16(0, true);

    const sign = (half >> 15) & 1;
    const exponent = ((half >> 10) & 0x1f) - 15;
    const mantissa = (half & 0x3ff) / 1024;

    let value: number;
    if (exponent === -15) {
      value = Math.pow(2, -14) * mantissa;
    } else if (exponent === 16) {
      value = mantissa === 0 ? Infinity : NaN;
    } else {
      value = Math.pow(2, exponent) * (1 + mantissa);
    }

    vector[i] = sign === 1 ? -value : value;
  }
  return vector;
}

/**
 * 向量量化压缩 (float32 -> int8)
 */
export function quantizeVector(vector: Vector): { data: Buffer; min: number; max: number } {
  const min = Math.min(...vector);
  const max = Math.max(...vector);
  const range = max - min || 1;

  const buffer = Buffer.alloc(vector.length);
  for (let i = 0; i < vector.length; i++) {
    const normalized = (vector[i] - min) / range;
    buffer[i] = Math.round(normalized * 255);
  }

  return { data: buffer, min, max };
}

/**
 * 反量化向量
 */
export function dequantizeVector(buffer: Buffer, min: number, max: number): Vector {
  const range = max - min;
  const vector: Vector = new Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    vector[i] = min + (buffer[i] / 255) * range;
  }
  return vector;
}

// ============================================================================
// 高性能向量存储
// ============================================================================

const VECTOR_TABLE_SCHEMA = `
-- 向量主表
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  vector_data BLOB NOT NULL,
  vector_dim INTEGER NOT NULL,
  compression_type TEXT DEFAULT 'float16',
  access_count INTEGER DEFAULT 0,
  last_accessed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  importance REAL DEFAULT 0.5,
  tier TEXT DEFAULT 'cold',
  min_val REAL,
  max_val REAL
);

-- 向量元数据表
CREATE TABLE IF NOT EXISTS vector_metadata (
  vector_id TEXT PRIMARY KEY,
  content TEXT,
  content_type TEXT,
  source_file TEXT,
  agent_id TEXT,
  tags TEXT,
  FOREIGN KEY (vector_id) REFERENCES vectors(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_vectors_tier ON vectors(tier);
CREATE INDEX IF NOT EXISTS idx_vectors_last_accessed ON vectors(last_accessed);
CREATE INDEX IF NOT EXISTS idx_vectors_importance ON vectors(importance);
CREATE INDEX IF NOT EXISTS idx_vectors_agent ON vector_metadata(agent_id);
`;

export class VectorStorage {
  private db: Database;
  private config: VectorStorageConfig;
  private hotCache: Map<string, StoredVector>;
  private warmCache: Map<string, StoredVector>;

  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    diskReads: 0,
    diskWrites: 0,
  };

  private vectorDim: number;

  constructor(config: Partial<VectorStorageConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? path.join(homedir(), ".nsemclaw", "vector-storage"),
      dbName: config.dbName ?? "vectors.db",
      vectorDim: config.vectorDim ?? 384,
      enableWAL: config.enableWAL ?? true,
      compression: config.compression ?? "float16",
      hotCacheSize: config.hotCacheSize ?? 100000,
      warmCacheSize: config.warmCacheSize ?? 500000,
    };

    this.vectorDim = this.config.vectorDim;
    this.hotCache = new Map();
    this.warmCache = new Map();
    this.db = this.initDatabase();

    log.info(`VectorStorage initialized`);
    log.info(`  Base dir: ${this.config.baseDir}`);
    log.info(`  Compression: ${this.config.compression}`);
    log.info(`  Hot cache: ${this.config.hotCacheSize}`);
    log.info(`  Warm cache: ${this.config.warmCacheSize}`);
  }

  private initDatabase(): Database {
    fs.mkdirSync(this.config.baseDir, { recursive: true });
    const dbPath = path.join(this.config.baseDir, this.config.dbName);
    const db = new Database(dbPath);

    if (this.config.enableWAL) {
      db.pragma("journal_mode = WAL");
    }

    db.exec(VECTOR_TABLE_SCHEMA);
    return db;
  }

  store(
    id: string,
    vector: Vector,
    metadata?: {
      content?: string;
      contentType?: string;
      importance?: number;
      agentId?: string;
      tags?: string[];
    },
  ): void {
    const now = Date.now();
    const { data, compressionType, min, max } = this.compressVector(vector);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vectors 
      (id, vector_data, vector_dim, compression_type, access_count, last_accessed, created_at, importance, tier, min_val, max_val)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data,
      vector.length,
      compressionType,
      0,
      now,
      now,
      metadata?.importance ?? 0.5,
      "cold",
      min ?? null,
      max ?? null,
    );

    if (metadata) {
      const metaStmt = this.db.prepare(`
        INSERT OR REPLACE INTO vector_metadata 
        (vector_id, content, content_type, agent_id, tags)
        VALUES (?, ?, ?, ?, ?)
      `);

      metaStmt.run(
        id,
        metadata.content ?? null,
        metadata.contentType ?? null,
        metadata.agentId ?? null,
        metadata.tags ? JSON.stringify(metadata.tags) : null,
      );
    }

    this.stats.diskWrites++;

    this.putToCache({
      id,
      vector,
      accessCount: 0,
      lastAccessed: now,
      createdAt: now,
      importance: metadata?.importance ?? 0.5,
      tier: "hot",
    });
  }

  get(id: string): StoredVector | null {
    const hot = this.hotCache.get(id);
    if (hot) {
      this.stats.cacheHits++;
      hot.accessCount++;
      hot.lastAccessed = Date.now();
      return hot;
    }

    const warm = this.warmCache.get(id);
    if (warm) {
      this.stats.cacheHits++;
      this.promoteToHot(warm);
      return warm;
    }

    const fromDisk = this.loadFromDisk(id);
    if (fromDisk) {
      this.stats.cacheMisses++;
      this.putToCache(fromDisk);
      return fromDisk;
    }

    return null;
  }

  search(
    queryVector: Vector,
    options?: {
      topK?: number;
      minSimilarity?: number;
    },
  ): VectorSearchResult[] {
    const { topK = 10, minSimilarity = 0.5 } = options ?? {};
    const candidates: VectorSearchResult[] = [];

    for (const vec of this.hotCache.values()) {
      const sim = this.cosineSimilarity(queryVector, vec.vector);
      if (sim >= minSimilarity) {
        candidates.push({ id: vec.id, similarity: sim, score: sim, vector: vec.vector });
      }
    }

    for (const vec of this.warmCache.values()) {
      const sim = this.cosineSimilarity(queryVector, vec.vector);
      if (sim >= minSimilarity) {
        candidates.push({ id: vec.id, similarity: sim, score: sim, vector: vec.vector });
      }
    }

    if (candidates.length < topK * 2) {
      const diskResults = this.searchFromDisk(queryVector, topK * 3, minSimilarity);
      for (const r of diskResults) {
        const stored = this.get(r.id);
        if (stored) {
          candidates.push({ ...r, score: r.similarity, vector: stored.vector });
        }
      }
    }

    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates.slice(0, topK);
  }

  private putToCache(vec: StoredVector): void {
    if (this.hotCache.size < this.config.hotCacheSize) {
      this.hotCache.set(vec.id, vec);
      vec.tier = "hot";
    } else if (this.warmCache.size < this.config.warmCacheSize) {
      this.evictFromHotCache();
      this.hotCache.set(vec.id, vec);
      vec.tier = "hot";
    } else {
      this.evictFromWarmCache();
      this.warmCache.set(vec.id, vec);
      vec.tier = "warm";
    }
  }

  private promoteToHot(vec: StoredVector): void {
    this.warmCache.delete(vec.id);
    if (this.hotCache.size >= this.config.hotCacheSize) {
      this.evictFromHotCache();
    }
    this.hotCache.set(vec.id, vec);
    vec.tier = "hot";
  }

  private evictFromHotCache(): void {
    let oldest: { id: string; time: number } | null = null;
    for (const [id, vec] of this.hotCache) {
      if (!oldest || vec.lastAccessed < oldest.time) {
        oldest = { id, time: vec.lastAccessed };
      }
    }

    if (oldest) {
      const vec = this.hotCache.get(oldest.id)!;
      this.hotCache.delete(oldest.id);
      if (this.warmCache.size >= this.config.warmCacheSize) {
        this.evictFromWarmCache();
      }
      vec.tier = "warm";
      this.warmCache.set(oldest.id, vec);
      this.updateTierInDB(oldest.id, "warm");
    }
  }

  private evictFromWarmCache(): void {
    let oldest: { id: string; time: number } | null = null;
    for (const [id, vec] of this.warmCache) {
      if (!oldest || vec.lastAccessed < oldest.time) {
        oldest = { id, time: vec.lastAccessed };
      }
    }
    if (oldest) {
      this.warmCache.delete(oldest.id);
      this.updateTierInDB(oldest.id, "cold");
    }
  }

  private updateTierInDB(id: string, tier: string): void {
    const stmt = this.db.prepare(`UPDATE vectors SET tier = ? WHERE id = ?`);
    stmt.run(tier, id);
  }

  private loadFromDisk(id: string): StoredVector | null {
    const row = this.db.prepare(`SELECT * FROM vectors WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;

    this.stats.diskReads++;

    const vector = this.decompressVector(
      row.vector_data as Buffer,
      row.compression_type as string,
      row.min_val as number | undefined,
      row.max_val as number | undefined,
    );

    // 加载 metadata
    const metaRow = this.db.prepare(`SELECT * FROM vector_metadata WHERE vector_id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;

    const metadata: Record<string, unknown> | undefined = metaRow
      ? {
          content: metaRow.content,
          contentType: metaRow.content_type,
          agentId: metaRow.agent_id,
          tags: metaRow.tags ? JSON.parse(metaRow.tags as string) : [],
        }
      : undefined;

    this.db
      .prepare(`UPDATE vectors SET access_count = access_count + 1, last_accessed = ? WHERE id = ?`)
      .run(Date.now(), id);

    return {
      id: row.id as string,
      vector,
      accessCount: (row.access_count as number) + 1,
      lastAccessed: Date.now(),
      createdAt: row.created_at as number,
      importance: row.importance as number,
      tier: "cold",
      metadata,
    };
  }

  private searchFromDisk(
    queryVector: Vector,
    topK: number,
    minSimilarity: number,
  ): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];
    
    // 分页查询，避免一次性加载所有冷数据
    const BATCH_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    let scannedCount = 0;
    const MAX_SCAN = 10000; // 最多扫描 10000 条
    
    while (hasMore && scannedCount < MAX_SCAN) {
      const rows = this.db
        .prepare(
          `SELECT id, vector_data, compression_type, min_val, max_val FROM vectors WHERE tier = 'cold' LIMIT ? OFFSET ?`,
        )
        .all(BATCH_SIZE, offset) as Record<string, unknown>[];
      
      if (rows.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const row of rows) {
        scannedCount++;
        
        const vector = this.decompressVector(
          row.vector_data as Buffer,
          row.compression_type as string,
          row.min_val as number | undefined,
          row.max_val as number | undefined,
        );
        const similarity = this.cosineSimilarity(queryVector, vector);
        if (similarity >= minSimilarity) {
          results.push({ id: row.id as string, similarity, score: similarity, vector });
        }
      }
      
      offset += BATCH_SIZE;
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  private compressVector(vector: Vector): {
    data: Buffer;
    compressionType: string;
    min?: number;
    max?: number;
  } {
    switch (this.config.compression) {
      case "float16":
        return { data: compressVectorToFloat16(vector), compressionType: "float16" };
      case "int8":
        const quantized = quantizeVector(vector);
        return {
          data: quantized.data,
          compressionType: "int8",
          min: quantized.min,
          max: quantized.max,
        };
      case "none":
      default:
        const buffer = Buffer.alloc(vector.length * 4);
        for (let i = 0; i < vector.length; i++) {
          buffer.writeFloatLE(vector[i], i * 4);
        }
        return { data: buffer, compressionType: "none" };
    }
  }

  private decompressVector(
    data: Buffer,
    compressionType: string,
    min?: number,
    max?: number,
  ): Vector {
    switch (compressionType) {
      case "float16":
        return decompressVectorFromFloat16(data, this.vectorDim);
      case "int8":
        if (min === undefined || max === undefined) throw new Error("Missing min/max for int8");
        return dequantizeVector(data, min, max);
      case "none":
      default:
        const vector: Vector = new Array(this.vectorDim);
        for (let i = 0; i < this.vectorDim; i++) {
          vector[i] = data.readFloatLE(i * 4);
        }
        return vector;
    }
  }

  private cosineSimilarity(a: Vector, b: Vector): number {
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

  getStats(): {
    hotCacheSize: number;
    warmCacheSize: number;
    totalVectors: number;
    cacheHitRate: number;
    diskReads: number;
    diskWrites: number;
    /** 测试兼容 */
    count: number;
    /** 测试兼容 */
    dimensions: number;
  } {
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM vectors`).get() as {
      count: number;
    };
    const totalCache = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      hotCacheSize: this.hotCache.size,
      warmCacheSize: this.warmCache.size,
      totalVectors: total.count,
      cacheHitRate: totalCache > 0 ? this.stats.cacheHits / totalCache : 0,
      diskReads: this.stats.diskReads,
      diskWrites: this.stats.diskWrites,
      count: total.count,
      dimensions: this.vectorDim,
    };
  }

  close(): void {
    this.db.close();
    this.hotCache.clear();
    this.warmCache.clear();
  }

  // ========================================================================
  // 测试兼容方法
  // ========================================================================

  /**
   * 添加向量 (别名，测试兼容)
   */
  add(id: string, vector: Vector, metadata?: Record<string, unknown> | unknown): void {
    const meta = (metadata || {}) as Record<string, unknown>;
    this.store(id, vector, {
      content: meta.content as string,
      contentType: meta.contentType as string,
      importance: meta.importance as number,
      agentId: meta.agentId as string,
      tags: meta.tags as string[],
    });
  }

  /**
   * 获取向量数量
   */
  count(): number {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM vectors`).get() as {
      count: number;
    };
    return result.count;
  }

  /**
   * 获取所有存储的向量ID列表
   */
  getAllIds(): string[] {
    const rows = this.db.prepare(`SELECT id FROM vectors`).all() as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /**
   * 删除向量
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM vectors WHERE id = ?`);
    const result = stmt.run(id);
    this.hotCache.delete(id);
    this.warmCache.delete(id);
    return result.changes > 0;
  }

  /**
   * 批量添加
   */
  addBatch(
    items: Array<{
      id: string;
      vector: Vector;
      metadata?: Record<string, unknown> | unknown;
    }>,
  ): number {
    for (const item of items) {
      this.add(item.id, item.vector, item.metadata);
    }
    return items.length;
  }

  /**
   * 批量获取
   */
  getBatch(ids: string[]): Array<StoredVector | null> {
    return ids.map((id) => this.get(id));
  }

  /**
   * 批量删除
   */
  deleteBatch(ids: string[]): number {
    let deleted = 0;
    for (const id of ids) {
      if (this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * 计算余弦相似度 (公开)
   */
  calculateSimilarity(a: Vector, b: Vector): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    return this.cosineSimilarity(a, b);
  }

  /**
   * 清空所有向量
   */
  clear(): void {
    this.db.prepare(`DELETE FROM vectors`).run();
    this.hotCache.clear();
    this.warmCache.clear();
  }
}

// ============================================================================
// 实例管理 - 按 baseDir + vectorDim 隔离（支持多 Agent）
// ============================================================================

const storageInstances = new Map<string, VectorStorage>();
const storageRefCounts = new Map<string, number>();

function buildStorageKey(config: Partial<VectorStorageConfig>): string {
  const baseDir = config.baseDir || path.join(homedir(), ".nsemclaw", "nsem2", "vectors");
  const vectorDim = config.vectorDim || 384;
  return `${baseDir}:${vectorDim}`;
}

export function createVectorStorage(config?: Partial<VectorStorageConfig>): VectorStorage {
  return new VectorStorage(config);
}

/**
 * 获取 VectorStorage 实例 - 按 baseDir + vectorDim 隔离
 * 相同配置的调用返回同一实例（单例模式）
 * 不同 baseDir（不同 Agent）返回不同实例（隔离）
 */
export function getVectorStorage(config?: Partial<VectorStorageConfig>): VectorStorage {
  const key = buildStorageKey(config || {});
  
  let instance = storageInstances.get(key);
  if (!instance) {
    instance = new VectorStorage(config);
    storageInstances.set(key, instance);
    storageRefCounts.set(key, 0);
  }
  
  // 增加引用计数
  storageRefCounts.set(key, (storageRefCounts.get(key) || 0) + 1);
  
  return instance;
}

/**
 * 释放 VectorStorage 实例引用
 * 当引用计数归零时关闭并清理
 */
export function releaseVectorStorage(config?: Partial<VectorStorageConfig>): void {
  const key = buildStorageKey(config || {});
  const currentCount = storageRefCounts.get(key) || 0;
  
  if (currentCount <= 1) {
    // 最后一个引用，关闭并清理
    const instance = storageInstances.get(key);
    if (instance) {
      instance.close();
      storageInstances.delete(key);
    }
    storageRefCounts.delete(key);
  } else {
    // 减少引用计数
    storageRefCounts.set(key, currentCount - 1);
  }
}

/**
 * 重置所有 VectorStorage 实例（用于测试）
 */
export function resetVectorStorage(): void {
  for (const [key, instance] of storageInstances) {
    try {
      instance.close();
    } catch (err) {
      log.warn(`关闭 VectorStorage 失败 (${key}):`, err as Record<string, unknown>);
    }
  }
  storageInstances.clear();
  storageRefCounts.clear();
}

/**
 * 获取当前活跃的存储实例数量（用于调试/监控）
 */
export function getVectorStorageStats(): { instances: number; refs: Record<string, number> } {
  return {
    instances: storageInstances.size,
    refs: Object.fromEntries(storageRefCounts),
  };
}
