/**
 * NSEM 2.0 核心 - 与 Nsemclaw 深度集成的进化记忆
 *
 * 相对于旧版 NSEM 的改进:
 * 1. 使用 SmartEmbeddingEngine 复用 Nsemclaw 本地模型
 * 2. 渐进加载，资源自适应
 * 3. 与 Soul 系统深度集成
 * 4. LRU缓存淘汰机制
 * 5. 内存使用监控
 * 6. 并发锁保护
 * 7. 指数退避重试
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ResolvedMemorySearchConfig } from "../../../agents/memory-search.js";
import type { NsemclawConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import {
  getVectorStorage,
  releaseVectorStorage,
  type VectorStorage,
  type VectorSearchResult,
} from "../../storage/VectorStorage.js";
import type {
  MemAtom,
  LivingEdge,
  MemoryField,
  MemoryQuery,
  ActivatedMemory,
  NSEM2Config,
  ContentType,
  QueryStrategy,
  Vector,
} from "../../types/index.js";
import {
  LRUCache,
  cosineSimilarity,
  embeddingDistance,
  hash,
  generateId,
  getMemoryStats,
  isMemoryOverThreshold,
  formatBytes,
  clamp,
  exponentialDecay,
} from "../../utils/common.js";
import {
  createSmartEmbeddingEngine,
  SmartEmbeddingEngine,
} from "../perception/SmartEmbeddingEngine.js";

// Get available system memory for dynamic scaling
function getAvailableSystemMemory(): number {
  try {
    return require("node:os").totalmem() / (1024 * 1024 * 1024); // GB
  } catch {
    return 16; // Default 16GB
  }
}

const log = createSubsystemLogger("nsem2");

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 动态计算最大原子数
 * 基于系统内存自适应调整
 */
function calculateMaxAtoms(availableMemoryGb: number): number {
  // 预留 20GB 给系统和其他应用
  const usableMemory = Math.max(4, availableMemoryGb - 20);
  // 每个原子约占用 2KB (向量 + 元数据)
  // 目标使用 70% 的可用内存
  return Math.floor((usableMemory * 0.7 * 1024 * 1024 * 1024) / (2 * 1024));
}

/** 默认配置 */
const DEFAULT_CONFIG: NSEM2Config = {
  rootDir: join(homedir(), ".nsemclaw", "nsem2"),
  agentId: "default",
  resourceMode: "balanced",
  evolutionInterval: 15 * 60 * 1000, // 15分钟
  maxAtoms: 50000, // 将被动态覆盖
  compressionTrigger: {
    atomCount: 1000,
    ageDays: 7,
    strengthThreshold: 0.3,
  },
};

/** 内存警告阈值 */
const MEMORY_WARNING_THRESHOLD = 80;

/** 内存危险阈值 */
const MEMORY_CRITICAL_THRESHOLD = 90;

/** LRU 缓存大小比例 */
const LRU_CACHE_RATIO = 0.2;

/** 最大进化重试次数 */
const MAX_EVOLVE_RETRIES = 3;

/** 进化重试延迟（毫秒） */
const EVOLVE_RETRY_DELAY = 60000;

/** 衰减率映射 */
const DECAY_RATES: Record<ContentType, number> = {
  fact: 0.001,
  experience: 0.005,
  insight: 0.002,
  pattern: 0.0005,
  narrative: 0.003,
  intuition: 0.0001,
};

// ============================================================================
// 内存监控接口
// ============================================================================

/** 内存使用报告 */
interface MemoryReport {
  atoms: number;
  edges: number;
  fields: number;
  heapUsed: string;
  heapTotal: string;
  percentage: number;
  isWarning: boolean;
  isCritical: boolean;
}

/** 激活映射项 */
interface ActivationMapItem {
  level: number;
  depth: number;
  path: string[];
}

/** 候选项 */
interface Candidate {
  text: string;
  score: number;
}

// ============================================================================
// NSEM 2.0 核心
// ============================================================================

export class NSEM2Core {
  private config: NSEM2Config;
  private embedding: SmartEmbeddingEngine;
  private vectorStorage: VectorStorage;

  // 存储 - 使用 LRU 缓存实现内存上限保护
  // 仅存储热数据，冷数据从 VectorStorage 动态加载
  private atoms: LRUCache<string, MemAtom>;
  private edges: Map<string, LivingEdge> = new Map();
  private fields: Map<string, MemoryField> = new Map();

  // 运行时状态
  private isRunning = false;
  private evolveTimer?: NodeJS.Timeout;
  private evolveRetryCount = 0;

  // 并发控制
  private operationLock: Promise<unknown> = Promise.resolve();
  private isOperating = false;

  // 内存监控
  private lastMemoryCheck = 0;
  private memoryCheckInterval = 60000; // 1分钟
  private memoryCheckTimer?: NodeJS.Timeout;
  private memoryMonitorTimer?: NodeJS.Timeout;

  // 向量维度 (根据存储自动检测，默认 384)
  private vectorDim: number = 384;

  // 存储统计
  private stats = {
    loadedFromDisk: 0,
    savedToDisk: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(embedding: SmartEmbeddingEngine, config: Partial<NSEM2Config> = {}) {
    this.embedding = embedding;

    // 动态调整 maxAtoms 基于系统内存
    const availableMemory = getAvailableSystemMemory();
    const dynamicMaxAtoms = calculateMaxAtoms(availableMemory);

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      maxAtoms: config.maxAtoms ?? dynamicMaxAtoms,
    };

    // 检测存储中向量的维度（如果数据库已存在）
    this.vectorDim = this.detectStoredVectorDimension();

    // 初始化 VectorStorage (持久化存储)
    this.vectorStorage = getVectorStorage({
      baseDir: join(this.config.rootDir, "vectors"),
      dbName: "vectors.db",
      vectorDim: this.vectorDim,
      enableWAL: true,
      compression: "float16", // 节省 50% 存储空间
      hotCacheSize: Math.min(100000, Math.floor(this.config.maxAtoms * 0.2)),
      warmCacheSize: Math.min(500000, Math.floor(this.config.maxAtoms * 0.5)),
    });

    // 初始化 LRU 缓存 (热数据缓存)
    const lruSize = Math.max(1000, Math.floor(this.config.maxAtoms * LRU_CACHE_RATIO));
    this.atoms = new LRUCache<string, MemAtom>(lruSize);

    this.ensureDirectories();

    log.info(`🧠 NSEM 2.0 初始化完成`);
    log.info(`   系统内存: ${availableMemory.toFixed(1)} GB`);
    log.info(`   动态最大原子数: ${this.config.maxAtoms.toLocaleString()}`);
    log.info(`   LRU缓存大小: ${lruSize.toLocaleString()}`);
    log.info(`   向量存储: ${this.config.rootDir}/vectors`);
  }

  /**
   * 创建 NSEM2 核心 (工厂函数)
   */
  static async create(
    cfg: NsemclawConfig,
    agentId: string,
    memoryConfig: ResolvedMemorySearchConfig,
    nsemConfig?: Partial<NSEM2Config> & { rerankerModel?: string; expansionModel?: string },
  ): Promise<NSEM2Core> {
    // 创建智能嵌入引擎（支持自动下载模型和 GPU）
    const embedding = await createSmartEmbeddingEngine(
      cfg,
      agentId,
      memoryConfig,
      nsemConfig?.resourceMode,
      {
        autoDownloadModels: true,
        rerankerModel: nsemConfig?.rerankerModel,
        expansionModel: nsemConfig?.expansionModel,
      },
    );

    return new NSEM2Core(embedding, {
      ...nsemConfig,
      agentId,
    });
  }

  // ========================================================================
  // 私有方法 - 向量维度检测
  // ========================================================================

  /**
   * 检测存储中向量的维度
   * 直接查询数据库，避免 VectorStorage 的解压截断
   */
  private detectStoredVectorDimension(): number {
    try {
      const { DatabaseSync } = require("node:sqlite");
      const dbPath = join(this.config.rootDir, "vectors", "vectors.db");
      
      // 检查数据库文件是否存在
      if (!existsSync(dbPath)) {
        return 384; // 默认维度
      }

      const db = new DatabaseSync(dbPath, { readOnly: true });
      
      // 查询第一条记录的维度
      const row = db.prepare("SELECT vector_dim FROM vectors LIMIT 1").get() as 
        | { vector_dim: number }
        | undefined;
      
      db.close();

      if (row && row.vector_dim > 0) {
        log.info(`📐 检测到存储向量维度: ${row.vector_dim}`);
        return row.vector_dim;
      }
    } catch (err) {
      // 数据库不存在或查询失败，使用默认维度
      log.debug(`无法检测存储维度: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    return 384; // 默认维度
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // 从磁盘恢复数据
    await this.hydrateFromStorage();
    
    log.info(`🧠 NSEM 2.0 启动 [${this.config.agentId}]`);
    log.info(`   模式: ${this.config.resourceMode}`);
    log.info(`   原子: ${this.atoms.size()}`);
    log.info(`   边: ${this.edges.size}`);
    log.info(`   场: ${this.fields.size}`);

    // 启动自动进化
    if (this.config.evolutionInterval > 0) {
      this.scheduleNextEvolution();
    }

    // 启动内存监控
    this.startMemoryMonitoring();
  }

  /**
   * 从存储恢复数据（hydrate）
   */
  private async hydrateFromStorage(): Promise<void> {
    try {
      const allIds = this.vectorStorage.getAllIds();
      if (allIds.length === 0) {
        log.debug("没有存储的向量需要恢复");
        return;
      }

      log.info(`🔄 从存储恢复 ${allIds.length} 个向量...`);
      let restoredCount = 0;

      for (const id of allIds) {
        const atom = this.loadAtomFromDisk(id);
        if (atom) {
          this.atoms.set(id, atom);
          restoredCount++;
        }
      }

      log.info(`✅ 已恢复 ${restoredCount} 个原子到内存`);
    } catch (err) {
      log.warn(`恢复存储数据失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.evolveTimer) {
      clearTimeout(this.evolveTimer);
      this.evolveTimer = undefined;
    }

    // 清理内存监控定时器
    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
      this.memoryMonitorTimer = undefined;
    }

    // 清理嵌入引擎资源
    await this.embedding.cleanup?.();

    // 清理缓存
    this.atoms.clear();
    this.edges.clear();
    this.fields.clear();

    // 释放向量存储引用（使用引用计数管理）
    releaseVectorStorage({
      baseDir: join(this.config.rootDir, "vectors"),
      dbName: "vectors.db",
      vectorDim: this.vectorDim,
    });

    log.info("🛑 NSEM 2.0 已停止");
    log.info(`   持久化: ${this.stats.savedToDisk} 向量`);
  }

  // ========================================================================
  // 内存管理
  // ========================================================================

  /**
   * 启动内存监控
   */
  private startMemoryMonitoring(): void {
    const checkMemory = (): void => {
      if (!this.isRunning) return;

      const report = this.getMemoryReport();

      if (report.isCritical) {
        log.warn(`⚠️ 内存使用危险: ${report.percentage.toFixed(1)}%`);
        this.handleMemoryPressure();
      } else if (report.isWarning) {
        log.warn(`⚠️ 内存使用警告: ${report.percentage.toFixed(1)}%`);
      }

      // 检查原子数是否超过上限
      if (this.atoms.size() > this.config.maxAtoms) {
        log.warn(`⚠️ 原子数超过上限: ${this.atoms.size()} > ${this.config.maxAtoms}`);
        this.enforceAtomLimit();
      }

      // 定期报告
      const now = Date.now();
      if (now - this.lastMemoryCheck > this.memoryCheckInterval * 5) {
        this.lastMemoryCheck = now;
        log.info(
          `📊 内存报告: ${report.heapUsed} / ${report.heapTotal} (${report.percentage.toFixed(1)}%)`,
        );
      }
    };

    // 每分钟检查一次
    this.memoryMonitorTimer = setInterval(checkMemory, this.memoryCheckInterval);
  }

  /**
   * 获取内存使用报告
   */
  getMemoryReport(): MemoryReport {
    const stats = getMemoryStats();
    return {
      atoms: this.atoms.size(),
      edges: this.edges.size,
      fields: this.fields.size,
      heapUsed: formatBytes(stats.used),
      heapTotal: formatBytes(stats.total),
      percentage: stats.percentage,
      isWarning: stats.percentage > MEMORY_WARNING_THRESHOLD,
      isCritical: stats.percentage > MEMORY_CRITICAL_THRESHOLD,
    };
  }

  /**
   * 处理内存压力
   */
  private handleMemoryPressure(): void {
    // 1. 强制清理低强度记忆
    this.pruneForgotten();

    // 2. 合并重叠的场
    this.mergeFields();

    // 3. 清理孤立边
    this.cleanupOrphanEdges();

    log.info(`🧹 内存压力处理完成: ${this.atoms.size()} 原子, ${this.edges.size} 边`);
  }

  /**
   * 强制执行原子数限制
   */
  private enforceAtomLimit(): void {
    const targetSize = Math.floor(this.config.maxAtoms * 0.9); // 保留10%缓冲
    const currentSize = this.atoms.size();

    if (currentSize <= targetSize) return;

    // LRU 缓存会自动淘汰，但我们也可以主动清理
    const toRemove = currentSize - targetSize;
    log.info(`🗑️ 强制清理 ${toRemove} 个原子`);

    // 获取最久未使用的键并删除
    const keys = this.atoms.keys();
    for (let i = 0; i < toRemove && i < keys.length; i++) {
      const keyIndex = keys.length - 1 - i;
      const key = keys[keyIndex];
      if (key !== undefined) {
        this._deleteAtomInternal(key);
      }
    }
  }

  /**
   * 删除原子及其关联边
   */
  private _deleteAtomInternal(id: string): void {
    this.atoms.delete(id);

    // 清理相关边
    for (const [edgeId, edge] of this.edges) {
      if (edge.from === id || edge.to === id) {
        this.edges.delete(edgeId);
      }
    }

    // 从场中移除
    for (const field of this.fields.values()) {
      field.atoms.delete(id);
    }
  }

  /**
   * 清理孤立边
   */
  private cleanupOrphanEdges(): void {
    const atomIds = new Set(this.atoms.keys());

    for (const [edgeId, edge] of this.edges) {
      if (!atomIds.has(edge.from) || !atomIds.has(edge.to)) {
        this.edges.delete(edgeId);
      }
    }
  }

  // ========================================================================
  // 内部管理
  // ========================================================================

  /**
   * 调度下一次进化 - 带错误恢复
   */
  private scheduleNextEvolution(): void {
    if (!this.isRunning) return;

    this.evolveTimer = setTimeout(async () => {
      try {
        await this.evolve();
        this.evolveRetryCount = 0; // 成功后重置重试计数
      } catch (err) {
        this.evolveRetryCount++;
        log.error(`自动进化失败 (第${this.evolveRetryCount}次)`, err as Record<string, unknown>);

        if (this.evolveRetryCount >= MAX_EVOLVE_RETRIES) {
          log.error("自动进化连续失败多次，停止自动调度，建议手动检查");
          return; // 不再调度
        }

        // 指数退避重试
        const delay = EVOLVE_RETRY_DELAY * Math.pow(2, this.evolveRetryCount - 1);
        log.info(`${delay / 1000}秒后重试进化`);
      }

      // 调度下一次
      this.scheduleNextEvolution();
    }, this.config.evolutionInterval);
  }

  /**
   * 带锁的操作 - 防止并发修改
   */
  private async withLock<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const acquireLock = async (): Promise<T> => {
      if (this.isOperating) {
        throw new Error(`操作冲突: 已有操作在进行中 (${operation})`);
      }
      this.isOperating = true;
      try {
        return await fn();
      } finally {
        this.isOperating = false;
      }
    };

    // 等待前一个锁释放，但隔离错误
    const lockPromise = this.operationLock
      .catch(() => {
        /* 忽略前一个锁的错误 */
      })
      .then(() => acquireLock());

    this.operationLock = lockPromise;
    return lockPromise as Promise<T>;
  }

  // ========================================================================
  // 核心操作
  // ========================================================================

  /**
   * 摄入记忆 - 线程安全
   */
  async ingest(
    content: string,
    options: {
      type?: ContentType;
      source?: string;
      agent?: string;
      workspace?: string;
      tags?: string[];
      strength?: number;
    } = {},
  ): Promise<MemAtom> {
    return this.withLock("ingest", async () => {
      return this._ingestUnsafe(content, options);
    });
  }

  /**
   * 摄入记忆 - 内部实现 (无锁，需外部确保线程安全)
   */
  private async _ingestUnsafe(
    content: string,
    options: {
      type?: ContentType;
      source?: string;
      agent?: string;
      workspace?: string;
      tags?: string[];
      strength?: number;
    } = {},
  ): Promise<MemAtom> {
    const id = generateId("atom", content);

    // 检查重复
    const existingAtom = this.atoms.get(id);
    if (existingAtom) {
      return this._reinforceUnsafe(id);
    }

    // 检查内存上限
    if (this.atoms.size() >= this.config.maxAtoms) {
      log.warn(`⚠️ 达到原子数上限，触发 LRU 淘汰`);
      // LRU 缓存会自动处理，但我们也可以主动清理
      this.enforceAtomLimit();
    }

    // 生成嵌入
    let embedding = await this.embedding.embed(content);
    
    // 维度适配：如果嵌入维度与存储维度不匹配，进行调整
    if (embedding.length !== this.vectorDim) {
      if (embedding.length > this.vectorDim) {
        // 截断多余的维度
        embedding = embedding.slice(0, this.vectorDim);
      } else {
        // 用零填充不足的维度
        embedding = [...embedding, ...new Array(this.vectorDim - embedding.length).fill(0)];
      }
    }

    const now = Date.now();
    const contentType = options.type ?? "fact";
    const strength = clamp(options.strength ?? 0.5, 0, 1);

    const atom: MemAtom = {
      id,
      contentHash: hash(content),
      content,
      contentType,
      embedding,
      temporal: {
        created: now,
        modified: now,
        lastAccessed: now,
        accessCount: 1,
        decayRate: this.calculateDecayRate(contentType),
      },
      spatial: {
        sourceFile: options.source,
        workspace: options.workspace,
        agent: options.agent ?? this.config.agentId,
      },
      strength: {
        current: strength,
        base: strength,
        reinforcement: 0,
        emotional: 0,
      },
      generation: 1,
      meta: {
        tags: options.tags ?? [],
        confidence: 1.0,
        source: options.agent ? "ai" : "user",
      },
    };

    this.atoms.set(id, atom);

    // 持久化向量到磁盘
    this.persistAtom(atom);

    // 建立关系
    await this.establishRelations(atom);

    // 更新场
    this.updateFields(atom);

    log.debug(`✨ 新记忆: ${id.slice(0, 8)} (${atom.contentType})`);

    return atom;
  }

  /**
   * 持久化原子向量到磁盘
   */
  private persistAtom(atom: MemAtom): void {
    try {
      this.vectorStorage.store(atom.id, atom.embedding, {
        content: atom.content.slice(0, 500), // 限制元数据大小
        contentType: atom.contentType,
        importance: atom.strength.current,
        agentId: atom.spatial.agent,
        tags: atom.meta.tags,
      });
      this.stats.savedToDisk++;
    } catch (err) {
      log.error(`向量持久化失败: ${atom.id.slice(0, 8)}`, err as Record<string, unknown>);
    }
  }

  /**
   * 从磁盘加载原子向量
   */
  private loadAtomFromDisk(id: string): MemAtom | null {
    try {
      const stored = this.vectorStorage.get(id);
      if (!stored) return null;

      this.stats.loadedFromDisk++;

      // 从 metadata 恢复内容
      const metadata = stored.metadata ?? {};
      const content = (metadata.content as string) || "";
      const contentType = (metadata.contentType as MemAtom["contentType"]) || "fact";
      const tags = (metadata.tags as string[]) || [];
      const agentId = (metadata.agentId as string) || this.config.agentId;

      // 创建原子对象
      const atom: MemAtom = {
        id: stored.id,
        contentHash: "",
        content: content,
        contentType: contentType,
        embedding: stored.vector,
        temporal: {
          created: stored.createdAt,
          modified: stored.lastAccessed,
          lastAccessed: stored.lastAccessed,
          accessCount: stored.accessCount,
          decayRate: 0.001,
        },
        spatial: {
          sourceFile: undefined,
          workspace: undefined,
          agent: agentId,
        },
        strength: {
          current: stored.importance,
          base: stored.importance,
          reinforcement: 0,
          emotional: 0,
        },
        generation: 1,
        meta: {
          tags: tags,
          confidence: 1.0,
          source: "derived", // 从磁盘恢复的记忆标记为 derived
        },
      };

      return atom;
    } catch (err) {
      log.error(`向量加载失败: ${id.slice(0, 8)}`, err as Record<string, unknown>);
      return null;
    }
  }

  /**
   * 进化 - 线程安全
   */
  async evolve(): Promise<void> {
    return this.withLock("evolve", async () => {
      return this._evolveUnsafe();
    });
  }

  /**
   * 激活记忆 - 核心查询
   */
  async activate(query: MemoryQuery): Promise<ActivatedMemory> {
    // 1. 扩展查询
    const expanded = await this.embedding.expandQuery(query.intent);

    // 2. 生成嵌入
    const embedding = await this.embedding.embed(expanded.original);

    // 3. 找到相似原子
    const seeds = await this.findSimilar(embedding, 20);

    // 4. 激活传播
    const activationMap = new Map<string, ActivationMapItem>();

    for (const { atom, similarity } of seeds) {
      if (similarity >= 0.3) {
        activationMap.set(atom.id, {
          level: similarity,
          depth: 0,
          path: [atom.id],
        });
      }
    }

    this.spreadActivation(activationMap, query.strategy);

    // 5. 组装结果
    const atoms = this.assembleAtoms(activationMap, query.constraints?.maxResults ?? 10);

    // 6. 重排优化
    if (atoms.length > 0) {
      const candidates: Candidate[] = atoms.map((a) => ({
        text: a.atom.content,
        score: a.relevance,
      }));

      const reranked = await this.embedding.rerank(query.intent, candidates);

      // 更新相关度分数
      for (let i = 0; i < atoms.length && i < reranked.length; i++) {
        const rerankedItem = reranked[i];
        const atomItem = atoms[i];
        if (rerankedItem && atomItem && rerankedItem.rerankScore !== undefined) {
          atomItem.relevance = rerankedItem.rerankScore;
        }
      }

      // 按重排后分数排序
      atoms.sort((a, b) => b.relevance - a.relevance);
    }

    // 7. 发现涌现关系
    const emergentRelations = this.discoverEmergentRelations(activationMap);

    // 8. 激活场
    const fields = this.activateFields(activationMap);

    // 9. 更新访问统计
    this.updateAccessStats(atoms.map((a) => a.atom.id));

    return {
      atoms,
      fields,
      emergentRelations,
      semantic: this.computeSemantic(atoms),
    };
  }

  /**
   * 进化 - 内部实现 (无锁，需外部确保线程安全)
   * 
   * 注意：进化操作可能耗时较长（O(n²) 场合并），
   * 因此使用分片执行策略，定期释放锁以允许其他操作。
   */
  private async _evolveUnsafe(): Promise<void> {
    log.info("🧬 记忆进化开始");
    const beforeAtoms = this.atoms.size();
    const startTime = Date.now();

    // 阶段 1: 衰减 - O(n)
    this.decayMemories();

    // 阶段 2: 清理 - O(n)
    this.pruneForgotten();

    // 阶段 3: 合并场 - O(n²)，最耗时
    // 如果场数量过多，分批处理
    if (this.fields.size > 100) {
      await this.mergeFieldsChunked();
    } else {
      this.mergeFields();
    }

    // 阶段 4: 强化连接 - O(e)
    this.reinforceConnections();

    const afterAtoms = this.atoms.size();
    const duration = Date.now() - startTime;

    log.info(`✅ 进化完成: ${beforeAtoms} → ${afterAtoms} 原子 (${duration}ms)`);
  }

  /**
   * 分批合并场，避免长时间阻塞
   * 每次处理最多 50 个场，然后让出事件循环
   */
  private async mergeFieldsChunked(): Promise<void> {
    const CHUNK_SIZE = 50;
    const fields = Array.from(this.fields.values());
    const toDelete = new Set<string>();

    for (let i = 0; i < fields.length; i += CHUNK_SIZE) {
      const chunk = fields.slice(i, i + CHUNK_SIZE);
      
      // 处理当前批次
      for (let a = 0; a < chunk.length; a++) {
        for (let b = a + 1; b < chunk.length; b++) {
          const f1 = chunk[a];
          const f2 = chunk[b];

          if (!f1 || !f2 || toDelete.has(f1.id) || toDelete.has(f2.id)) continue;

          const intersection = new Set([...f1.atoms].filter((id) => f2.atoms.has(id)));
          const union = new Set([...f1.atoms, ...f2.atoms]);
          const overlap = intersection.size / union.size;

          if (overlap > 0.7) {
            for (const atomId of f2.atoms) {
              f1.atoms.add(atomId);
            }
            toDelete.add(f2.id);
          }
        }
      }

      // 让出事件循环，允许其他操作
      if (i + CHUNK_SIZE < fields.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    // 删除合并掉的场
    for (const id of toDelete) {
      this.fields.delete(id);
    }
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private async findSimilar(
    embedding: number[],
    topK: number = 10,
  ): Promise<Array<{ atom: MemAtom; similarity: number }>> {
    // 维度适配
    let normalizedEmbedding = embedding;
    if (embedding.length !== this.vectorDim) {
      if (embedding.length > this.vectorDim) {
        normalizedEmbedding = embedding.slice(0, this.vectorDim);
      } else {
        normalizedEmbedding = [...embedding, ...new Array(this.vectorDim - embedding.length).fill(0)];
      }
    }
    
    const results: Array<{ atom: MemAtom; similarity: number }> = [];
    const memoryIds = new Set<string>();

    // 1. 先从内存缓存中搜索 (热数据)
    for (const atom of this.atoms.values()) {
      if (atom.strength.current < 0.1) continue;

      const similarity = cosineSimilarity(normalizedEmbedding, atom.embedding);
      if (similarity > 0.2) {
        results.push({ atom, similarity });
        memoryIds.add(atom.id);
      }
    }

    this.stats.cacheHits += results.length;

    // 2. 如果缓存结果不足，从磁盘搜索 (冷数据)
    if (results.length < topK) {
      const diskResults = this.vectorStorage.search(normalizedEmbedding, {
        topK: topK * 2, // 获取更多候选
        minSimilarity: 0.2,
      });

      for (const result of diskResults) {
        // 跳过已在内存中的
        if (memoryIds.has(result.id)) continue;

        // 从磁盘加载原子
        const atom = this.loadAtomFromDisk(result.id);
        if (atom) {
          // 加载到内存缓存
          this.atoms.set(atom.id, atom);
          results.push({ atom, similarity: result.similarity });
          memoryIds.add(atom.id);
          this.stats.cacheMisses++;
        }
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  private spreadActivation(
    activationMap: Map<string, ActivationMapItem>,
    strategy?: QueryStrategy,
  ): void {
    const maxDepth = strategy === "exploratory" ? 3 : strategy === "associative" ? 4 : 2;
    const decayFactor = 0.7;

    for (let depth = 0; depth < maxDepth; depth++) {
      const currentLevel = Array.from(activationMap.entries()).filter(
        ([_, info]) => info.depth === depth,
      );

      for (const [atomId, info] of currentLevel) {
        for (const edge of this.edges.values()) {
          if (edge.from !== atomId && edge.to !== atomId) continue;

          const neighborId = edge.from === atomId ? edge.to : edge.from;
          const newLevel = info.level * edge.dynamicWeight.current * decayFactor;

          if (newLevel >= 0.3) {
            const existing = activationMap.get(neighborId);
            if (!existing || existing.level < newLevel) {
              activationMap.set(neighborId, {
                level: newLevel,
                depth: depth + 1,
                path: [...info.path, neighborId],
              });
            }
          }
        }
      }
    }
  }

  private assembleAtoms(
    activationMap: Map<string, ActivationMapItem>,
    maxResults: number,
  ): ActivatedMemory["atoms"] {
    const sorted = Array.from(activationMap.entries())
      .sort((a, b) => b[1].level - a[1].level)
      .slice(0, maxResults);

    const result: ActivatedMemory["atoms"] = [];
    for (const [id, info] of sorted) {
      // 使用 fallback 机制获取原子 (内存 -> 磁盘)
      const atom = this.getAtomWithFallback(id);
      if (!atom) {
        log.warn(`Atom not found during assembly: ${id}, skipping`);
        continue;
      }
      result.push({
        atom,
        activation: info.level,
        relevance: info.level * atom.strength.current,
        spreadDepth: info.depth,
        path: info.path,
      });
    }
    return result;
  }

  private discoverEmergentRelations(
    activationMap: Map<string, ActivationMapItem>,
  ): ActivatedMemory["emergentRelations"] {
    const relations: ActivatedMemory["emergentRelations"] = [];
    const atomIds = Array.from(activationMap.keys());

    for (let i = 0; i < atomIds.length; i++) {
      for (let j = i + 1; j < atomIds.length; j++) {
        const id1 = atomIds[i]!;
        const id2 = atomIds[j]!;

        // 检查是否已有直接连接
        const hasEdge = Array.from(this.edges.values()).some(
          (e) => (e.from === id1 && e.to === id2) || (e.from === id2 && e.to === id1),
        );

        if (!hasEdge) {
          const commonNeighbors = this.findCommonNeighbors(id1, id2);
          if (commonNeighbors.length > 0) {
            const info1 = activationMap.get(id1);
            const info2 = activationMap.get(id2);
            if (!info1 || !info2) continue;

            const strength =
              Math.min(info1.level, info2.level) * (1 - 1 / (commonNeighbors.length + 1));

            relations.push({
              from: id1,
              to: id2,
              via: commonNeighbors,
              strength,
              isNovel: true,
            });
          }
        }
      }
    }

    return relations.sort((a, b) => b.strength - a.strength).slice(0, 10);
  }

  private activateFields(activationMap: Map<string, ActivationMapItem>): ActivatedMemory["fields"] {
    const results: ActivatedMemory["fields"] = [];
    const activeAtoms = Array.from(activationMap.keys());

    for (const field of this.fields.values()) {
      const overlapCount = activeAtoms.filter((id) => field.atoms.has(id)).length;
      const overlap = overlapCount / Math.max(activeAtoms.length, field.atoms.size);

      if (overlap > 0.3) {
        results.push({ field, overlap });
        field.vitality = Math.min(1, field.vitality + 0.1);
      }
    }

    return results.sort((a, b) => b.overlap - a.overlap).slice(0, 5);
  }

  private computeSemantic(atoms: ActivatedMemory["atoms"]): ActivatedMemory["semantic"] {
    if (atoms.length === 0) {
      return { centroid: [], coherence: 0, coverage: 0 };
    }

    // 计算质心
    const firstAtom = atoms[0];
    if (!firstAtom) {
      return { centroid: [], coherence: 0, coverage: 0 };
    }
    const dim = firstAtom.atom.embedding.length;
    const centroid = new Array<number>(dim).fill(0);
    const embeddings: number[][] = [];

    for (const item of atoms) {
      embeddings.push(item.atom.embedding);
      for (let i = 0; i < dim; i++) {
        const embeddingValue = item.atom.embedding[i];
        if (embeddingValue !== undefined && centroid[i] !== undefined) {
          centroid[i] += embeddingValue;
        }
      }
    }

    for (let i = 0; i < dim; i++) {
      if (centroid[i] !== undefined) {
        centroid[i] /= atoms.length;
      }
    }

    // 计算一致性
    let coherenceSum = 0;
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        coherenceSum += cosineSimilarity(embeddings[i]!, embeddings[j]!);
      }
    }

    const coherence =
      embeddings.length > 1
        ? coherenceSum / ((embeddings.length * (embeddings.length - 1)) / 2)
        : 1;

    return {
      centroid,
      coherence,
      coverage: atoms.length / this.atoms.size(),
    };
  }

  private async establishRelations(newAtom: MemAtom): Promise<void> {
    const similar = await this.findSimilar(newAtom.embedding, 10);

    for (const { atom, similarity } of similar) {
      if (atom.id === newAtom.id) continue;

      const edgeId = `${atom.id}-${newAtom.id}`;
      const edge: LivingEdge = {
        id: edgeId,
        from: atom.id,
        to: newAtom.id,
        types: [
          {
            type: "similar",
            weight: similarity,
            confidence: similarity,
            learned: true,
          },
        ],
        dynamicWeight: {
          current: similarity,
          history: [{ timestamp: Date.now(), weight: similarity, trigger: "birth" }],
          trend: "stable",
        },
        activation: {
          lastSpread: 0,
          spreadCount: 0,
          decayFactor: 0.9,
        },
      };

      this.edges.set(edgeId, edge);
    }
  }

  private updateFields(atom: MemAtom): void {
    let bestField: MemoryField | null = null;
    let bestScore = -1;

    for (const field of this.fields.values()) {
      const dist = embeddingDistance(atom.embedding, field.centroid);
      const score = 1 - dist / field.radius;

      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestField = field;
      }
    }

    if (bestField) {
      bestField.atoms.add(atom.id);
      // 更新质心
      const dim = bestField.centroid.length;
      for (let i = 0; i < dim; i++) {
        bestField.centroid[i] = bestField.centroid[i]! * 0.9 + atom.embedding[i]! * 0.1;
      }
    } else {
      this.createField(atom);
    }
  }

  private createField(seedAtom: MemAtom): MemoryField {
    const id = `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 从内容生成场名
    const words = seedAtom.content
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    const name = words.join("-") || "unnamed-field";

    const field: MemoryField = {
      id,
      name,
      description: seedAtom.content.slice(0, 100),
      centroid: [...seedAtom.embedding],
      radius: 0.5,
      atoms: new Set([seedAtom.id]),
      vitality: 1,
      fieldRelations: [],
      evolution: {
        created: Date.now(),
        snapshots: [],
      },
    };

    this.fields.set(id, field);
    log.debug(`🌌 新记忆场: ${name}`);

    return field;
  }

  private decayMemories(): void {
    const now = Date.now();

    for (const atom of this.atoms.values()) {
      const age = now - atom.temporal.lastAccessed;
      const decayFactor = exponentialDecay(1, atom.temporal.decayRate, age / (24 * 60 * 60 * 1000));

      atom.strength.current =
        atom.strength.base * decayFactor + atom.strength.reinforcement * 0.1 * decayFactor;
      atom.strength.current = Math.min(1, atom.strength.current);
    }
  }

  private pruneForgotten(): void {
    const toRemove: string[] = [];

    for (const [id, atom] of this.atoms.entries()) {
      if (atom.strength.current < 0.05 && atom.temporal.accessCount < 5) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this._deleteAtomInternal(id);
    }
  }

  private mergeFields(): void {
    const fields = Array.from(this.fields.values());
    const toDelete = new Set<string>();

    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        const f1 = fields[i];
        const f2 = fields[j];

        if (!f1 || !f2 || toDelete.has(f1.id) || toDelete.has(f2.id)) continue;

        // 计算重叠
        const intersection = new Set([...f1.atoms].filter((id) => f2.atoms.has(id)));
        const union = new Set([...f1.atoms, ...f2.atoms]);
        const overlap = intersection.size / union.size;

        if (overlap > 0.7) {
          // 合并到f1
          for (const atomId of f2.atoms) {
            f1.atoms.add(atomId);
          }
          toDelete.add(f2.id);
        }
      }
    }

    // 删除合并掉的场
    for (const id of toDelete) {
      this.fields.delete(id);
    }
  }

  private reinforceConnections(): void {
    for (const edge of this.edges.values()) {
      // 使用 fallback 机制获取原子
      const fromAtom = this.getAtomWithFallback(edge.from);
      const toAtom = this.getAtomWithFallback(edge.to);

      if (!fromAtom || !toAtom) continue;

      // 高频共现强化
      if (fromAtom.temporal.accessCount > 5 && toAtom.temporal.accessCount > 5) {
        edge.dynamicWeight.current = Math.min(1, edge.dynamicWeight.current + 0.1);
      }
    }
  }

  private _reinforceUnsafe(atomId: string): MemAtom {
    // 使用 fallback 机制获取原子
    const atom = this.getAtomWithFallback(atomId);
    if (!atom) {
      throw new Error(`Atom not found: ${atomId}`);
    }

    atom.strength.reinforcement++;
    atom.strength.current = Math.min(1, atom.strength.base + atom.strength.reinforcement * 0.1);
    atom.temporal.lastAccessed = Date.now();
    atom.temporal.accessCount++;

    // 更新缓存位置
    this.atoms.set(atomId, atom);

    return atom;
  }

  private findCommonNeighbors(id1: string, id2: string): string[] {
    const neighbors1 = new Set(
      Array.from(this.edges.values())
        .filter((e) => e.from === id1 || e.to === id1)
        .map((e) => (e.from === id1 ? e.to : e.from)),
    );

    const neighbors2 = new Set(
      Array.from(this.edges.values())
        .filter((e) => e.from === id2 || e.to === id2)
        .map((e) => (e.from === id2 ? e.to : e.from)),
    );

    return Array.from(neighbors1).filter((n) => neighbors2.has(n));
  }

  private updateAccessStats(atomIds: string[]): void {
    const now = Date.now();
    for (const id of atomIds) {
      // 使用 fallback 机制获取原子
      const atom = this.getAtomWithFallback(id);
      if (atom) {
        atom.temporal.lastAccessed = now;
        atom.temporal.accessCount++;
        // 更新缓存位置
        this.atoms.set(id, atom);
      }
    }
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  private calculateDecayRate(type: ContentType): number {
    return DECAY_RATES[type] ?? 0.001;
  }

  private ensureDirectories(): void {
    const dirs = [this.config.rootDir, join(this.config.rootDir, "snapshots")];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  // ========================================================================
  // 访问器
  // ========================================================================

  /**
   * 获取原子缓存（只读访问）
   */
  getAtoms(): ReadonlyMap<string, MemAtom> {
    const map = new Map<string, MemAtom>();
    for (const [key, value] of this.atoms.entries()) {
      map.set(key, value);
    }
    return map;
  }

  /**
   * 获取边映射（只读访问）
   */
  getEdges(): ReadonlyMap<string, LivingEdge> {
    return this.edges;
  }

  /**
   * 获取场映射（只读访问）
   */
  getFields(): ReadonlyMap<string, MemoryField> {
    return this.fields;
  }

  /**
   * 获取配置（深拷贝）
   */
  getConfig(): NSEM2Config {
    return { ...this.config };
  }

  /**
   * 更新配置（测试兼容）
   */
  updateConfig(updates: Partial<NSEM2Config>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 获取原子（测试兼容）
   */
  async getAtom(id: string): Promise<MemAtom | null> {
    return this.atoms.get(id) ?? null;
  }

  /**
   * 删除原子（公开版本，测试兼容）
   */
  async deleteAtom(id: string): Promise<boolean> {
    if (!this.atoms.has(id)) {
      return false;
    }
    this.atoms.delete(id);

    // 清理相关边
    for (const [edgeId, edge] of this.edges) {
      if (edge.from === id || edge.to === id) {
        this.edges.delete(edgeId);
      }
    }

    // 从场中移除
    for (const field of this.fields.values()) {
      field.atoms.delete(id);
    }

    return true;
  }

  /**
   * 强化原子（公开版本，测试兼容）
   */
  async reinforceAtom(id: string): Promise<MemAtom | null> {
    const atom = this.atoms.get(id);
    if (!atom) return null;

    atom.strength.reinforcement++;
    atom.strength.current = Math.min(1, atom.strength.base + atom.strength.reinforcement * 0.1);
    atom.temporal.lastAccessed = Date.now();
    atom.temporal.accessCount++;

    return atom;
  }

  /**
   * 压缩记忆（测试兼容）
   */
  async compress(): Promise<{ compressed: number; removed: number }> {
    const before = this.atoms.size();
    await this.evolve();
    const after = this.atoms.size();
    return {
      compressed: before - after,
      removed: before - after,
    };
  }

  /**
   * 健康检查（测试兼容）
   */
  async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    checks: Record<string, boolean>;
  }> {
    const isRunning = this.isRunning;
    return {
      status: isRunning ? "healthy" : "unhealthy",
      checks: {
        running: isRunning,
        hasAtoms: this.atoms.size() > 0,
      },
    };
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): ReturnType<LRUCache<string, MemAtom>["getStats"]> {
    return this.atoms.getStats();
  }

  /**
   * 获取存储统计 (包含磁盘持久化)
   */
  getStorageStats(): {
    memory: { atoms: number; edges: number; fields: number };
    disk: { totalVectors: number; hotCache: number; warmCache: number };
    performance: { cacheHitRate: number; loadedFromDisk: number; savedToDisk: number };
  } {
    const vectorStats = this.vectorStorage.getStats();
    const totalAccesses = this.stats.cacheHits + this.stats.cacheMisses;

    return {
      memory: {
        atoms: this.atoms.size(),
        edges: this.edges.size,
        fields: this.fields.size,
      },
      disk: {
        totalVectors: vectorStats.totalVectors,
        hotCache: vectorStats.hotCacheSize,
        warmCache: vectorStats.warmCacheSize,
      },
      performance: {
        cacheHitRate: totalAccesses > 0 ? this.stats.cacheHits / totalAccesses : 0,
        loadedFromDisk: this.stats.loadedFromDisk,
        savedToDisk: this.stats.savedToDisk,
      },
    };
  }

  /**
   * 动态获取原子 (内存 -> 磁盘)
   */
  private getAtomWithFallback(id: string): MemAtom | null {
    // 1. 检查内存缓存
    const cached = this.atoms.get(id);
    if (cached) return cached;

    // 2. 从磁盘加载
    const fromDisk = this.loadAtomFromDisk(id);
    if (fromDisk) {
      this.atoms.set(id, fromDisk);
      return fromDisk;
    }

    return null;
  }

  /**
   * 获取生态系统状态
   */
  getState(): import("../../types/index.js").EcosystemState {
    const atoms = Array.from(this.atoms.values());
    const edges = Array.from(this.edges.values());
    const fields = Array.from(this.fields.values());

    // 计算统计数据
    const totalAtoms = atoms.length;
    const totalEdges = edges.length;
    const totalFields = fields.length;
    const totalCrystals = 0; // TODO: 实现晶体存储

    const avgAtomStrength =
      totalAtoms > 0 ? atoms.reduce((sum, a) => sum + a.strength.current, 0) / totalAtoms : 0;

    const networkDensity = totalAtoms > 1 ? (2 * totalEdges) / (totalAtoms * (totalAtoms - 1)) : 0;

    // 计算健康指标
    const overall = this.calculateHealthScore(atoms, edges, fields);
    const fragmentation = this.calculateFragmentation(atoms, edges);
    const redundancy = this.calculateRedundancy(edges);
    const coverage = Math.min(1, totalAtoms / this.config.maxAtoms);
    const vitality =
      fields.length > 0 ? fields.reduce((sum, f) => sum + f.vitality, 0) / fields.length : 0;

    // 识别热点场
    const hotspots = fields
      .map((f) => ({
        fieldId: f.id,
        activity: f.atoms.size,
        trend:
          f.vitality > 0.7
            ? ("rising" as const)
            : f.vitality < 0.3
              ? ("falling" as const)
              : ("stable" as const),
      }))
      .sort((a, b) => b.activity - a.activity)
      .slice(0, 5);

    // 生成推荐操作
    const recommendedActions: import("../../types/index.js").EcosystemState["recommendedActions"] =
      [];

    if (coverage > 0.9) {
      recommendedActions.push({
        action: "compress",
        target: "global",
        reason: "接近原子数上限，建议压缩",
        priority: 0.9,
      });
    }

    if (fragmentation > 0.5) {
      recommendedActions.push({
        action: "merge",
        target: "fields",
        reason: "场碎片过多",
        priority: 0.7,
      });
    }

    if (redundancy > 0.3) {
      recommendedActions.push({
        action: "prune",
        target: "edges",
        reason: "边冗余度高",
        priority: 0.5,
      });
    }

    return {
      timestamp: Date.now(),
      stats: {
        totalAtoms,
        totalEdges,
        totalFields,
        totalCrystals,
        avgAtomStrength,
        networkDensity,
      },
      health: {
        overall,
        fragmentation,
        redundancy,
        coverage,
        vitality,
      },
      hotspots,
      recommendedActions,
    };
  }

  /**
   * 获取统计信息 (测试兼容)
   */
  getStats(): {
    totalAtoms: number;
    totalEdges: number;
    totalFields: number;
    memoryUsage: number;
  } {
    return {
      totalAtoms: this.atoms.size(),
      totalEdges: this.edges.size,
      totalFields: this.fields.size,
      memoryUsage: 0, // 简化实现
    };
  }

  private calculateHealthScore(
    atoms: MemAtom[],
    edges: LivingEdge[],
    fields: MemoryField[],
  ): number {
    if (atoms.length === 0) return 1;

    const avgStrength = atoms.reduce((sum, a) => sum + a.strength.current, 0) / atoms.length;
    const connectivity = edges.length / Math.max(1, atoms.length);
    const fieldQuality =
      fields.length > 0
        ? fields.reduce((sum, f) => sum + (f.atoms.size > 0 ? 1 : 0), 0) / fields.length
        : 1;

    return avgStrength * 0.4 + Math.min(1, connectivity / 5) * 0.3 + fieldQuality * 0.3;
  }

  private calculateFragmentation(atoms: MemAtom[], edges: LivingEdge[]): number {
    if (atoms.length < 2) return 0;

    // 计算连通分量（简化估计）
    const connectedAtoms = new Set<string>();
    for (const edge of edges) {
      connectedAtoms.add(edge.from);
      connectedAtoms.add(edge.to);
    }

    const isolatedAtoms = atoms.filter((a) => !connectedAtoms.has(a.id)).length;
    return isolatedAtoms / atoms.length;
  }

  private calculateRedundancy(edges: LivingEdge[]): number {
    if (edges.length < 2) return 0;

    // 计算重复边比例
    const edgePairs = new Set<string>();
    let redundant = 0;

    for (const edge of edges) {
      const pair = [edge.from, edge.to].sort().join("-");
      if (edgePairs.has(pair)) {
        redundant++;
      } else {
        edgePairs.add(pair);
      }
    }

    return redundant / edges.length;
  }
}

// ============================================================================
// 单例管理
// ============================================================================

const nsemInstances = new Map<string, NSEM2Core>();
const nsemPendingPromises = new Map<string, Promise<NSEM2Core>>();

export async function getNSEM2Core(
  cfg: NsemclawConfig,
  agentId: string,
  memoryConfig: ResolvedMemorySearchConfig,
): Promise<NSEM2Core> {
  // 检查是否已有完成的实例
  const existing = nsemInstances.get(agentId);
  if (existing) {
    return existing;
  }

  // 检查是否正在创建中（避免竞争条件）
  const pending = nsemPendingPromises.get(agentId);
  if (pending) {
    return pending;
  }

  // 创建新实例，并记录 pending promise
  const promise = NSEM2Core.create(cfg, agentId, memoryConfig).then((nsem) => {
    nsemInstances.set(agentId, nsem);
    nsemPendingPromises.delete(agentId);
    return nsem;
  }).catch((err) => {
    nsemPendingPromises.delete(agentId);
    throw err;
  });

  nsemPendingPromises.set(agentId, promise);
  return promise;
}

export function clearNSEM2Core(agentId?: string): void {
  if (agentId) {
    nsemInstances.delete(agentId);
  } else {
    nsemInstances.clear();
  }
}

export function getNSEM2CoreInstance(agentId: string): NSEM2Core | undefined {
  return nsemInstances.get(agentId);
}

/** @deprecated 使用 getNSEM2Core 替代 */
export const createNSEM2Core = getNSEM2Core;
