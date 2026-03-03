/**
 * 集成版 NSEM2Core - P1 实现
 *
 * 集成 ThreeTierMemoryStore 和 EnhancedRetrievalScorer
 * 提供更智能的记忆存储和检索能力
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ResolvedMemorySearchConfig } from "../../agents/memory-search.js";
import type { NsemclawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { DecisionStrategyEngine } from "../decision/DecisionStrategyEngine.js";
import {
  EnhancedRetrievalScorer,
  ScoringConfig,
  createEnhancedScorer,
  DEFAULT_SCORING_CONFIG,
} from "../memory/EnhancedRetrievalScorer.js";
import {
  ThreeTierMemoryStore,
  TieredMemoryItem,
  MemoryTier,
  type ThreeTierMemoryConfig,
} from "../memory/ThreeTierMemoryStore.js";
import {
  createSmartEmbeddingEngine,
  SmartEmbeddingEngine,
} from "../mind/perception/SmartEmbeddingEngine.js";
import type {
  MemAtom,
  LivingEdge,
  MemoryField,
  MemoryQuery,
  ActivatedMemory,
  NSEM2Config,
  ContentType,
  QueryStrategy,
} from "../types/index.js";
import {
  LRUCache,
  cosineSimilarity,
  embeddingDistance,
  hash,
  generateId,
  getMemoryStats,
  formatBytes,
  clamp,
  exponentialDecay,
} from "../utils/common.js";

const log = createSubsystemLogger("integrated-nsem2");

// ============================================================================
// 常量定义
// ============================================================================

const DEFAULT_CONFIG: NSEM2Config = {
  rootDir: join(homedir(), ".nsemclaw", "nsem2"),
  agentId: "default",
  resourceMode: "balanced",
  evolutionInterval: 15 * 60 * 1000,
  maxAtoms: 50000,
  compressionTrigger: {
    atomCount: 1000,
    ageDays: 7,
    strengthThreshold: 0.3,
  },
};

const MEMORY_WARNING_THRESHOLD = 80;
const MEMORY_CRITICAL_THRESHOLD = 90;
const LRU_CACHE_RATIO = 0.2;
const MAX_EVOLVE_RETRIES = 3;
const EVOLVE_RETRY_DELAY = 60000;

const DECAY_RATES: Record<ContentType, number> = {
  fact: 0.001,
  experience: 0.005,
  insight: 0.002,
  pattern: 0.0005,
  narrative: 0.003,
  intuition: 0.0001,
};

// ============================================================================
// 集成配置接口
// ============================================================================

export interface IntegratedNSEM2Config extends NSEM2Config {
  /** 是否启用三层记忆存储 */
  enableThreeTierStorage: boolean;
  /** 三层记忆存储配置 */
  threeTierConfig?: Partial<ThreeTierMemoryConfig>;
  /** 是否启用增强检索评分 */
  enableEnhancedScoring: boolean;
  /** 增强评分配置 */
  scoringConfig?: Partial<ScoringConfig>;
  /** 是否启用决策引擎集成 */
  enableDecisionIntegration: boolean;
  /** 工作记忆与三层存储同步间隔 (毫秒) */
  syncIntervalMs: number;
}

const DEFAULT_INTEGRATED_CONFIG: Partial<IntegratedNSEM2Config> = {
  enableThreeTierStorage: true,
  enableEnhancedScoring: true,
  enableDecisionIntegration: true,
  syncIntervalMs: 30000, // 30秒同步一次
};

// ============================================================================
// 激活映射项
// ============================================================================

interface ActivationMapItem {
  level: number;
  depth: number;
  path: string[];
}

interface Candidate {
  text: string;
  score: number;
}

// ============================================================================
// 集成版 NSEM2 核心
// ============================================================================

export class IntegratedNSEM2Core {
  private config: IntegratedNSEM2Config;
  private embedding: SmartEmbeddingEngine;

  // 原有存储结构
  private atoms: LRUCache<string, MemAtom>;
  private edges: Map<string, LivingEdge> = new Map();
  private fields: Map<string, MemoryField> = new Map();

  // P1: 三层记忆存储集成
  private threeTierStore?: ThreeTierMemoryStore;

  // P1: 增强检索评分集成
  private enhancedScorer?: EnhancedRetrievalScorer;

  // P1: 决策引擎集成
  private decisionEngine?: DecisionStrategyEngine;

  // 运行时状态
  private isRunning = false;
  private evolveTimer?: NodeJS.Timeout;
  private evolveRetryCount = 0;

  // 并发控制
  private operationLock = Promise.resolve();
  private isOperating = false;

  // 内存监控
  private lastMemoryCheck = 0;
  private memoryCheckInterval = 60000;
  private memoryCheckTimer?: NodeJS.Timeout;
  private memoryMonitorTimer?: NodeJS.Timeout;

  // 同步定时器
  private syncTimer?: NodeJS.Timeout;

  constructor(embedding: SmartEmbeddingEngine, config: Partial<IntegratedNSEM2Config> = {}) {
    this.embedding = embedding;
    this.config = {
      ...DEFAULT_CONFIG,
      ...DEFAULT_INTEGRATED_CONFIG,
      ...config,
    } as IntegratedNSEM2Config;

    // 初始化 LRU 缓存
    const lruSize = Math.max(1000, Math.floor(this.config.maxAtoms * LRU_CACHE_RATIO));
    this.atoms = new LRUCache<string, MemAtom>(lruSize);

    // P1: 初始化三层记忆存储
    if (this.config.enableThreeTierStorage) {
      this.threeTierStore = new ThreeTierMemoryStore({
        workingMemoryCapacity: 15,
        autoTierTransition: true,
        ...this.config.threeTierConfig,
      });

      // 监听层级迁移事件
      this.threeTierStore.onTransition((event) => {
        log.debug(`记忆层级迁移: ${event.atomId.slice(0, 8)} ${event.fromTier} → ${event.toTier}`);
      });
    }

    // P1: 初始化增强评分器
    if (this.config.enableEnhancedScoring) {
      this.enhancedScorer = createEnhancedScorer({
        ...DEFAULT_SCORING_CONFIG,
        ...this.config.scoringConfig,
      });
    }

    this.ensureDirectories();

    log.info(`🧠 集成版 NSEM 2.0 初始化完成`);
    log.info(`   三层记忆存储: ${this.config.enableThreeTierStorage ? "✅" : "❌"}`);
    log.info(`   增强检索评分: ${this.config.enableEnhancedScoring ? "✅" : "❌"}`);
    log.info(`   决策引擎集成: ${this.config.enableDecisionIntegration ? "✅" : "❌"}`);
  }

  /**
   * 创建集成版 NSEM2 核心
   */
  static async create(
    cfg: NsemclawConfig,
    agentId: string,
    memoryConfig: ResolvedMemorySearchConfig,
    config?: Partial<IntegratedNSEM2Config>,
  ): Promise<IntegratedNSEM2Core> {
    const embedding = await createSmartEmbeddingEngine(
      cfg,
      agentId,
      memoryConfig,
      config?.resourceMode,
    );

    return new IntegratedNSEM2Core(embedding, {
      ...config,
      agentId,
    });
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    log.info(`🧠 集成版 NSEM 2.0 启动 [${this.config.agentId}]`);

    // 启动三层记忆存储
    this.threeTierStore?.start();

    // 启动自动进化
    if (this.config.evolutionInterval > 0) {
      this.scheduleNextEvolution();
    }

    // 启动内存监控
    this.startMemoryMonitoring();

    // 启动工作记忆与三层存储同步
    if (this.config.enableThreeTierStorage) {
      this.startSyncWithThreeTierStore();
    }

    log.info(`   原子: ${this.atoms.size()}`);
    log.info(`   边: ${this.edges.size}`);
    log.info(`   场: ${this.fields.size}`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.evolveTimer) {
      clearTimeout(this.evolveTimer);
      this.evolveTimer = undefined;
    }

    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
      this.memoryMonitorTimer = undefined;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    // 停止三层记忆存储
    this.threeTierStore?.stop();

    await this.embedding.cleanup?.();

    this.atoms.clear();
    this.edges.clear();
    this.fields.clear();

    log.info("🛑 集成版 NSEM 2.0 已停止");
  }

  // ========================================================================
  // P1: 三层记忆存储同步
  // ========================================================================

  /**
   * 启动与工作记忆的同步
   */
  private startSyncWithThreeTierStore(): void {
    this.syncTimer = setInterval(() => {
      this.syncWithThreeTierStore().catch((err) => {
        log.error("三层记忆存储同步失败:", err);
      });
    }, this.config.syncIntervalMs);
  }

  /**
   * 将工作记忆中的活跃原子同步到三层存储
   */
  private async syncWithThreeTierStore(): Promise<void> {
    if (!this.threeTierStore) return;

    // 获取工作记忆中的高活跃度原子
    const activeAtoms: MemAtom[] = [];
    for (const atom of this.atoms.values()) {
      if (atom.temporal.accessCount >= 3 || atom.strength.current >= 0.7) {
        activeAtoms.push(atom);
      }
    }

    // 同步到三层存储
    for (const atom of activeAtoms) {
      const existing = await this.threeTierStore.get(atom.id);
      if (!existing) {
        await this.threeTierStore.ingest(atom);
      }
    }

    log.debug(`已同步 ${activeAtoms.length} 个活跃原子到三层存储`);
  }

  // ========================================================================
  // P1: 增强检索 - 使用 EnhancedRetrievalScorer
  // ========================================================================

  /**
   * 使用增强评分器查找相似原子
   */
  private async findSimilarEnhanced(
    embedding: number[],
    topK: number = 10,
    queryContext?: string,
  ): Promise<Array<{ atom: MemAtom; similarity: number; score: number }>> {
    if (!this.enhancedScorer) {
      // 回退到原有实现
      return this.findSimilarLegacy(embedding, topK);
    }

    // 生成上下文向量（如果有上下文）
    let contextVector: number[] | undefined;
    if (queryContext) {
      contextVector = await this.embedding.embed(queryContext);
    }

    const currentTime = Date.now();
    const results: Array<{ atom: MemAtom; similarity: number; score: number }> = [];

    for (const atom of this.atoms.values()) {
      if (atom.strength.current < 0.1) continue;

      // 使用增强评分器计算综合分数
      const scoringResult = this.enhancedScorer.score(atom, embedding, contextVector, currentTime);

      if (scoringResult.passedThreshold) {
        results.push({
          atom,
          similarity: scoringResult.components.contentSimilarity,
          score: scoringResult.totalScore,
        });
      }
    }

    // 按综合分数排序
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * 原有查找相似原子的实现（回退用）
   */
  private async findSimilarLegacy(
    embedding: number[],
    topK: number = 10,
  ): Promise<Array<{ atom: MemAtom; similarity: number; score: number }>> {
    const results: Array<{ atom: MemAtom; similarity: number; score: number }> = [];

    for (const atom of this.atoms.values()) {
      if (atom.strength.current < 0.1) continue;

      const similarity = cosineSimilarity(embedding, atom.embedding);
      if (similarity > 0.2) {
        results.push({ atom, similarity, score: similarity });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  // ========================================================================
  // P1: 核心操作 - 摄入记忆（集成三层存储）
  // ========================================================================

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
      const atom = await this._ingestUnsafe(content, options);

      // P1: 同时摄入到三层存储
      if (this.threeTierStore && this.config.enableThreeTierStorage) {
        await this.threeTierStore.ingest(atom);
      }

      return atom;
    });
  }

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

    const existingAtom = this.atoms.get(id);
    if (existingAtom) {
      return this._reinforceUnsafe(id);
    }

    if (this.atoms.size() >= this.config.maxAtoms) {
      log.warn(`⚠️ 达到原子数上限，触发 LRU 淘汰`);
      this.enforceAtomLimit();
    }

    const embedding = await this.embedding.embed(content);

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

    await this.establishRelations(atom);
    this.updateFields(atom);

    log.debug(`✨ 新记忆: ${id.slice(0, 8)} (${atom.contentType})`);

    return atom;
  }

  // ========================================================================
  // P1: 核心操作 - 激活记忆（集成增强评分）
  // ========================================================================

  async activate(query: MemoryQuery): Promise<ActivatedMemory> {
    // 1. 扩展查询
    const expanded = await this.embedding.expandQuery(query.intent);

    // 2. 生成嵌入
    const embedding = await this.embedding.embed(expanded.original);

    // P1: 使用增强评分查找相似原子
    const seeds = await this.findSimilarEnhanced(
      embedding,
      20,
      query.intent, // 使用查询意图作为上下文
    );

    // 3. 激活传播
    const activationMap = new Map<string, ActivationMapItem>();

    for (const { atom, score } of seeds) {
      if (score >= 0.2) {
        activationMap.set(atom.id, {
          level: score,
          depth: 0,
          path: [atom.id],
        });
      }
    }

    this.spreadActivation(activationMap, query.strategy);

    // 4. 组装结果
    const atoms = this.assembleAtoms(activationMap, query.constraints?.maxResults ?? 10);

    // 5. 重排优化
    if (atoms.length > 0) {
      const candidates: Candidate[] = atoms.map((a) => ({
        text: a.atom.content,
        score: a.relevance,
      }));

      const reranked = await this.embedding.rerank(query.intent, candidates);

      for (let i = 0; i < atoms.length && i < reranked.length; i++) {
        const rerankedItem = reranked[i];
        const atomItem = atoms[i];
        if (rerankedItem && atomItem && rerankedItem.rerankScore !== undefined) {
          atomItem.relevance = rerankedItem.rerankScore;
        }
      }

      atoms.sort((a, b) => b.relevance - a.relevance);
    }

    // 6. 发现涌现关系
    const emergentRelations = this.discoverEmergentRelations(activationMap);

    // 7. 激活场
    const fields = this.activateFields(activationMap);

    // 8. 更新访问统计
    this.updateAccessStats(atoms.map((a) => a.atom.id));

    // P1: 更新三层存储中的访问统计
    if (this.threeTierStore) {
      for (const { atom } of atoms) {
        await this.threeTierStore.access(atom.id);
      }
    }

    return {
      atoms,
      fields,
      emergentRelations,
      semantic: this.computeSemantic(atoms),
    };
  }

  // ========================================================================
  // P1: 从三层存储检索（新功能）
  // ========================================================================

  /**
   * 从三层记忆存储检索
   * 优先从工作记忆 -> 短期记忆 -> 长期记忆
   */
  async retrieveFromTieredStorage(
    query: string | number[],
    options: {
      maxResults?: number;
      minSimilarity?: number;
      searchTiers?: MemoryTier[];
    } = {},
  ): Promise<Array<{ atom: MemAtom; tier: MemoryTier; score: number }>> {
    if (!this.threeTierStore) {
      throw new Error("三层记忆存储未启用");
    }

    const results = await this.threeTierStore.retrieve(query, options);

    return results.map((r) => ({
      atom: r.item.atom,
      tier: r.matchedTier,
      score: r.retrievalScore,
    }));
  }

  /**
   * 获取三层记忆存储统计
   */
  getThreeTierStats() {
    return this.threeTierStore?.getStats();
  }

  // ========================================================================
  // 以下方法保持原有实现不变
  // ========================================================================

  async evolve(): Promise<void> {
    return this.withLock("evolve", async () => {
      return this._evolveUnsafe();
    });
  }

  private async _evolveUnsafe(): Promise<void> {
    log.info("🧬 记忆进化开始");

    const beforeAtoms = this.atoms.size();

    this.decayMemories();
    this.pruneForgotten();
    this.mergeFields();
    this.reinforceConnections();

    const afterAtoms = this.atoms.size();

    log.info(`✅ 进化完成: ${beforeAtoms} → ${afterAtoms} 原子`);
  }

  private async findSimilar(
    embedding: number[],
    topK: number = 10,
  ): Promise<Array<{ atom: MemAtom; similarity: number }>> {
    const enhanced = await this.findSimilarEnhanced(embedding, topK);
    return enhanced.map(({ atom, similarity }) => ({ atom, similarity }));
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
      const atom = this.atoms.get(id);
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
      this.deleteAtom(id);
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

    for (const id of toDelete) {
      this.fields.delete(id);
    }
  }

  private reinforceConnections(): void {
    for (const edge of this.edges.values()) {
      const fromAtom = this.atoms.get(edge.from);
      const toAtom = this.atoms.get(edge.to);

      if (!fromAtom || !toAtom) continue;

      if (fromAtom.temporal.accessCount > 5 && toAtom.temporal.accessCount > 5) {
        edge.dynamicWeight.current = Math.min(1, edge.dynamicWeight.current + 0.1);
      }
    }
  }

  private deleteAtom(id: string): void {
    this.atoms.delete(id);

    for (const [edgeId, edge] of this.edges) {
      if (edge.from === id || edge.to === id) {
        this.edges.delete(edgeId);
      }
    }

    for (const field of this.fields.values()) {
      field.atoms.delete(id);
    }
  }

  private _reinforceUnsafe(atomId: string): MemAtom {
    const atom = this.atoms.get(atomId);
    if (!atom) {
      throw new Error(`Atom not found: ${atomId}`);
    }

    atom.strength.reinforcement++;
    atom.strength.current = Math.min(1, atom.strength.base + atom.strength.reinforcement * 0.1);
    atom.temporal.lastAccessed = Date.now();
    atom.temporal.accessCount++;

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
      const atom = this.atoms.get(id);
      if (atom) {
        atom.temporal.lastAccessed = now;
        atom.temporal.accessCount++;
        this.atoms.set(id, atom);
      }
    }
  }

  // ========================================================================
  // 内存管理
  // ========================================================================

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

      if (this.atoms.size() > this.config.maxAtoms) {
        log.warn(`⚠️ 原子数超过上限: ${this.atoms.size()} > ${this.config.maxAtoms}`);
        this.enforceAtomLimit();
      }

      const now = Date.now();
      if (now - this.lastMemoryCheck > this.memoryCheckInterval * 5) {
        this.lastMemoryCheck = now;
        log.info(
          `📊 内存报告: ${report.heapUsed} / ${report.heapTotal} (${report.percentage.toFixed(1)}%)`,
        );
      }
    };

    this.memoryMonitorTimer = setInterval(checkMemory, this.memoryCheckInterval);
  }

  getMemoryReport() {
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

  private handleMemoryPressure(): void {
    this.pruneForgotten();
    this.mergeFields();
    this.cleanupOrphanEdges();

    log.info(`🧹 内存压力处理完成: ${this.atoms.size()} 原子, ${this.edges.size} 边`);
  }

  private enforceAtomLimit(): void {
    const targetSize = Math.floor(this.config.maxAtoms * 0.9);
    const currentSize = this.atoms.size();

    if (currentSize <= targetSize) return;

    const toRemove = currentSize - targetSize;
    log.info(`🗑️ 强制清理 ${toRemove} 个原子`);

    const keys = this.atoms.keys();
    for (let i = 0; i < toRemove && i < keys.length; i++) {
      const keyIndex = keys.length - 1 - i;
      const key = keys[keyIndex];
      if (key !== undefined) {
        this.deleteAtom(key);
      }
    }
  }

  private cleanupOrphanEdges(): void {
    const atomIds = new Set(this.atoms.keys());

    for (const [edgeId, edge] of this.edges) {
      if (!atomIds.has(edge.from) || !atomIds.has(edge.to)) {
        this.edges.delete(edgeId);
      }
    }
  }

  // ========================================================================
  // 调度与锁
  // ========================================================================

  private scheduleNextEvolution(): void {
    if (!this.isRunning) return;

    this.evolveTimer = setTimeout(async () => {
      try {
        await this.evolve();
        this.evolveRetryCount = 0;
      } catch (err) {
        this.evolveRetryCount++;
        log.error(
          `自动进化失败 (第${this.evolveRetryCount}次): ${err instanceof Error ? err.message : String(err)}`,
        );

        if (this.evolveRetryCount >= MAX_EVOLVE_RETRIES) {
          log.error("自动进化连续失败多次，停止自动调度");
          return;
        }

        const delay = EVOLVE_RETRY_DELAY * Math.pow(2, this.evolveRetryCount - 1);
        log.info(`${delay / 1000}秒后重试进化`);
      }

      this.scheduleNextEvolution();
    }, this.config.evolutionInterval);
  }

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

    const currentLock = this.operationLock;
    const newLock = currentLock.catch(() => {}).then(() => acquireLock());
    this.operationLock = newLock.then(() => {}).catch(() => {});

    return newLock;
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

  getAtoms(): ReadonlyMap<string, MemAtom> {
    const map = new Map<string, MemAtom>();
    for (const [key, value] of this.atoms.entries()) {
      map.set(key, value);
    }
    return map;
  }

  getEdges(): ReadonlyMap<string, LivingEdge> {
    return this.edges;
  }

  getFields(): ReadonlyMap<string, MemoryField> {
    return this.fields;
  }

  getConfig(): IntegratedNSEM2Config {
    return { ...this.config };
  }

  getCacheStats() {
    return this.atoms.getStats();
  }

  getThreeTierStore(): ThreeTierMemoryStore | undefined {
    return this.threeTierStore;
  }

  getEnhancedScorer(): EnhancedRetrievalScorer | undefined {
    return this.enhancedScorer;
  }
}

// ============================================================================
// 单例管理
// ============================================================================

const integratedInstances = new Map<string, IntegratedNSEM2Core>();

export async function getIntegratedNSEM2Core(
  cfg: NsemclawConfig,
  agentId: string,
  memoryConfig: ResolvedMemorySearchConfig,
  config?: Partial<IntegratedNSEM2Config>,
): Promise<IntegratedNSEM2Core> {
  const existing = integratedInstances.get(agentId);
  if (existing) {
    return existing;
  }

  const nsem = await IntegratedNSEM2Core.create(cfg, agentId, memoryConfig, config);
  integratedInstances.set(agentId, nsem);
  return nsem;
}

export function clearIntegratedNSEM2Core(agentId?: string): void {
  if (agentId) {
    integratedInstances.delete(agentId);
  } else {
    integratedInstances.clear();
  }
}

export function getIntegratedNSEM2CoreInstance(agentId: string): IntegratedNSEM2Core | undefined {
  return integratedInstances.get(agentId);
}
