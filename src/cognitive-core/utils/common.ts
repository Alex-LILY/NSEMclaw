/**
 * 公共工具函数
 *
 * 提取重复代码，提供类型安全的通用工具函数
 */

import { createHash } from "node:crypto";

// ============================================================================
// 类型定义
// ============================================================================

/** 向量类型 */
export type Vector = number[];

/** 相似度计算结果 */
export interface SimilarityResult {
  similarity: number;
  distance: number;
}

/** LRU缓存节点 */
export interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
  timestamp: number;
  accessCount: number;
}

/** 内存使用统计 */
export interface MemoryStats {
  used: number;
  total: number;
  percentage: number;
}

// ============================================================================
// 向量计算
// ============================================================================

/**
 * 计算两个向量的余弦相似度
 * @param a - 第一个向量
 * @param b - 第二个向量
 * @returns 余弦相似度值 (-1 到 1)
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // 避免除零错误
  if (denominator < 1e-10) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * 计算两个向量的欧几里得距离
 * @param a - 第一个向量
 * @param b - 第二个向量
 * @returns 欧几里得距离
 */
export function euclideanDistance(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * 计算嵌入距离（欧几里得距离的别名）
 * @param a - 第一个向量
 * @param b - 第二个向量
 * @returns 嵌入距离
 */
export function embeddingDistance(a: Vector, b: Vector): number {
  return euclideanDistance(a, b);
}

// ============================================================================
// 哈希函数
// ============================================================================

/**
 * 生成SHA256哈希
 * @param content - 要哈希的内容
 * @returns 十六进制哈希字符串
 */
export function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * 生成短哈希（前N个字符）
 * @param content - 要哈希的内容
 * @param length - 哈希长度（默认16）
 * @returns 短哈希字符串
 */
export function shortHash(content: string, length: number = 16): string {
  return hash(content).slice(0, length);
}

/**
 * 生成ID
 * @param prefix - ID前缀
 * @param content - 内容用于生成唯一部分
 * @returns 唯一ID
 */
export function generateId(prefix: string, content: string): string {
  return `${prefix}-${shortHash(content, 16)}`;
}

// ============================================================================
// 内存监控
// ============================================================================

/**
 * 获取内存使用统计
 * @returns 内存使用统计
 */
export function getMemoryStats(): MemoryStats {
  const usage = process.memoryUsage();
  // 使用 rss (Resident Set Size) 作为总内存指标更准确
  // 它反映进程实际使用的物理内存
  const total = usage.rss;
  const used = usage.heapUsed;

  return {
    used,
    total,
    percentage: total > 0 ? (used / total) * 100 : 0,
  };
}

/**
 * 检查内存是否超过阈值
 * @param thresholdPercentage - 阈值百分比（默认80）
 * @returns 是否超过阈值
 */
export function isMemoryOverThreshold(thresholdPercentage: number = 80): boolean {
  const stats = getMemoryStats();
  return stats.percentage > thresholdPercentage;
}

/**
 * 格式化字节大小
 * @param bytes - 字节数
 * @returns 格式化后的字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

// ============================================================================
// LRU缓存实现
// ============================================================================

/**
 * LRU (Least Recently Used) 缓存
 *
 * 特性：
 * - O(1) 的 get 和 set 操作
 * - 自动淘汰最久未使用的项
 * - 支持访问计数统计
 */
export class LRUCache<K, V> {
  private cache: Map<K, LRUNode<K, V>>;
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;
  private maxSize: number;
  private currentSize: number = 0;

  // 统计
  private hitCount: number = 0;
  private missCount: number = 0;
  private evictionCount: number = 0;

  constructor(maxSize: number) {
    if (maxSize <= 0) {
      throw new Error("Cache size must be positive");
    }
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * 获取缓存值
   * @param key - 键
   * @returns 值或undefined
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);

    if (node) {
      // 命中
      this.hitCount++;
      node.accessCount++;
      node.timestamp = Date.now();
      this.moveToHead(node);
      return node.value;
    }

    // 未命中
    this.missCount++;
    return undefined;
  }

  /**
   * 设置缓存值
   * @param key - 键
   * @param value - 值
   */
  set(key: K, value: V): void {
    const existingNode = this.cache.get(key);

    if (existingNode) {
      // 更新现有节点
      existingNode.value = value;
      existingNode.timestamp = Date.now();
      existingNode.accessCount++;
      this.moveToHead(existingNode);
    } else {
      // 创建新节点
      const newNode: LRUNode<K, V> = {
        key,
        value,
        prev: null,
        next: null,
        timestamp: Date.now(),
        accessCount: 1,
      };

      this.cache.set(key, newNode);
      this.addToHead(newNode);
      this.currentSize++;

      // 淘汰旧节点
      if (this.currentSize > this.maxSize) {
        this.evictLRU();
      }
    }
  }

  /**
   * 检查键是否存在
   * @param key - 键
   * @returns 是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 删除指定键
   * @param key - 键
   * @returns 是否删除成功
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (node) {
      this.removeNode(node);
      this.cache.delete(key);
      this.currentSize--;
      return true;
    }
    return false;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.currentSize = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.currentSize;
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitCount: number;
    missCount: number;
    evictionCount: number;
    hitRate: number;
  } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.currentSize,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
    };
  }

  /**
   * 获取所有键（按使用顺序，MRU在前）
   */
  keys(): K[] {
    const keys: K[] = [];
    let current = this.head;
    while (current) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }

  /**
   * 获取所有值（按使用顺序，MRU在前）
   */
  values(): V[] {
    const values: V[] = [];
    let current = this.head;
    while (current) {
      values.push(current.value);
      current = current.next;
    }
    return values;
  }

  /**
   * 获取所有键值对（按使用顺序，MRU在前）
   */
  entries(): [K, V][] {
    const entries: [K, V][] = [];
    let current = this.head;
    while (current) {
      entries.push([current.key, current.value]);
      current = current.next;
    }
    return entries;
  }

  // ========================================================================
  // 私有方法
  // =======================================================================

  private addToHead(node: LRUNode<K, V>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    // 断开节点引用，防止内存泄漏
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: LRUNode<K, V>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictLRU(): void {
    if (this.tail) {
      const keyToRemove = this.tail.key;
      this.removeNode(this.tail);
      this.cache.delete(keyToRemove);
      this.currentSize--;
      this.evictionCount++;
    }
  }
}

// ============================================================================
// 数学工具
// ============================================================================

/**
 * 计算指数衰减
 * @param initial - 初始值
 * @param rate - 衰减率
 * @param time - 时间
 * @returns 衰减后的值
 */
export function exponentialDecay(initial: number, rate: number, time: number): number {
  return initial * Math.exp(-rate * time);
}

/**
 * 限制数值范围
 * @param value - 输入值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 限制后的值
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ============================================================================
// 函数工具
// ============================================================================

/**
 * 防抖函数
 * @param fn - 要防抖的函数
 * @param delay - 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 节流函数
 * @param fn - 要节流的函数
 * @param limit - 限制时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 记忆化函数
 * @param fn - 要记忆化的函数
 * @returns 记忆化后的函数
 */
export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: unknown[]): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

/** UUID 生成器（别名） */
export const generateUUID = generateId;

/**
 * 深克隆
 * @param obj - 要克隆的对象
 * @returns 克隆后的对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 深度合并
 * @param target - 目标对象
 * @param sources - 源对象列表
 * @returns 合并后的对象
 */
export function mergeDeep<T>(target: T, ...sources: Partial<T>[]): T {
  const result = { ...target };
  for (const source of sources) {
    for (const key in source) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        (result as Record<string, unknown>)[key] = mergeDeep(
          ((result as Record<string, unknown>)[key] as T) ?? ({} as T),
          source[key] as Partial<T>
        );
      } else {
        (result as Record<string, unknown>)[key] = source[key] as unknown;
      }
    }
  }
  return result;
}
