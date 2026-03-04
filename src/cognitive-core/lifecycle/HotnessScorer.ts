/**
 * 热度评分系统 (Hotness Scorer) - 修正版
 * 
 * 参考 OpenViking 的 memory_lifecycle.py
 * 实现正确的热度评分算法:
 * Formula: score = sigmoid(log1p(active_count)) * time_decay(updated_at)
 */

import { EventEmitter } from "events";

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 热度评分配置
 */
export interface HotnessConfig {
  /** 初始热度 */
  initialHotness: number;
  /** 半衰期 (天数) - 参考 OpenViking 默认7天 */
  halfLifeDays: number;
  /** 最小热度 */
  minHotness: number;
  /** 最大热度 */
  maxHotness: number;
  /** 激活热度增量 */
  activationBoost: number;
  /** 创建热度增量 */
  creationBoost: number;
  /** 更新热度增量 */
  updateBoost: number;
  /** 关联热度传播比例 */
  propagationRatio: number;
}

/**
 * 默认热度配置
 */
export const DEFAULT_HOTNESS_CONFIG: HotnessConfig = {
  initialHotness: 0.5,
  halfLifeDays: 7.0,  // 参考 OpenViking 默认半衰期
  minHotness: 0.01,
  maxHotness: 1.0,
  activationBoost: 0.1,
  creationBoost: 0.3,
  updateBoost: 0.05,
  propagationRatio: 0.3,
};

// ============================================================================
// 正确的热度评分算法 (参考 OpenViking)
// ============================================================================

/**
 * 计算热度评分 - 修正版
 * 
 * Formula: score = sigmoid(log1p(active_count)) * time_decay(updated_at)
 * 
 * @param activeCount - 访问次数
 * @param updatedAt - 最后更新时间
 * @param now - 当前时间 (默认现在)
 * @param halfLifeDays - 半衰期天数 (默认7天)
 * @returns 热度评分 [0.0, 1.0]
 */
export function computeHotnessScore(
  activeCount: number,
  updatedAt: Date | undefined,
  now: Date = new Date(),
  halfLifeDays: number = 7.0
): number {
  // 频率组件: sigmoid(log1p(active_count))
  // log1p(x) = ln(1+x)，避免 x=0 时的问题
  const logCount = Math.log1p(activeCount);
  
  // sigmoid 函数将 logCount 映射到 (0, 1)
  // sigmoid(x) = 1 / (1 + exp(-x))
  const freq = 1.0 / (1.0 + Math.exp(-logCount));
  
  // 时间衰减组件: exp(-decay_rate * age_days)
  // decay_rate = ln(2) / half_life
  if (!updatedAt) {
    return 0.0;
  }
  
  // 计算年龄（天数）
  const ageMs = now.getTime() - updatedAt.getTime();
  const ageDays = Math.max(ageMs / 86400000, 0);  // 86400000 = 24*60*60*1000
  
  // 衰减率
  const decayRate = Math.log(2) / halfLifeDays;
  
  // 指数衰减
  const recency = Math.exp(-decayRate * ageDays);
  
  // 最终评分 = 频率 * 新鲜度
  return freq * recency;
}

/**
 * 计算时间衰减热度 (简化版)
 * 基于上次访问时间的指数衰减
 */
export function computeTimeDecayedHotness(
  baseHotness: number,
  lastAccessTime: number,
  decayHalfLifeMs: number = 86400000 * 7  // 默认7天
): number {
  const elapsed = Date.now() - lastAccessTime;
  const decayFactor = Math.exp(-elapsed / decayHalfLifeMs * Math.log(2));
  return baseHotness * decayFactor;
}

// ============================================================================
// 热度历史记录
// ============================================================================

/**
 * 热度历史记录
 */
export interface HotnessHistory {
  timestamp: number;
  hotness: number;
  event: "create" | "activate" | "update" | "decay" | "propagate";
  delta?: number;
}

/**
 * 上下文热度数据
 */
interface ContextHotnessData {
  uri: string;
  activeCount: number;
  updatedAt: Date;
  createdAt: Date;
  history: HotnessHistory[];
}

// ============================================================================
// 热度评分器
// ============================================================================

/**
 * 热度评分器 - 修正版
 * 
 * 使用正确的热度评分算法，参考 OpenViking 实现
 */
export class HotnessScorer extends EventEmitter {
  private config: HotnessConfig;
  private contexts: Map<string, ContextHotnessData>;
  private isRunning: boolean = false;

  constructor(config: Partial<HotnessConfig> = {}) {
    super();
    this.config = { ...DEFAULT_HOTNESS_CONFIG, ...config };
    this.contexts = new Map();
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  /**
   * 启动热度评分器
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emit("started");
  }

  /**
   * 停止热度评分器
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.emit("stopped");
  }

  // ========================================================================
  // 上下文管理
  // ========================================================================

  /**
   * 初始化上下文热度
   */
  initializeContext(uri: string, boost: number = 0): number {
    const now = new Date();
    const data: ContextHotnessData = {
      uri,
      activeCount: 0,
      updatedAt: now,
      createdAt: now,
      history: [],
    };

    this.contexts.set(uri, data);

    // 计算初始热度
    const hotness = this.computeHotness(uri);
    
    this.recordHistory(uri, hotness, "create", 0);
    this.emit("initialized", { uri, hotness });

    return hotness;
  }

  /**
   * 激活上下文（增加访问计数）
   */
  activate(uri: string): number {
    let data = this.contexts.get(uri);
    
    if (!data) {
      return this.initializeContext(uri);
    }

    // 增加访问计数
    data.activeCount++;
    data.updatedAt = new Date();

    // 计算新热度
    const hotness = this.computeHotness(uri);
    
    this.recordHistory(uri, hotness, "activate", this.config.activationBoost);
    this.emit("activated", { uri, hotness, activeCount: data.activeCount });

    return hotness;
  }

  /**
   * 批量激活
   */
  activateBatch(uris: string[]): Map<string, number> {
    const results = new Map<string, number>();
    
    for (const uri of uris) {
      results.set(uri, this.activate(uri));
    }
    
    return results;
  }

  /**
   * 更新上下文
   */
  update(uri: string): number {
    let data = this.contexts.get(uri);
    
    if (!data) {
      return this.initializeContext(uri);
    }

    data.updatedAt = new Date();
    const hotness = this.computeHotness(uri);
    
    this.recordHistory(uri, hotness, "update", this.config.updateBoost);
    this.emit("updated", { uri, hotness });

    return hotness;
  }

  // ========================================================================
  // 热度计算 (核心修正)
  // ========================================================================

  /**
   * 计算热度评分 - 使用正确算法
   */
  private computeHotness(uri: string, now?: Date): number {
    const data = this.contexts.get(uri);
    if (!data) return 0;

    return computeHotnessScore(
      data.activeCount,
      data.updatedAt,
      now,
      this.config.halfLifeDays
    );
  }

  /**
   * 获取热度评分 (使用正确算法)
   */
  getHotness(uri: string, now?: Date): number {
    return this.computeHotness(uri, now);
  }

  /**
   * 批量获取热度
   */
  getHotnessBatch(uris: string[], now?: Date): Map<string, number> {
    const results = new Map<string, number>();
    
    for (const uri of uris) {
      results.set(uri, this.getHotness(uri, now));
    }
    
    return results;
  }

  // ========================================================================
  // 热度传播
  // ========================================================================

  /**
   * 传播热度到关联上下文
   */
  propagate(sourceUri: string, targetUris: string[]): Map<string, number> {
    const sourceData = this.contexts.get(sourceUri);
    if (!sourceData) return new Map();

    const sourceHotness = this.computeHotness(sourceUri);
    const propagatedAmount = sourceHotness * this.config.propagationRatio;
    const results = new Map<string, number>();

    for (const targetUri of targetUris) {
      let targetData = this.contexts.get(targetUri);
      
      if (!targetData) {
        this.initializeContext(targetUri, propagatedAmount);
        results.set(targetUri, propagatedAmount);
      } else {
        // 简单增加访问计数来模拟热度传播
        targetData.activeCount += Math.max(1, Math.floor(propagatedAmount * 10));
        targetData.updatedAt = new Date();
        
        const newHotness = this.computeHotness(targetUri);
        this.recordHistory(targetUri, newHotness, "propagate", propagatedAmount);
        results.set(targetUri, newHotness);
      }
    }

    this.emit("propagated", { sourceUri, targetUris, amount: propagatedAmount });
    return results;
  }

  // ========================================================================
  // 查询接口
  // ========================================================================

  /**
   * 获取热度历史
   */
  getHistory(uri: string): HotnessHistory[] {
    const data = this.contexts.get(uri);
    return data ? [...data.history] : [];
  }

  /**
   * 获取热点上下文
   */
  getHotContexts(limit: number = 10, now?: Date): Array<{ uri: string; hotness: number }> {
    const results: Array<{ uri: string; hotness: number }> = [];
    
    for (const [uri, data] of this.contexts) {
      const hotness = this.computeHotness(uri, now);
      results.push({ uri, hotness });
    }
    
    return results
      .sort((a, b) => b.hotness - a.hotness)
      .slice(0, limit);
  }

  /**
   * 获取冷点上下文
   */
  getColdContexts(threshold: number = 0.1, now?: Date): Array<{ uri: string; hotness: number }> {
    const results: Array<{ uri: string; hotness: number }> = [];
    
    for (const [uri, data] of this.contexts) {
      const hotness = this.computeHotness(uri, now);
      if (hotness < threshold) {
        results.push({ uri, hotness });
      }
    }
    
    return results.sort((a, b) => a.hotness - b.hotness);
  }

  /**
   * 获取统计信息
   */
  getStats(now?: Date): {
    totalContexts: number;
    averageHotness: number;
    maxHotness: number;
    minHotness: number;
    hotCount: number;
    warmCount: number;
    coldCount: number;
  } {
    if (this.contexts.size === 0) {
      return {
        totalContexts: 0,
        averageHotness: 0,
        maxHotness: 0,
        minHotness: 0,
        hotCount: 0,
        warmCount: 0,
        coldCount: 0,
      };
    }

    let totalHotness = 0;
    let maxHotness = 0;
    let minHotness = 1;
    let hotCount = 0;   // > 0.7
    let warmCount = 0;  // 0.3 - 0.7
    let coldCount = 0;  // < 0.3

    for (const [uri, data] of this.contexts) {
      const hotness = this.computeHotness(uri, now);
      totalHotness += hotness;
      maxHotness = Math.max(maxHotness, hotness);
      minHotness = Math.min(minHotness, hotness);

      if (hotness > 0.7) hotCount++;
      else if (hotness >= 0.3) warmCount++;
      else coldCount++;
    }

    return {
      totalContexts: this.contexts.size,
      averageHotness: totalHotness / this.contexts.size,
      maxHotness,
      minHotness,
      hotCount,
      warmCount,
      coldCount,
    };
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 记录历史
   */
  private recordHistory(
    uri: string,
    hotness: number,
    event: HotnessHistory["event"],
    delta?: number
  ): void {
    const data = this.contexts.get(uri);
    if (!data) return;

    data.history.push({
      timestamp: Date.now(),
      hotness,
      event,
      delta,
    });

    // 限制历史记录数量
    if (data.history.length > 100) {
      data.history.shift();
    }
  }

  /**
   * 移除上下文
   */
  remove(uri: string): boolean {
    const existed = this.contexts.has(uri);
    this.contexts.delete(uri);
    
    if (existed) {
      this.emit("removed", { uri });
    }
    
    return existed;
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.contexts.clear();
    this.emit("cleared");
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建热度评分器
 */
export function createHotnessScorer(config?: Partial<HotnessConfig>): HotnessScorer {
  return new HotnessScorer(config);
}
