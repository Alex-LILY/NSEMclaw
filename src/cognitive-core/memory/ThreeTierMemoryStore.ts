/**
 * NSEM记忆存储系统 - Three Tier Memory Store
 *
 * 实现基于认知心理学的工作记忆-短期记忆-长期记忆架构：
 * - 工作记忆 (Working Memory): 当前活跃记忆，容量限制 10-20 项
 * - 短期记忆 (Short-term Memory): 24小时时间窗口
 * - 长期记忆 (Long-term Memory): 30天+ 时间窗口
 *
 * 特性:
 * 1. 记忆重要性评分: 0.5*base_importance + 0.2*frequency + 0.2*recency + 0.1*freshness
 * 2. 艾宾浩斯遗忘曲线: R = e^(-t/S)
 * 3. 自动升降级机制
 * 4. 并发安全 (与 NSEM2Core 相同的锁机制)
 * 5. 与现有 MemAtom 类型兼容
 */

import type { MemAtom } from "../types/index.js";
import { LRUCache, exponentialDecay, clamp } from "../utils/common.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("memory-tier");

// ============================================================================
// 配置常量
// ============================================================================

/** 工作记忆容量配置 */
export const WORKING_MEMORY_CONFIG = {
  MIN_CAPACITY: 10,
  MAX_CAPACITY: 20,
  DEFAULT_CAPACITY: 15,
} as const;

/** 时间窗口配置 (毫秒) */
export const TIME_WINDOW_CONFIG = {
  SHORT_TERM_MS: 24 * 60 * 60 * 1000, // 24小时
  LONG_TERM_MS: 30 * 24 * 60 * 60 * 1000, // 30天
  UPGRADE_CHECK_INTERVAL_MS: 60 * 1000, // 1分钟检查一次升级
  DECAY_CALCULATION_INTERVAL_MS: 5 * 60 * 1000, // 5分钟计算一次衰减
} as const;

/** 记忆升降级阈值 */
export const TIER_THRESHOLD_CONFIG = {
  // 工作记忆 -> 短期记忆: 访问频率降低或时间超过
  WM_TO_STM_ACCESS_THRESHOLD: 3, // 访问次数低于此值考虑降级
  WM_TO_STM_TIME_THRESHOLD_MS: 10 * 60 * 1000, // 10分钟未访问

  // 短期记忆 -> 工作记忆: 高频率访问
  STM_TO_WM_ACCESS_THRESHOLD: 5, // 短时间内访问次数
  STM_TO_WM_TIME_WINDOW_MS: 5 * 60 * 1000, // 5分钟内

  // 短期记忆 -> 长期记忆: 时间超过24小时且强度足够
  STM_TO_LTM_TIME_THRESHOLD_MS: 24 * 60 * 60 * 1000,
  STM_TO_LTM_STRENGTH_THRESHOLD: 0.6,

  // 长期记忆 -> 短期记忆: 重新被访问
  LTM_TO_STM_ACCESS_BURST: 2, // 短时间内多次访问
} as const;

/** 重要性权重配置 */
export const IMPORTANCE_WEIGHTS = {
  BASE_IMPORTANCE: 0.5,
  FREQUENCY: 0.2,
  RECENCY: 0.2,
  FRESHNESS: 0.1,
} as const;

/** 艾宾浩斯遗忘曲线稳定性因子 */
export const FORGETTING_STABILITY = {
  WORKING_MEMORY: 0.1, // 工作记忆稳定性低，衰减快
  SHORT_TERM: 1.0, // 短期记忆稳定性中等
  LONG_TERM: 30.0, // 长期记忆稳定性高，衰减慢
} as const;

// ============================================================================
// 类型定义
// ============================================================================

/** 记忆层级 */
export type MemoryTier = "working" | "short-term" | "long-term";

/** 向量类型 */
export type Vector = number[];

/** 增强的记忆项 - 包含层级管理元数据 */
export interface TieredMemoryItem {
  /** 基础 MemAtom */
  atom: MemAtom;

  /** 当前层级 */
  tier: MemoryTier;

  /** 层级管理元数据 */
  tierMeta: {
    /** 进入当前层级的时间 */
    enteredTierAt: number;

    /** 在当前层级的访问次数 */
    tierAccessCount: number;

    /** 历史层级变迁 */
    tierHistory: Array<{
      tier: MemoryTier;
      enteredAt: number;
      leftAt: number;
    }>;

    /** 上次计算的重要性分数 */
    lastImportanceScore: number;

    /** 上次重要性计算时间 */
    lastImportanceCalcAt: number;
  };

  /** 记忆保留值 (基于艾宾浩斯曲线) */
  retention: {
    current: number; // 当前保留值 0-1
    calculatedAt: number; // 上次计算时间
    stabilityFactor: number; // 稳定性因子 S
  };
}

/** 三层记忆存储配置 */
export interface ThreeTierMemoryConfig {
  /** 工作记忆容量 */
  workingMemoryCapacity: number;

  /** 是否启用自动升降级 */
  autoTierTransition: boolean;

  /** 升级检查间隔 (毫秒) */
  upgradeCheckIntervalMs: number;

  /** 衰减计算间隔 (毫秒) */
  decayCalculationIntervalMs: number;

  /** 记忆最大年龄 (超过将被清理) */
  maxMemoryAgeMs: number;

  /** 最小保留值 (低于此值将被遗忘) */
  minRetentionThreshold: number;
}

/** 记忆检索结果 */
export interface MemoryRetrievalResult {
  item: TieredMemoryItem;
  retrievalScore: number;
  matchedTier: MemoryTier;
  spreadDepth: number;
}

/** 存储统计 */
export interface ThreeTierMemoryStats {
  working: {
    count: number;
    capacity: number;
    avgImportance: number;
    avgRetention: number;
  };
  shortTerm: {
    count: number;
    avgAgeMs: number;
    avgRetention: number;
  };
  longTerm: {
    count: number;
    avgAgeMs: number;
    avgRetention: number;
  };
  total: {
    memories: number;
    avgImportance: number;
    forgottenCount: number;
  };
}

/** 升降级事件 */
export interface TierTransitionEvent {
  atomId: string;
  fromTier: MemoryTier;
  toTier: MemoryTier;
  reason: string;
  timestamp: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: ThreeTierMemoryConfig = {
  workingMemoryCapacity: WORKING_MEMORY_CONFIG.DEFAULT_CAPACITY,
  autoTierTransition: true,
  upgradeCheckIntervalMs: TIME_WINDOW_CONFIG.UPGRADE_CHECK_INTERVAL_MS,
  decayCalculationIntervalMs: TIME_WINDOW_CONFIG.DECAY_CALCULATION_INTERVAL_MS,
  maxMemoryAgeMs: 90 * 24 * 60 * 60 * 1000, // 90天
  minRetentionThreshold: 0.1,
};

// ============================================================================
// NSEM记忆存储系统
// ============================================================================

export class ThreeTierMemoryStore {
  private config: ThreeTierMemoryConfig;

  // 三层存储结构
  private workingMemory: LRUCache<string, TieredMemoryItem>;
  private shortTermMemory: Map<string, TieredMemoryItem> = new Map();
  private longTermMemory: Map<string, TieredMemoryItem> = new Map();

  // 遗忘记忆记录 (用于统计)
  private forgottenMemories: Array<{ id: string; forgottenAt: number; finalRetention: number }> =
    [];

  // 定时器
  private upgradeCheckTimer?: NodeJS.Timeout;
  private decayCalculationTimer?: NodeJS.Timeout;

  // 运行时状态
  private isRunning = false;

  // 并发控制 (与 NSEM2Core 相同)
  private operationLock = Promise.resolve();
  private isOperating = false;

  // 事件监听器
  private transitionListeners: Array<(event: TierTransitionEvent) => void> = [];

  constructor(config: Partial<ThreeTierMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 初始化工作记忆 LRU 缓存
    const capacity = clamp(
      this.config.workingMemoryCapacity,
      WORKING_MEMORY_CONFIG.MIN_CAPACITY,
      WORKING_MEMORY_CONFIG.MAX_CAPACITY,
    );
    this.workingMemory = new LRUCache<string, TieredMemoryItem>(capacity);

    console.log(`🧠 NSEM记忆存储系统初始化完成`);
    console.log(`   工作记忆容量: ${capacity}`);
    console.log(`   自动升降级: ${this.config.autoTierTransition ? "启用" : "禁用"}`);
  }

  // ========================================================================
  // 生命周期管理
  // ========================================================================

  /**
   * 启动存储系统
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`🧠 NSEM记忆存储系统启动`);
    console.log(
      `   工作记忆: ${this.workingMemory.size()}/${this.workingMemory.getStats().maxSize}`,
    );
    console.log(`   短期记忆: ${this.shortTermMemory.size}`);
    console.log(`   长期记忆: ${this.longTermMemory.size}`);

    if (this.config.autoTierTransition) {
      this.startTierTransitionMonitoring();
    }

    this.startDecayMonitoring();
  }

  /**
   * 停止存储系统
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.upgradeCheckTimer) {
      clearInterval(this.upgradeCheckTimer);
      this.upgradeCheckTimer = undefined;
    }

    if (this.decayCalculationTimer) {
      clearInterval(this.decayCalculationTimer);
      this.decayCalculationTimer = undefined;
    }

    console.log(`🛑 NSEM记忆存储系统已停止`);
  }

  // ========================================================================
  // 核心操作 - 带锁保护
  // ========================================================================

  /**
   * 摄入新记忆 - 默认进入工作记忆
   */
  async ingest(atom: MemAtom): Promise<TieredMemoryItem> {
    return this.withLock("ingest", async () => {
      return this._ingestUnsafe(atom);
    });
  }

  /**
   * 检索记忆 - 按层级优先级搜索
   */
  async retrieve(
    query: string | Vector,
    options: {
      maxResults?: number;
      minSimilarity?: number;
      searchTiers?: MemoryTier[];
    } = {},
  ): Promise<MemoryRetrievalResult[]> {
    return this.withLock("retrieve", async () => {
      return this._retrieveUnsafe(query, options);
    });
  }

  /**
   * 访问记忆 - 更新访问统计并可能触发升级
   */
  async access(atomId: string): Promise<TieredMemoryItem | null> {
    return this.withLock("access", async () => {
      return this._accessUnsafe(atomId);
    });
  }

  /**
   * 手动移动记忆到指定层级
   */
  async moveToTier(atomId: string, targetTier: MemoryTier, reason?: string): Promise<boolean> {
    return this.withLock("moveToTier", async () => {
      return this._moveToTierUnsafe(atomId, targetTier, reason);
    });
  }

  /**
   * 获取记忆项 (同步版本)
   */
  get(atomId: string): TieredMemoryItem | undefined {
    return this._findItemUnsafe(atomId) ?? undefined;
  }

  /**
   * 删除记忆
   */
  async delete(atomId: string): Promise<boolean> {
    return this.withLock("delete", async () => {
      return this._deleteUnsafe(atomId);
    });
  }

  /**
   * 删除记忆 (同步版本)
   */
  remove(atomId: string): boolean {
    const item = this._findItemUnsafe(atomId);
    if (!item) return false;

    this._removeFromTier(atomId, item.tier);
    return true;
  }

  /**
   * 添加记忆 (别名 - 测试兼容)
   */
  add(atom: MemAtom): TieredMemoryItem {
    // 同步执行 (绕过锁以简化测试)
    const now = Date.now();

    // 检查是否已存在
    const existing = this._findItemUnsafe(atom.id);
    if (existing) {
      return this._reinforceUnsafe(existing);
    }

    const item: TieredMemoryItem = {
      atom,
      tier: "working",
      tierMeta: {
        enteredTierAt: now,
        tierAccessCount: 0,
        tierHistory: [],
        lastImportanceScore: this._calculateImportance(atom, now),
        lastImportanceCalcAt: now,
      },
      retention: {
        current: 1.0,
        calculatedAt: now,
        stabilityFactor: FORGETTING_STABILITY.WORKING_MEMORY,
      },
    };

    // 根据工作记忆容量决定是放入工作记忆还是降级到短期记忆
    if (this.workingMemory.size() < this.workingMemory.getStats().maxSize) {
      this.workingMemory.set(atom.id, item);
    } else {
      // 工作记忆已满，尝试降级最久未使用的到短期记忆，然后存入
      this._evictOldestFromWorkingMemory();
      this.workingMemory.set(atom.id, item);
    }

    return item;
  }

  /**
   * 访问记忆 (同步版本)
   */
  touch(atomId: string): TieredMemoryItem | undefined {
    const item = this._findItemUnsafe(atomId);
    if (!item) return undefined;

    // 更新访问统计
    this._updateAccessStats(item);

    // 更新原子本身的访问统计
    item.atom.temporal.lastAccessed = Date.now();
    item.atom.temporal.accessCount++;

    // 强化记忆
    item.atom.strength.reinforcement += 1;
    item.atom.strength.current = Math.min(
      1,
      item.atom.strength.base + item.atom.strength.reinforcement * 0.05,
    );

    // 更新保留值
    item.retention.current = Math.min(1, item.retention.current + 0.1);

    // 如果被访问，考虑升级
    if (this.config.autoTierTransition && item.tier !== "working") {
      this._considerUpgrade(item);
    }

    return item;
  }

  /**
   * 应用衰减 (测试兼容)
   */
  applyDecay(): void {
    this._calculateAllRetentionUnsafe();
  }

  /**
   * 清理过期记忆 (测试兼容)
   */
  cleanExpired(): number {
    const beforeCount =
      this.workingMemory.size() + this.shortTermMemory.size + this.longTermMemory.size;
    this._calculateAllRetentionUnsafe();
    const afterCount =
      this.workingMemory.size() + this.shortTermMemory.size + this.longTermMemory.size;
    return beforeCount - afterCount;
  }

  /**
   * 向量搜索 (测试兼容)
   */
  searchByVector(vector: Vector, maxResults = 10): TieredMemoryItem[] {
    const results: { item: TieredMemoryItem; score: number }[] = [];

    const searchTier = (tier: MemoryTier) => {
      const memories = this._getMemoriesByTier(tier);
      for (const item of memories) {
        const similarity = this._calculateVectorSimilarity(vector, item.atom.embedding);
        if (similarity > 0.3) {
          results.push({ item, score: similarity });
        }
      }
    };

    searchTier("working");
    searchTier("short-term");
    searchTier("long-term");

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((r) => r.item);
  }

  /**
   * 批量添加 (测试兼容)
   */
  addBatch(atoms: MemAtom[]): TieredMemoryItem[] {
    return atoms.map((atom) => this.add(atom));
  }

  /**
   * 批量获取
   */
  getBatch(ids: string[]): (TieredMemoryItem | undefined)[] {
    return ids.map((id) => this._findItemUnsafe(id) ?? undefined);
  }

  /**
   * 强制触发升降级检查
   */
  async checkTierTransitions(): Promise<TierTransitionEvent[]> {
    return this.withLock("checkTierTransitions", async () => {
      return this._checkTierTransitionsUnsafe();
    });
  }

  /**
   * 计算所有记忆的保留值
   */
  async calculateAllRetention(): Promise<void> {
    return this.withLock("calculateRetention", async () => {
      return this._calculateAllRetentionUnsafe();
    });
  }

  // ========================================================================
  // 内部实现 (无锁)
  // ========================================================================

  private _ingestUnsafe(atom: MemAtom): TieredMemoryItem {
    const now = Date.now();

    // 检查是否已存在
    const existing = this._findItemUnsafe(atom.id);
    if (existing) {
      // 强化已有记忆
      return this._reinforceUnsafe(existing);
    }

    const item: TieredMemoryItem = {
      atom,
      tier: "working", // 新记忆默认进入工作记忆
      tierMeta: {
        enteredTierAt: now,
        tierAccessCount: 1,
        tierHistory: [],
        lastImportanceScore: this._calculateImportance(atom, now),
        lastImportanceCalcAt: now,
      },
      retention: {
        current: 1.0,
        calculatedAt: now,
        stabilityFactor: FORGETTING_STABILITY.WORKING_MEMORY,
      },
    };

    // 根据工作记忆容量决定是放入工作记忆还是降级到短期记忆
    if (this.workingMemory.size() < this.workingMemory.getStats().maxSize) {
      this.workingMemory.set(atom.id, item);
    } else {
      // 工作记忆已满，尝试降级最久未使用的到短期记忆，然后存入
      this._evictOldestFromWorkingMemory();
      this.workingMemory.set(atom.id, item);
    }

    log.debug(`✨ 新记忆摄入: ${atom.id.slice(0, 8)}... (工作记忆)`);
    return item;
  }

  private _retrieveUnsafe(
    query: string | Vector,
    options: {
      maxResults?: number;
      minSimilarity?: number;
      searchTiers?: MemoryTier[];
    },
  ): MemoryRetrievalResult[] {
    const {
      maxResults = 10,
      minSimilarity = 0.3,
      searchTiers = ["working", "short-term", "long-term"],
    } = options;

    const results: MemoryRetrievalResult[] = [];
    const queryVector = typeof query === "string" ? undefined : query;

    // 按优先级搜索各层级
    const tierPriority: MemoryTier[] = ["working", "short-term", "long-term"];
    let spreadDepth = 0;

    for (const tier of tierPriority) {
      if (!searchTiers.includes(tier)) continue;

      const memories = this._getMemoriesByTier(tier);
      for (const item of memories) {
        let similarity = 0;

        if (queryVector && queryVector.length > 0) {
          // 向量相似度计算
          similarity = this._calculateVectorSimilarity(queryVector, item.atom.embedding);
        } else {
          // 文本匹配 (简化版，实际应使用嵌入)
          similarity = item.atom.content.includes(query as string) ? 0.8 : 0;
        }

        // 考虑保留值作为权重
        const retrievalScore = similarity * item.retention.current;

        if (similarity >= minSimilarity) {
          results.push({
            item,
            retrievalScore,
            matchedTier: tier,
            spreadDepth,
          });
        }
      }

      spreadDepth++;
    }

    // 按检索分数排序
    results.sort((a, b) => b.retrievalScore - a.retrievalScore);

    // 更新访问统计
    for (const result of results.slice(0, maxResults)) {
      this._updateAccessStats(result.item);
    }

    return results.slice(0, maxResults);
  }

  private _accessUnsafe(atomId: string): TieredMemoryItem | null {
    const item = this._findItemUnsafe(atomId);
    if (!item) return null;

    // 更新访问统计
    this._updateAccessStats(item);

    // 更新原子本身的访问统计
    item.atom.temporal.lastAccessed = Date.now();
    item.atom.temporal.accessCount++;

    // 强化记忆
    item.atom.strength.reinforcement += 1;
    item.atom.strength.current = Math.min(
      1,
      item.atom.strength.base + item.atom.strength.reinforcement * 0.05,
    );

    // 如果被访问，考虑升级
    if (this.config.autoTierTransition && item.tier !== "working") {
      this._considerUpgrade(item);
    }

    return item;
  }

  private _moveToTierUnsafe(atomId: string, targetTier: MemoryTier, reason = "manual"): boolean {
    const item = this._findItemUnsafe(atomId);
    if (!item) return false;

    const sourceTier = item.tier;
    if (sourceTier === targetTier) return true;

    // 记录历史
    const now = Date.now();
    item.tierMeta.tierHistory.push({
      tier: sourceTier,
      enteredAt: item.tierMeta.enteredTierAt,
      leftAt: now,
    });

    // 从原层级移除
    this._removeFromTier(atomId, sourceTier);

    // 更新元数据
    item.tier = targetTier;
    item.tierMeta.enteredTierAt = now;
    item.tierMeta.tierAccessCount = 0;
    item.retention.stabilityFactor = FORGETTING_STABILITY[this._getStabilityKey(targetTier)];

    // 添加到新层级
    this._addToTier(item);

    // 触发事件
    const event: TierTransitionEvent = {
      atomId,
      fromTier: sourceTier,
      toTier: targetTier,
      reason,
      timestamp: now,
    };
    this._emitTransitionEvent(event);

    log.debug(
      `🔄 记忆层级迁移: ${atomId.slice(0, 8)}... ${sourceTier} → ${targetTier} (${reason})`,
    );
    return true;
  }

  private _getUnsafe(atomId: string): TieredMemoryItem | null {
    return this._findItemUnsafe(atomId);
  }

  private _deleteUnsafe(atomId: string): boolean {
    const item = this._findItemUnsafe(atomId);
    if (!item) return false;

    this._removeFromTier(atomId, item.tier);
    return true;
  }

  private _checkTierTransitionsUnsafe(): TierTransitionEvent[] {
    const events: TierTransitionEvent[] = [];
    const now = Date.now();

    // 检查工作记忆降级
    for (const item of this.workingMemory.values()) {
      const timeInTier = now - item.tierMeta.enteredTierAt;
      const shouldDemote =
        item.tierMeta.tierAccessCount < TIER_THRESHOLD_CONFIG.WM_TO_STM_ACCESS_THRESHOLD ||
        timeInTier > TIER_THRESHOLD_CONFIG.WM_TO_STM_TIME_THRESHOLD_MS;

      if (shouldDemote) {
        const success = this._moveToTierUnsafe(item.atom.id, "short-term", "low-activity");
        if (success) {
          events.push({
            atomId: item.atom.id,
            fromTier: "working",
            toTier: "short-term",
            reason: "low-activity",
            timestamp: now,
          });
        }
      }
    }

    // 检查短期记忆升级/降级
    for (const item of this.shortTermMemory.values()) {
      const timeInTier = now - item.tierMeta.enteredTierAt;

      // 检查是否应升级到工作记忆
      if (item.tierMeta.tierAccessCount >= TIER_THRESHOLD_CONFIG.STM_TO_WM_ACCESS_THRESHOLD) {
        const success = this._moveToTierUnsafe(item.atom.id, "working", "high-activity");
        if (success) {
          events.push({
            atomId: item.atom.id,
            fromTier: "short-term",
            toTier: "working",
            reason: "high-activity",
            timestamp: now,
          });
        }
        continue;
      }

      // 检查是否应升级到长期记忆
      if (
        timeInTier > TIER_THRESHOLD_CONFIG.STM_TO_LTM_TIME_THRESHOLD_MS &&
        item.atom.strength.current >= TIER_THRESHOLD_CONFIG.STM_TO_LTM_STRENGTH_THRESHOLD
      ) {
        const success = this._moveToTierUnsafe(item.atom.id, "long-term", "consolidated");
        if (success) {
          events.push({
            atomId: item.atom.id,
            fromTier: "short-term",
            toTier: "long-term",
            reason: "consolidated",
            timestamp: now,
          });
        }
      }
    }

    // 检查长期记忆升级
    for (const item of this.longTermMemory.values()) {
      if (item.tierMeta.tierAccessCount >= TIER_THRESHOLD_CONFIG.LTM_TO_STM_ACCESS_BURST) {
        const success = this._moveToTierUnsafe(item.atom.id, "short-term", "reactivated");
        if (success) {
          events.push({
            atomId: item.atom.id,
            fromTier: "long-term",
            toTier: "short-term",
            reason: "reactivated",
            timestamp: now,
          });
        }
      }
    }

    return events;
  }

  private _calculateAllRetentionUnsafe(): void {
    const now = Date.now();

    const calculateForTier = (
      items: Iterable<TieredMemoryItem>,
      stabilityKey: keyof typeof FORGETTING_STABILITY,
    ) => {
      for (const item of items) {
        const timeSinceCalc = (now - item.retention.calculatedAt) / (24 * 60 * 60 * 1000); // 转换为天
        const stability = FORGETTING_STABILITY[stabilityKey];

        // 艾宾浩斯遗忘曲线: R = e^(-t/S)
        const newRetention = exponentialDecay(item.retention.current, 1 / stability, timeSinceCalc);

        item.retention.current = Math.max(0, newRetention);
        item.retention.calculatedAt = now;

        // 检查是否应该被遗忘
        if (item.retention.current < this.config.minRetentionThreshold) {
          this._forgetItem(item);
        }
      }
    };

    calculateForTier(this.workingMemory.values(), "WORKING_MEMORY");
    calculateForTier(this.shortTermMemory.values(), "SHORT_TERM");
    calculateForTier(this.longTermMemory.values(), "LONG_TERM");
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  private _findItemUnsafe(atomId: string): TieredMemoryItem | null {
    return (
      this.workingMemory.get(atomId) ??
      this.shortTermMemory.get(atomId) ??
      this.longTermMemory.get(atomId) ??
      null
    );
  }

  private _getMemoriesByTier(tier: MemoryTier): TieredMemoryItem[] {
    switch (tier) {
      case "working":
        return this.workingMemory.values();
      case "short-term":
        return Array.from(this.shortTermMemory.values());
      case "long-term":
        return Array.from(this.longTermMemory.values());
      default:
        return [];
    }
  }

  private _removeFromTier(atomId: string, tier: MemoryTier): void {
    switch (tier) {
      case "working":
        this.workingMemory.delete(atomId);
        break;
      case "short-term":
        this.shortTermMemory.delete(atomId);
        break;
      case "long-term":
        this.longTermMemory.delete(atomId);
        break;
    }
  }

  private _addToTier(item: TieredMemoryItem): void {
    switch (item.tier) {
      case "working":
        this.workingMemory.set(item.atom.id, item);
        break;
      case "short-term":
        this.shortTermMemory.set(item.atom.id, item);
        break;
      case "long-term":
        this.longTermMemory.set(item.atom.id, item);
        break;
    }
  }

  private _evictOldestFromWorkingMemory(): void {
    const stats = this.workingMemory.getStats();
    if (stats.size < stats.maxSize) return;

    // LRU 缓存会自动淘汰，但我们主动降级
    const keys = this.workingMemory.keys();
    const oldestKey = keys[keys.length - 1];
    if (oldestKey) {
      const item = this.workingMemory.get(oldestKey);
      if (item) {
        this._moveToTierUnsafe(oldestKey, "short-term", "lru-eviction");
      }
    }
  }

  private _reinforceUnsafe(item: TieredMemoryItem): TieredMemoryItem {
    item.atom.strength.reinforcement += 1;
    item.atom.strength.current = Math.min(
      1,
      item.atom.strength.base + item.atom.strength.reinforcement * 0.1,
    );
    item.atom.temporal.lastAccessed = Date.now();
    item.atom.temporal.accessCount++;

    // 更新保留值
    item.retention.current = Math.min(1, item.retention.current + 0.1);

    return item;
  }

  private _updateAccessStats(item: TieredMemoryItem): void {
    item.tierMeta.tierAccessCount++;

    // 定期重新计算重要性
    const now = Date.now();
    if (now - item.tierMeta.lastImportanceCalcAt > 60 * 1000) {
      item.tierMeta.lastImportanceScore = this._calculateImportance(item.atom, now);
      item.tierMeta.lastImportanceCalcAt = now;
    }
  }

  private _considerUpgrade(item: TieredMemoryItem): void {
    const now = Date.now();
    const timeInTier = now - item.tierMeta.enteredTierAt;

    if (item.tier === "short-term") {
      if (item.tierMeta.tierAccessCount >= TIER_THRESHOLD_CONFIG.STM_TO_WM_ACCESS_THRESHOLD) {
        this._moveToTierUnsafe(item.atom.id, "working", "access-burst");
      }
    } else if (item.tier === "long-term") {
      if (
        item.tierMeta.tierAccessCount >= TIER_THRESHOLD_CONFIG.LTM_TO_STM_ACCESS_BURST ||
        timeInTier < TIME_WINDOW_CONFIG.SHORT_TERM_MS
      ) {
        this._moveToTierUnsafe(item.atom.id, "short-term", "reactivated");
      }
    }
  }

  private _forgetItem(item: TieredMemoryItem): void {
    this._removeFromTier(item.atom.id, item.tier);
    this.forgottenMemories.push({
      id: item.atom.id,
      forgottenAt: Date.now(),
      finalRetention: item.retention.current,
    });
    console.log(
      `🌙 记忆被遗忘: ${item.atom.id.slice(0, 8)}... (保留值: ${item.retention.current.toFixed(3)})`,
    );
  }

  private _calculateImportance(atom: MemAtom, now: number): number {
    const baseImportance = atom.strength.base;
    const frequency = Math.min(1, atom.temporal.accessCount / 100); // 归一化到 0-1
    const recency = Math.max(
      0,
      1 - (now - atom.temporal.lastAccessed) / TIME_WINDOW_CONFIG.SHORT_TERM_MS,
    );
    const freshness = Math.max(
      0,
      1 - (now - atom.temporal.created) / TIME_WINDOW_CONFIG.LONG_TERM_MS,
    );

    return (
      IMPORTANCE_WEIGHTS.BASE_IMPORTANCE * baseImportance +
      IMPORTANCE_WEIGHTS.FREQUENCY * frequency +
      IMPORTANCE_WEIGHTS.RECENCY * recency +
      IMPORTANCE_WEIGHTS.FRESHNESS * freshness
    );
  }

  private _calculateVectorSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator < 1e-10) return 0;

    return dotProduct / denominator;
  }

  private _getStabilityKey(tier: MemoryTier): keyof typeof FORGETTING_STABILITY {
    switch (tier) {
      case "working":
        return "WORKING_MEMORY";
      case "short-term":
        return "SHORT_TERM";
      case "long-term":
        return "LONG_TERM";
    }
  }

  // ========================================================================
  // 并发锁机制 (与 NSEM2Core 相同)
  // ========================================================================

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

    const newLock = this.operationLock.catch(() => undefined).then(() => acquireLock());

    this.operationLock = newLock.then(
      () => undefined,
      () => undefined,
    );

    return newLock;
  }

  // ========================================================================
  // 定时任务
  // ========================================================================

  private startTierTransitionMonitoring(): void {
    this.upgradeCheckTimer = setInterval(() => {
      this.checkTierTransitions().catch((err) => {
        console.error("升降级检查失败:", err);
      });
    }, this.config.upgradeCheckIntervalMs);
  }

  private startDecayMonitoring(): void {
    this.decayCalculationTimer = setInterval(() => {
      this.calculateAllRetention().catch((err) => {
        console.error("保留值计算失败:", err);
      });
    }, this.config.decayCalculationIntervalMs);
  }

  // ========================================================================
  // 事件系统
  // ========================================================================

  private _emitTransitionEvent(event: TierTransitionEvent): void {
    for (const listener of this.transitionListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("层级迁移事件监听器错误:", err);
      }
    }
  }

  onTransition(listener: (event: TierTransitionEvent) => void): () => void {
    this.transitionListeners.push(listener);
    return () => {
      const index = this.transitionListeners.indexOf(listener);
      if (index > -1) {
        this.transitionListeners.splice(index, 1);
      }
    };
  }

  // ========================================================================
  // 统计与查询
  // ========================================================================

  /**
   * 获取存储统计
   */
  getStats(): ThreeTierMemoryStats {
    const calcAvg = (values: number[]) => {
      if (values.length === 0) return 0;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    const now = Date.now();

    const workingItems = this.workingMemory.values();
    const shortTermItems = Array.from(this.shortTermMemory.values());
    const longTermItems = Array.from(this.longTermMemory.values());

    return {
      working: {
        count: workingItems.length,
        capacity: this.workingMemory.getStats().maxSize,
        avgImportance: calcAvg(workingItems.map((i) => i.tierMeta.lastImportanceScore)),
        avgRetention: calcAvg(workingItems.map((i) => i.retention.current)),
      },
      shortTerm: {
        count: shortTermItems.length,
        avgAgeMs: calcAvg(shortTermItems.map((i) => now - i.tierMeta.enteredTierAt)),
        avgRetention: calcAvg(shortTermItems.map((i) => i.retention.current)),
      },
      longTerm: {
        count: longTermItems.length,
        avgAgeMs: calcAvg(longTermItems.map((i) => now - i.tierMeta.enteredTierAt)),
        avgRetention: calcAvg(longTermItems.map((i) => i.retention.current)),
      },
      total: {
        memories: workingItems.length + shortTermItems.length + longTermItems.length,
        avgImportance: calcAvg([
          ...workingItems.map((i) => i.tierMeta.lastImportanceScore),
          ...shortTermItems.map((i) => i.tierMeta.lastImportanceScore),
          ...longTermItems.map((i) => i.tierMeta.lastImportanceScore),
        ]),
        forgottenCount: this.forgottenMemories.length,
      },
    };
  }

  /**
   * 获取指定层级的所有记忆
   */
  getMemoriesByTier(tier: MemoryTier): TieredMemoryItem[] {
    return this._getMemoriesByTier(tier);
  }

  /**
   * 获取所有记忆
   */
  getAllMemories(): TieredMemoryItem[] {
    return [
      ...this.workingMemory.values(),
      ...Array.from(this.shortTermMemory.values()),
      ...Array.from(this.longTermMemory.values()),
    ];
  }

  /**
   * 检查记忆是否存在
   */
  has(atomId: string): boolean {
    return this._findItemUnsafe(atomId) !== null;
  }

  /**
   * 获取记忆当前层级
   */
  getMemoryTier(atomId: string): MemoryTier | null {
    const item = this._findItemUnsafe(atomId);
    return item?.tier ?? null;
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.workingMemory.clear();
    this.shortTermMemory.clear();
    this.longTermMemory.clear();
    this.forgottenMemories = [];
  }
}

// ============================================================================
// 类型导出
// ============================================================================

export type { MemAtom } from "../types/index.js";

// ============================================================================
// 单例管理
// ============================================================================

let globalStore: ThreeTierMemoryStore | null = null;

/**
 * 创建三层记忆存储 (测试兼容的工厂函数)
 */
export function createThreeTierMemoryStore(config?: {
  workingCapacity?: number;
  shortTermCapacity?: number;
  longTermCapacity?: number;
  autoTierTransition?: boolean;
}): ThreeTierMemoryStore {
  return new ThreeTierMemoryStore({
    workingMemoryCapacity: config?.workingCapacity,
    autoTierTransition: config?.autoTierTransition ?? true,
  });
}

export function getThreeTierMemoryStore(
  config?: Partial<ThreeTierMemoryConfig>,
): ThreeTierMemoryStore {
  if (!globalStore) {
    globalStore = new ThreeTierMemoryStore(config);
  }
  return globalStore;
}

export function resetThreeTierMemoryStore(): void {
  globalStore?.stop();
  globalStore = null;
}

export function setGlobalThreeTierMemoryStore(store: ThreeTierMemoryStore): void {
  globalStore?.stop();
  globalStore = store;
}
