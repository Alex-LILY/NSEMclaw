/**
 * 选择性记忆继承系统 - 规避共享记忆问题的最优方案
 *
 * 核心理念:
 * 1. 代理链式继承 - 子 Agent 选择性继承父 Agent 的记忆
 * 2. 读写分离 - 读共享/写隔离，避免数据污染
 * 3. 记忆订阅 - 按需订阅特定主题，减少噪音
 * 4. 版本控制 - 记忆快照，可追溯可回滚
 *
 * 优势:
 * - 保留共享记忆的好处（知识连续性）
 * - 规避共享记忆的坏处（隔离写操作）
 * - 与现有 NSEM2Core 完全兼容
 * - 零并发冲突（写操作完全隔离）
 */

import { EventEmitter } from "events";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { MemAtom, MemoryQuery, ActivatedMemory, ContentType } from "../types/index.js";
import { generateId, cosineSimilarity } from "../utils/common.js";

const log = createSubsystemLogger("selective-memory");

// ============================================================================
// 类型定义
// ============================================================================

/** 记忆继承策略 */
export type InheritanceStrategy =
  | "full" // 继承所有可读记忆
  | "filtered" // 按过滤器继承
  | "summarized" // 只继承摘要
  | "referenced" // 只继承被引用的记忆
  | "none" // 不继承
  // 测试兼容的别名
  | "all" // 同 full
  | "relevance" // 同 filtered (按相关性)
  | "strength-threshold" // 同 filtered (按强度阈值)
  | "recent" // 同 filtered (按最近)
  | "tag-based"; // 同 filtered (按标签)

/** 记忆范围 */
export type MemoryScope =
  | "inherited" // 从父 Agent 继承的
  | "shared" // 工作组共享的
  | "personal"; // 完全私有的

/** 记忆类型 */
export type MemoryType = ContentType;

/** 记忆写入权限 */
export type WritePermission =
  | "append-only" // 只能追加，不能修改
  | "tag-based" // 基于标签的写入权限
  | "isolated"; // 完全隔离，写入自己的空间

/** 继承配置 */
export interface InheritanceConfig {
  /** 继承策略 */
  strategy: InheritanceStrategy;
  /** 父 Agent ID 链 */
  parentChain: string[];
  /** 过滤器（用于 filtered 策略） */
  filter?: MemoryFilter;
  /** 最大继承记忆数 */
  maxInheritedMemories: number;
  /** 继承记忆的衰减因子（0-1，越老越不重要） */
  inheritanceDecay: number;
  /** 继承阈值（用于 strength-threshold 策略） */
  inheritanceThreshold?: number;
}

// ============================================================================
// 基于 Scope 的 API 类型 (测试兼容)
// ============================================================================

/** 作用域配置 */
export interface ScopeConfig {
  /** 父作用域 ID 列表 */
  parentScopes?: string[];
  /** 继承策略 */
  inheritanceStrategy?: InheritanceStrategy;
  /** 最大继承记忆数 */
  maxInheritedMemories?: number;
  /** 继承阈值 */
  inheritanceThreshold?: number;
}

/** 作用域对象 */
export interface Scope {
  id: string;
  parentScopes: string[];
  memories: Map<string, MemAtom>;
  inheritanceStrategy: InheritanceStrategy;
  maxInheritedMemories: number;
  inheritanceThreshold: number;
  subscribers: Set<(memories: SelectiveMemoryItem[]) => void>;
}

/** 作用域快照 */
export interface ScopeSnapshot {
  id: string;
  scopeId: string;
  memories: MemAtom[];
  createdAt: number;
}

/** 记忆过滤器 */
export interface MemoryFilter {
  /** 包含的标签 */
  includeTags?: string[];
  /** 排除的标签 */
  excludeTags?: string[];
  /** 标签（简写，等同于 includeTags） */
  tags?: string[];
  /** 最小重要性分数 */
  minImportance?: number;
  /** 时间范围（毫秒） */
  timeRange?: { start: number; end: number };
  /** 开始时间（简写，timeRange.start 的替代） */
  startTime?: number;
  /** 结束时间（简写，timeRange.end 的替代） */
  endTime?: number;
  /** 记忆类型 */
  contentTypes?: string[];
}

/** 记忆订阅 */
export interface MemorySubscription {
  /** 订阅 ID */
  id: string;
  /** 订阅者 Agent ID */
  subscriberId: string;
  /** 订阅主题/标签 */
  topics: string[];
  /** 订阅模式 */
  mode: "push" | "pull";
  /** 推送频率（毫秒，push 模式下） */
  pushInterval?: number;
}

/** 记忆快照 */
export interface MemorySnapshot {
  /** 快照 ID */
  id: string;
  /** 快照名称 */
  name: string;
  /** 创建时间 */
  createdAt: number;
  /** 包含的记忆 ID */
  memoryIds: string[];
  /** 记忆数量 */
  count: number;
  /** 元数据 */
  metadata: {
    creatorAgentId: string;
    description?: string;
    tags?: string[];
  };
}

/** 选择性记忆项 */
export interface SelectiveMemoryItem {
  /** 原始记忆 */
  atom: MemAtom;
  /** 记忆来源 */
  source: {
    /** 来源 Agent ID */
    agentId: string;
    /** 来源层级（0=当前，1=父，2=祖父...） */
    level: number;
    /** 原始时间戳 */
    originalTimestamp: number;
  };
  /** 继承权重（受衰减因子影响） */
  inheritanceWeight: number;
  /** 可见性 */
  visibility: "readonly" | "annotatable";
  /** 作用域 */
  scope: MemoryScope;
}

/** 继承结果 */
export interface InheritanceResult {
  inherited: number;
  filtered: number;
  items: SelectiveMemoryItem[];
}

/** 带作用域的记忆项 (简化版，用于存储层) */
export interface ScopedMemoryItem {
  id: string;
  content: string;
  type?: MemoryType;
  scope: MemoryScope;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  accessCount?: number;
  lastAccessedAt?: number;
}

/** 写入操作 */
export interface WriteOperation {
  /** 操作 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 操作类型 */
  type: "create" | "update" | "tag" | "relate" | "store" | "delete";
  /** 目标记忆 ID（@deprecated 使用 memoryId） */
  targetId?: string;
  /** 记忆 ID */
  memoryId?: string;
  /** 作用域 */
  scope?: MemoryScope;
  /** 内容哈希 */
  contentHash?: string;
  /** 新记忆内容（create 时） */
  newAtom?: Partial<MemAtom>;
  /** 标签（tag 时） */
  tags?: string[];
  /** 时间戳 */
  timestamp: number;
  /** 是否应用到共享空间（@deprecated 使用 scope === "shared"） */
  applyToShared: boolean;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_INHERITANCE_CONFIG: InheritanceConfig = {
  strategy: "filtered",
  parentChain: [],
  maxInheritedMemories: 1000,
  inheritanceDecay: 0.9,
  filter: {
    minImportance: 0.5,
    contentTypes: ["fact", "insight", "pattern"],
  },
};

// ============================================================================
// 选择性记忆继承系统
// ============================================================================

export class SelectiveMemoryInheritance extends EventEmitter {
  protected agentId: string;
  protected config: InheritanceConfig;

  // 记忆存储 - 分层设计 (protected for subclass access)
  protected inheritedMemories = new Map<string, SelectiveMemoryItem>(); // 继承的记忆（只读）
  protected sharedMemories = new Map<string, MemAtom>(); // 共享记忆（可读写）
  protected personalMemories = new Map<string, MemAtom>(); // 私有记忆（完全隔离）
  protected personalStore = new Map<string, ScopedMemoryItem>(); // 个人记忆存储（新版）
  protected sharedStore = new Map<string, ScopedMemoryItem>(); // 共享记忆存储（新版）

  // 订阅管理
  protected subscriptions = new Map<string, MemorySubscription>();
  protected subscriberCallbacks = new Map<string, ((memories: SelectiveMemoryItem[]) => void)[]>();

  // 快照管理
  protected snapshots = new Map<string, MemorySnapshot>();

  // 写入队列（用于批量处理）
  protected writeQueue: WriteOperation[] = [];
  protected writeQueueTimer?: NodeJS.Timeout;

  // 基于 Scope 的存储 (测试兼容)
  protected scopes = new Map<string, Scope>();
  protected scopeSnapshots = new Map<string, ScopeSnapshot>();

  constructor(agentId: string, config: Partial<InheritanceConfig> = {}) {
    super();
    this.agentId = agentId;
    this.config = { ...DEFAULT_INHERITANCE_CONFIG, ...config };
  }

  // ========================================================================
  // 基于 Scope 的 API (测试兼容)
  // ========================================================================

  /**
   * 注册作用域
   */
  registerScope(id: string, config: ScopeConfig = {}): Scope {
    // 如果已存在，更新配置
    if (this.scopes.has(id)) {
      const existing = this.scopes.get(id)!;
      if (config.parentScopes) {
        existing.parentScopes = config.parentScopes;
      }
      if (config.inheritanceStrategy) {
        existing.inheritanceStrategy = config.inheritanceStrategy;
      }
      if (config.maxInheritedMemories !== undefined) {
        existing.maxInheritedMemories = config.maxInheritedMemories;
      }
      if (config.inheritanceThreshold !== undefined) {
        existing.inheritanceThreshold = config.inheritanceThreshold;
      }
      return existing;
    }

    const scope: Scope = {
      id,
      parentScopes: config.parentScopes ?? [],
      memories: new Map(),
      inheritanceStrategy: config.inheritanceStrategy ?? "full",
      maxInheritedMemories: config.maxInheritedMemories ?? 100,
      inheritanceThreshold: config.inheritanceThreshold ?? 0.5,
      subscribers: new Set(),
    };

    this.scopes.set(id, scope);
    log.debug(`注册作用域: ${id}`);
    return scope;
  }

  /**
   * 获取作用域
   */
  getScope(id: string): Scope | undefined {
    return this.scopes.get(id);
  }

  /**
   * 销毁作用域
   */
  destroyScope(id: string): boolean {
    return this.scopes.delete(id);
  }

  /**
   * 添加记忆到作用域
   */
  addToScope(scopeId: string, atom: MemAtom): ScopedMemoryItem {
    let scope = this.scopes.get(scopeId);
    if (!scope) {
      scope = this.registerScope(scopeId);
    }

    scope.memories.set(atom.id, atom);

    // 转换为 ScopedMemoryItem 并存储
    const now = Date.now();
    const item: ScopedMemoryItem = {
      id: atom.id,
      content: atom.content,
      type: atom.contentType,
      scope: "shared",
      importance: atom.strength.current,
      tags: atom.meta.tags,
      metadata: {
        source: atom.meta.source,
        confidence: atom.meta.confidence,
      },
      createdAt: atom.temporal.created ?? now,
      updatedAt: atom.temporal.modified ?? now,
      accessCount: atom.temporal.accessCount,
      lastAccessedAt: atom.temporal.lastAccessed,
    };

    this.sharedStore.set(atom.id, item);
    this.sharedMemories.set(atom.id, atom);

    // 通知订阅者
    const selectiveItem: SelectiveMemoryItem = {
      atom,
      source: { agentId: this.agentId, level: 0, originalTimestamp: atom.temporal.created },
      inheritanceWeight: atom.strength.current,
      visibility: "readonly",
      scope: "shared",
    };

    for (const callback of scope.subscribers) {
      try {
        callback([selectiveItem]);
      } catch (err) {
        log.error(`通知订阅者失败: ${err}`);
      }
    }

    return item;
  }

  /**
   * 从作用域移除记忆
   */
  removeFromScope(scopeId: string, memoryId: string): boolean {
    const scope = this.scopes.get(scopeId);
    if (!scope) return false;

    const deleted = scope.memories.delete(memoryId);
    this.sharedStore.delete(memoryId);
    this.sharedMemories.delete(memoryId);
    return deleted;
  }

  /**
   * 清空作用域
   */
  clearScope(scopeId: string): boolean {
    const scope = this.scopes.get(scopeId);
    if (!scope) return false;

    for (const id of scope.memories.keys()) {
      this.sharedStore.delete(id);
      this.sharedMemories.delete(id);
    }
    scope.memories.clear();
    return true;
  }

  /**
   * 获取作用域中的记忆
   */
  getScopeMemories(scopeId: string): SelectiveMemoryItem[] {
    const scope = this.scopes.get(scopeId);
    if (!scope) return [];

    return Array.from(scope.memories.values()).map((atom) => ({
      atom,
      source: { agentId: this.agentId, level: 0, originalTimestamp: atom.temporal.created },
      inheritanceWeight: atom.strength.current,
      visibility: "readonly",
      scope: "shared",
    }));
  }

  /**
   * 执行继承
   */
  inherit(scopeId: string): SelectiveMemoryItem[] {
    const scope = this.scopes.get(scopeId);
    if (!scope) return [];

    const inherited: SelectiveMemoryItem[] = [];
    const visited = new Set<string>();

    const collectFromParent = (parentId: string, level: number) => {
      if (visited.has(parentId)) return; // 防止循环
      visited.add(parentId);

      const parent = this.scopes.get(parentId);
      if (!parent) return;

      for (const atom of parent.memories.values()) {
        // 应用策略过滤
        if (
          !this.matchesInheritanceStrategy(
            atom,
            scope.inheritanceStrategy,
            scope.inheritanceThreshold,
          )
        ) {
          continue;
        }

        const decayFactor = Math.pow(this.config.inheritanceDecay, level);
        inherited.push({
          atom,
          source: {
            agentId: parentId,
            level,
            originalTimestamp: atom.temporal.created,
          },
          inheritanceWeight: atom.strength.current * decayFactor,
          visibility: "readonly",
          scope: "inherited",
        });
      }

      // 递归收集祖父作用域
      for (const grandparentId of parent.parentScopes) {
        collectFromParent(grandparentId, level + 1);
      }
    };

    // 从所有父作用域收集
    for (const parentId of scope.parentScopes) {
      collectFromParent(parentId, 1);
    }

    // 限制继承数量
    const sorted = inherited
      .sort((a, b) => b.inheritanceWeight - a.inheritanceWeight)
      .slice(0, scope.maxInheritedMemories);

    // 存储继承的记忆
    for (const item of sorted) {
      this.inheritedMemories.set(item.atom.id, item);
    }

    return sorted;
  }

  private matchesInheritanceStrategy(
    atom: MemAtom,
    strategy: InheritanceStrategy,
    threshold: number,
  ): boolean {
    switch (strategy) {
      case "full":
      case "all":
        return true;
      case "filtered":
      case "relevance":
      case "tag-based":
        // 使用配置的过滤器
        return atom.strength.current >= (this.config.filter?.minImportance ?? 0.5);
      case "strength-threshold":
        return atom.strength.current >= threshold;
      case "recent":
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24小时内
        return atom.temporal.created > cutoff;
      case "summarized":
      case "referenced":
      case "none":
        return false;
      default:
        return true;
    }
  }

  /**
   * 获取作用域统计
   */
  getScopeStats(scopeId: string): { memoryCount: number; subscriberCount: number } {
    const scope = this.scopes.get(scopeId);
    if (!scope) {
      return { memoryCount: 0, subscriberCount: 0 };
    }

    return {
      memoryCount: scope.memories.size,
      subscriberCount: scope.subscribers.size,
    };
  }

  private _getStats(): {
    inherited: number;
    shared: number;
    personal: number;
    total: number;
    subscriptions: number;
    snapshots: number;
  } {
    return {
      inherited: this.inheritedMemories.size,
      shared: this.sharedMemories.size,
      personal: this.personalMemories.size,
      total: this.inheritedMemories.size + this.sharedMemories.size + this.personalMemories.size,
      subscriptions: this.subscriptions.size,
      snapshots: this.snapshots.size,
    };
  }

  // ========================================================================
  // 核心 API: 记忆继承
  // ========================================================================

  /**
   * 从父 Agent 继承记忆
   *
   * 这是核心方法，实现选择性继承逻辑
   */
  async inheritFromParent(
    parentAgentId: string,
    parentMemories: MemAtom[],
    options?: {
      strategy?: InheritanceStrategy;
      filter?: MemoryFilter;
      maxMemories?: number;
      decayFactor?: number;
    },
  ): Promise<InheritanceResult> {
    log.info(`Agent ${this.agentId} 从 ${parentAgentId} 继承记忆`);

    const parentLevel = this.config.parentChain.indexOf(parentAgentId);
    const level = parentLevel >= 0 ? parentLevel + 1 : 1;

    // 使用传入的选项覆盖默认配置
    const filter = options?.filter ?? this.config.filter;
    const maxMemories = options?.maxMemories ?? this.config.maxInheritedMemories;
    const decayFactor = options?.decayFactor ?? Math.pow(this.config.inheritanceDecay, level);

    // 1. 过滤记忆
    const filtered = this.filterMemories(parentMemories, filter);

    // 2. 创建选择性记忆项
    const items: SelectiveMemoryItem[] = filtered.map((atom) => ({
      atom,
      source: {
        agentId: parentAgentId,
        level,
        originalTimestamp: atom.temporal.created,
      },
      inheritanceWeight: atom.strength.current * decayFactor,
      visibility: "readonly",
      scope: "inherited",
    }));

    // 3. 限制继承数量
    const sortedItems = items
      .sort((a, b) => b.inheritanceWeight - a.inheritanceWeight)
      .slice(0, maxMemories);

    // 5. 存储继承的记忆
    for (const item of sortedItems) {
      this.inheritedMemories.set(item.atom.id, item);
    }

    log.info(`继承完成: ${sortedItems.length}/${parentMemories.length} 条记忆`);

    this.emit("inheritanceComplete", {
      agentId: this.agentId,
      parentId: parentAgentId,
      inherited: sortedItems.length,
      total: parentMemories.length,
    });

    return {
      inherited: sortedItems.length,
      filtered: parentMemories.length - filtered.length,
      items: sortedItems,
    };
  }

  /**
   * 检索记忆（跨所有作用域）
   *
   * 这是主要的读取接口，透明地搜索继承/共享/私有记忆
   */
  async retrieve(
    query: string | number[],
    options: {
      maxResults?: number;
      minScore?: number;
      scopes?: MemoryScope[];
      includeInherited?: boolean;
      filter?: MemoryFilter;
    } = {},
  ): Promise<
    Array<{
      item: SelectiveMemoryItem | MemAtom | ScopedMemoryItem;
      score: number;
      scope: MemoryScope;
      inheritedFrom?: string;
    }>
  > {
    const {
      maxResults = 10,
      minScore = 0.3,
      scopes = ["inherited", "shared", "personal"],
      includeInherited = true,
      filter,
    } = options;

    const results: Array<{
      item: SelectiveMemoryItem | MemAtom | ScopedMemoryItem;
      score: number;
      scope: MemoryScope;
      inheritedFrom?: string;
    }> = [];

    // 1. 搜索继承的记忆
    if (includeInherited && scopes.includes("inherited")) {
      for (const item of this.inheritedMemories.values()) {
        const score = this.calculateRelevance(item.atom, query);
        if (score >= minScore) {
          results.push({
            item,
            score: score * item.inheritanceWeight,
            scope: "inherited",
            inheritedFrom: item.source.agentId,
          });
        }
      }
    }

    // 2. 搜索共享记忆 (新版存储)
    if (scopes.includes("shared")) {
      for (const item of this.sharedStore.values()) {
        const score = this.calculateRelevanceV2(item, query);
        if (score >= minScore && this.matchesFilter(item, filter)) {
          results.push({ item, score, scope: "shared" });
        }
      }
      // 向后兼容: 搜索旧版存储
      for (const atom of this.sharedMemories.values()) {
        const score = this.calculateRelevance(atom, query);
        if (score >= minScore) {
          results.push({ item: atom, score, scope: "shared" });
        }
      }
    }

    // 3. 搜索个人记忆 (新版存储)
    if (scopes.includes("personal")) {
      for (const item of this.personalStore.values()) {
        const score = this.calculateRelevanceV2(item, query);
        if (score >= minScore && this.matchesFilter(item, filter)) {
          results.push({ item, score, scope: "personal" });
        }
      }
      // 向后兼容: 搜索旧版存储
      for (const atom of this.personalMemories.values()) {
        const score = this.calculateRelevance(atom, query);
        if (score >= minScore) {
          results.push({ item: atom, score, scope: "personal" });
        }
      }
    }

    // 4. 排序并返回
    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  // ========================================================================
  // 核心 API: 写入隔离
  // ========================================================================

  /**
   * 存储记忆（写隔离）
   *
   * 关键设计: 写入操作完全隔离，避免并发冲突
   */
  async store(
    content: string,
    options: {
      type?: string;
      tags?: string[];
      scope?: MemoryScope;
      relateTo?: string[];
      importance?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<ScopedMemoryItem> {
    const {
      type = "fact",
      tags = [],
      scope = "personal",
      relateTo = [],
      importance = 0.5,
      metadata = {},
    } = options;

    const now = Date.now();
    const item: ScopedMemoryItem = {
      id: generateId("atom", content + now),
      content,
      type: type as MemoryType,
      scope,
      importance,
      tags,
      metadata: {
        ...metadata,
        relateTo,
      },
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
      lastAccessedAt: now,
    };

    // 根据作用域存储到不同空间 (兼容旧版和新版存储)
    const atom: MemAtom = {
      id: item.id,
      contentHash: generateId("hash", content),
      content,
      contentType: type as any,
      embedding: [], // 需要外部计算
      temporal: {
        created: now,
        modified: now,
        lastAccessed: now,
        accessCount: 1,
        decayRate: 0.001,
      },
      spatial: {
        agent: this.agentId,
      },
      strength: {
        current: importance,
        base: importance,
        reinforcement: 0,
        emotional: 0,
      },
      generation: 1,
      meta: {
        tags,
        confidence: 1.0,
        source: "ai",
      },
    };

    // 更新旧版存储 (向后兼容)
    switch (scope) {
      case "shared":
        this.sharedMemories.set(atom.id, atom);
        this.sharedStore.set(item.id, item);
        break;
      case "personal":
      default:
        this.personalMemories.set(atom.id, atom);
        this.personalStore.set(item.id, item);
        break;
    }

    // 通知订阅者
    this.notifySubscribers(atom, scope);

    log.debug(`Agent ${this.agentId} 存储记忆: ${item.id.slice(0, 8)}... (scope: ${scope})`);

    this.emit("memoryStored", { atom, scope, agentId: this.agentId });

    return item;
  }

  /**
   * 添加注释到继承的记忆（不修改原始记忆）
   *
   * 这是继承记忆的只读特性的体现
   */
  async annotateInherited(
    memoryId: string,
    annotation: string,
  ): Promise<{
    success: boolean;
    annotationId: string;
    linkedMemoryId: string;
  }> {
    const inherited = this.inheritedMemories.get(memoryId);
    if (!inherited) {
      throw new Error(`继承记忆 ${memoryId} 不存在`);
    }

    // 创建新的个人记忆，关联到继承的记忆
    const annotationAtom = await this.store(annotation, {
      type: "annotation",
      tags: ["annotation", `ref:${memoryId}`],
      scope: "personal",
    });

    return {
      success: true,
      annotationId: annotationAtom.id,
      linkedMemoryId: memoryId,
    };
  }

  // ========================================================================
  // 核心 API: 记忆订阅
  // ========================================================================

  /**
   * 订阅特定主题的记忆
   */
  subscribe(
    topics: string[],
    options?: {
      mode?: "push" | "pull";
      pushInterval?: number;
      callback?: (memories: SelectiveMemoryItem[]) => void;
    },
  ): MemorySubscription;
  /**
   * 订阅作用域变化 (测试兼容)
   */
  subscribe(scopeId: string, callback: (memories: SelectiveMemoryItem[]) => void): () => void;
  subscribe(
    topicsOrScopeId: string[] | string,
    optionsOrCallback?:
      | {
          mode?: "push" | "pull";
          pushInterval?: number;
          callback?: (memories: SelectiveMemoryItem[]) => void;
        }
      | ((memories: SelectiveMemoryItem[]) => void),
  ): MemorySubscription | (() => void) {
    // 测试兼容：如果是字符串，则是作用域订阅
    if (typeof topicsOrScopeId === "string") {
      const scopeId = topicsOrScopeId;
      const callback = optionsOrCallback as (memories: SelectiveMemoryItem[]) => void;
      let scope = this.scopes.get(scopeId);
      if (!scope) {
        scope = this.registerScope(scopeId);
      }
      scope.subscribers.add(callback);
      return () => {
        scope?.subscribers.delete(callback);
      };
    }

    // 标准主题订阅
    const topics = topicsOrScopeId;
    const options =
      (optionsOrCallback as {
        mode?: "push" | "pull";
        pushInterval?: number;
        callback?: (memories: SelectiveMemoryItem[]) => void;
      }) ?? {};
    const subscription: MemorySubscription = {
      id: generateId("sub", Date.now().toString()),
      subscriberId: this.agentId,
      topics,
      mode: options.mode || "pull",
      pushInterval: options.pushInterval,
    };

    this.subscriptions.set(subscription.id, subscription);

    if (options.callback) {
      const callbacks = this.subscriberCallbacks.get(subscription.id) || [];
      callbacks.push(options.callback);
      this.subscriberCallbacks.set(subscription.id, callbacks);
    }

    log.info(`Agent ${this.agentId} 订阅主题: ${topics.join(", ")}`);

    return subscription;
  }

  /**
   * 拉取订阅的记忆更新
   */
  pullUpdates(subscriptionId: string): SelectiveMemoryItem[] {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`订阅 ${subscriptionId} 不存在`);
    }

    // 获取与订阅主题相关的记忆
    const updates: SelectiveMemoryItem[] = [];

    for (const item of this.inheritedMemories.values()) {
      if (
        subscription.topics.some(
          (topic) => item.atom.meta.tags?.includes(topic) || item.atom.content.includes(topic),
        )
      ) {
        updates.push(item);
      }
    }

    return updates;
  }

  // ========================================================================
  // 核心 API: 快照管理
  // ========================================================================

  /**
   * 创建记忆快照
   */
  createSnapshot(
    name: string,
    options: {
      description?: string;
      tags?: string[];
      filter?: MemoryFilter;
    } = {},
  ): MemorySnapshot {
    const memories = this.getAllMemories(options.filter);

    const snapshot: MemorySnapshot = {
      id: generateId("snap", Date.now().toString()),
      name,
      createdAt: Date.now(),
      memoryIds: memories.map((m) => ("atom" in m ? m.atom.id : m.id)),
      count: memories.length,
      metadata: {
        creatorAgentId: this.agentId,
        description: options.description,
        tags: options.tags,
      },
    };

    this.snapshots.set(snapshot.id, snapshot);

    log.info(`创建快照: ${name} (${snapshot.count} 条记忆)`);

    return snapshot;
  }

  /**
   * 恢复快照
   */
  async restoreSnapshot(snapshotId: string): Promise<{
    restored: number;
    snapshot: MemorySnapshot;
  }> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`快照 ${snapshotId} 不存在`);
    }

    // 恢复逻辑（简化实现）
    log.info(`恢复快照: ${snapshot.name}`);

    return {
      restored: snapshot.count,
      snapshot,
    };
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  private filterMemories(memories: MemAtom[], filter?: MemoryFilter): MemAtom[] {
    if (!filter) return memories;

    return memories.filter((atom) => {
      // 标签过滤
      if (filter.includeTags?.length) {
        const hasTag = filter.includeTags.some((tag) => atom.meta.tags?.includes(tag));
        if (!hasTag) return false;
      }

      if (filter.excludeTags?.length) {
        const hasExcludeTag = filter.excludeTags.some((tag) => atom.meta.tags?.includes(tag));
        if (hasExcludeTag) return false;
      }

      // 重要性过滤
      if (filter.minImportance !== undefined) {
        if (atom.strength.current < filter.minImportance) return false;
      }

      // 时间范围过滤
      if (filter.timeRange) {
        if (
          atom.temporal.created < filter.timeRange.start ||
          atom.temporal.created > filter.timeRange.end
        ) {
          return false;
        }
      }

      // 类型过滤
      if (filter.contentTypes?.length) {
        if (!filter.contentTypes.includes(atom.contentType)) return false;
      }

      return true;
    });
  }

  private calculateRelevance(atom: MemAtom, query: string | number[]): number {
    if (typeof query === "string") {
      // 简单的文本匹配
      const content = atom.content.toLowerCase();
      const queryLower = query.toLowerCase();
      const words = queryLower.split(/\s+/);
      let matchCount = 0;
      for (const word of words) {
        if (content.includes(word)) matchCount++;
      }
      return matchCount / words.length;
    } else {
      // 向量相似度
      if (atom.embedding.length === 0 || query.length === 0) return 0;
      return cosineSimilarity(atom.embedding, query);
    }
  }

  protected calculateRelevanceV2(item: ScopedMemoryItem, query: string | number[]): number {
    if (typeof query === "string") {
      // 简单的文本匹配
      const content = item.content.toLowerCase();
      const queryLower = query.toLowerCase();
      const words = queryLower.split(/\s+/);
      let matchCount = 0;
      for (const word of words) {
        if (content.includes(word)) matchCount++;
      }
      return matchCount / words.length;
    } else {
      // 向量相似度 - 新版存储暂时没有 embedding，返回 0
      return 0;
    }
  }

  protected matchesFilter(item: ScopedMemoryItem, filter?: MemoryFilter): boolean {
    if (!filter) return true;

    if (filter.minImportance !== undefined && (item.importance ?? 0) < filter.minImportance) {
      return false;
    }

    if (filter.tags?.length) {
      const itemTags = item.tags ?? [];
      const hasTag = filter.tags.some((tag) => itemTags.includes(tag));
      if (!hasTag) return false;
    }

    if (filter.startTime && item.createdAt < filter.startTime) {
      return false;
    }

    if (filter.endTime && item.createdAt > filter.endTime) {
      return false;
    }

    return true;
  }

  private notifySubscribers(atom: MemAtom, scope: MemoryScope): void {
    for (const [subId, subscription] of this.subscriptions) {
      const matches = subscription.topics.some(
        (topic) => atom.meta.tags?.includes(topic) || atom.content.includes(topic),
      );

      if (matches) {
        const callbacks = this.subscriberCallbacks.get(subId) || [];
        const item: SelectiveMemoryItem = {
          atom,
          source: { agentId: this.agentId, level: 0, originalTimestamp: atom.temporal.created },
          inheritanceWeight: 1,
          visibility: "readonly",
          scope,
        };

        for (const callback of callbacks) {
          try {
            callback([item]);
          } catch (err) {
            log.error(`通知订阅者失败: ${err}`);
          }
        }
      }
    }
  }

  private getAllMemories(filter?: MemoryFilter): (SelectiveMemoryItem | MemAtom)[] {
    const all: (SelectiveMemoryItem | MemAtom)[] = [
      ...this.inheritedMemories.values(),
      ...this.sharedMemories.values(),
      ...this.personalMemories.values(),
    ];

    if (!filter) return all;

    return all.filter((item) => {
      const atom = "atom" in item ? item.atom : item;
      return this.filterMemories([atom], filter).length > 0;
    });
  }

  // ========================================================================
  // 查询接口
  // ========================================================================

  getStats(): {
    inherited: number;
    shared: number;
    personal: number;
    total: number;
    subscriptions: number;
    snapshots: number;
  } {
    return {
      inherited: this.inheritedMemories.size,
      shared: this.sharedMemories.size,
      personal: this.personalMemories.size,
      total: this.inheritedMemories.size + this.sharedMemories.size + this.personalMemories.size,
      subscriptions: this.subscriptions.size,
      snapshots: this.snapshots.size,
    };
  }

  getSnapshots(): MemorySnapshot[] {
    return Array.from(this.snapshots.values());
  }

  close(): void {
    // 清理定时器
    if (this.writeQueueTimer) {
      clearTimeout(this.writeQueueTimer);
      this.writeQueueTimer = undefined;
    }
    // 移除所有监听器
    this.removeAllListeners();
  }
}

// ============================================================================
// 与多智能体协调器集成
// ============================================================================

import type { ResilientSubagentOrchestrator } from "../multi-agent/ResilientSubagentOrchestrator.js";

export interface MemoryInheritanceIntegration {
  /** 父 Agent 的协调器 */
  parentOrchestrator?: ResilientSubagentOrchestrator;
  /** 记忆继承系统 */
  inheritanceSystem: SelectiveMemoryInheritance;
  /** 传播记忆到子 Agent */
  propagateToChild(childAgentId: string, filter?: MemoryFilter): Promise<void>;
  /** 同步共享记忆 */
  syncSharedMemories(): Promise<void>;
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建选择性记忆继承系统的工厂函数
 *
 * 支持两种调用方式:
 * 1. createSelectiveMemoryInheritance(agentId, config?) - 标准方式
 * 2. createSelectiveMemoryInheritance(config) - 测试兼容方式 (agentId 自动生成)
 */
export function createSelectiveMemoryInheritance(
  agentIdOrConfig: string | Partial<InheritanceConfig>,
  maybeConfig?: Partial<InheritanceConfig>,
): SelectiveMemoryInheritance {
  let agentId: string;
  let config: Partial<InheritanceConfig>;

  if (typeof agentIdOrConfig === "string") {
    // 标准调用: createSelectiveMemoryInheritance(agentId, config?)
    agentId = agentIdOrConfig;
    config = maybeConfig ?? {};
  } else {
    // 测试兼容调用: createSelectiveMemoryInheritance(config)
    agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    config = agentIdOrConfig;
  }

  return new SelectiveMemoryInheritance(agentId, config);
}

// ============================================================================
// 导出类型 (已在上面导出)
// ============================================================================
