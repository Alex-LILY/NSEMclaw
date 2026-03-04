/**
 * 统一记忆存储 (Unified Memory Store)
 * 
 * 与 Nsemclaw 现有 ThreeTierMemoryStore 集成
 * 管理三个板块的记忆：用户、代理、工具
 */

import { EventEmitter } from "events";
import type {
  CandidateMemory,
  MemoryCategory,
  MemorySection,
  ToolStats,
  SkillStats,
  ToolSkillCandidateMemory,
} from "./types.js";
import { MemoryCategory as MC, getMemorySection, isToolSkillCandidate } from "./types.js";

/**
 * 统一记忆项
 * 
 * 可存储到 ThreeTierMemoryStore 的标准格式
 */
export interface UnifiedMemoryItem {
  /** URI */
  uri: string;
  /** 板块 */
  section: MemorySection;
  /** 类别 */
  category: MemoryCategory;
  /** L0: 摘要 */
  abstract: string;
  /** L1: 概览 */
  overview: string;
  /** L2: 详情 */
  content: string;
  /** 来源会话 */
  sourceSession: string;
  /** 元数据 */
  metadata: {
    userId: string;
    agentId: string;
    accountId: string;
    language: string;
    createdAt: number;
    updatedAt: number;
    relatedUris?: {
      resources?: string[];
      skills?: string[];
      memories?: string[];
    };
    toolStats?: ToolStats;
    skillStats?: SkillStats;
    isProfile?: boolean;
    [key: string]: unknown;
  };
}

/**
 * 存储适配器接口
 * 
 * 与 ThreeTierMemoryStore 的集成点
 */
export interface StorageAdapter {
  /** 存储记忆 */
  store(item: {
    uri: string;
    content: { l0: string; l1: string; l2: string };
    metadata: Record<string, unknown>;
  }): Promise<void>;
  
  /** 读取记忆 */
  read(uri: string): Promise<{
    content: { l0: string; l1: string; l2: string };
    metadata: Record<string, unknown>;
  } | null>;
  
  /** 搜索相似记忆 */
  searchSimilar(
    queryVector: number[],
    filters: {
      section?: MemorySection;
      category?: MemoryCategory;
      userId?: string;
      agentId?: string;
    },
    limit: number
  ): Promise<Array<{ uri: string; score: number; metadata: Record<string, unknown> }>>;
  
  /** 删除记忆 */
  delete(uri: string): Promise<void>;
}

/**
 * 热度评分器接口
 */
export interface HotnessScorerAdapter {
  initializeContext(uri: string, initialScore?: number): number;
  activate(uri: string): number;
  getHotness(uri: string): number;
}

/**
 * 统一记忆存储
 * 
 * 管理三个板块的记忆存储和检索
 */
export class UnifiedMemoryStore extends EventEmitter {
  private storage: StorageAdapter;
  private hotnessScorer: HotnessScorerAdapter;
  private profileCache: Map<string, UnifiedMemoryItem> = new Map();

  constructor(storage: StorageAdapter, hotnessScorer: HotnessScorerAdapter) {
    super();
    this.storage = storage;
    this.hotnessScorer = hotnessScorer;
  }

  // ========================================================================
  // 存储方法
  // ========================================================================

  /**
   * 存储记忆
   * 
   * 将提取的记忆存储到对应板块
   */
  async storeMemory(item: UnifiedMemoryItem): Promise<void> {
    // 1. 检查是否是 Profile 特殊处理
    if (item.category === MC.PROFILE) {
      await this.storeProfile(item);
      return;
    }

    // 2. 检查是否是工具/技能记忆
    if (item.category === MC.TOOLS || item.category === MC.SKILLS) {
      await this.storeToolSkillMemory(item);
      return;
    }

    // 3. 普通记忆存储
    await this.storeRegularMemory(item);
  }

  /**
   * 批量存储
   */
  async storeMemories(items: UnifiedMemoryItem[]): Promise<void> {
    for (const item of items) {
      await this.storeMemory(item);
    }
  }

  /**
   * 存储 Profile (特殊合并逻辑)
   */
  private async storeProfile(item: UnifiedMemoryItem): Promise<void> {
    const existing = await this.storage.read(item.uri);

    if (!existing) {
      // 创建新的 Profile
      await this.storage.store({
        uri: item.uri,
        content: {
          l0: item.abstract,
          l1: item.overview,
          l2: item.content,
        },
        metadata: item.metadata,
      });
      this.hotnessScorer.initializeContext(item.uri, 1.0);
    } else {
      // 合并到现有 Profile
      const merged = await this.mergeProfileContent(
        existing.content.l2,
        item.content,
        item.metadata.language
      );
      
      if (merged) {
        await this.storage.store({
          uri: item.uri,
          content: {
            l0: merged.abstract,
            l1: merged.overview,
            l2: merged.content,
          },
          metadata: {
            ...existing.metadata,
            ...item.metadata,
            updatedAt: Date.now(),
          },
        });
        this.hotnessScorer.activate(item.uri);
      }
    }

    // 更新缓存
    this.profileCache.set(item.metadata.userId, item);
    this.emit("profileUpdated", item);
  }

  /**
   * 存储工具/技能记忆 (统计累加)
   */
  private async storeToolSkillMemory(item: UnifiedMemoryItem): Promise<void> {
    const existing = await this.storage.read(item.uri);
    const newStats = item.metadata.toolStats as ToolStats | undefined;

    if (!existing) {
      // 创建新的工具/技能记忆
      await this.storage.store({
        uri: item.uri,
        content: {
          l0: item.abstract,
          l1: item.overview,
          l2: item.content,
        },
        metadata: item.metadata,
      });
      this.hotnessScorer.initializeContext(item.uri, 0.5);
    } else {
      // 累加统计
      const existingStats = existing.metadata.toolStats as ToolStats | undefined;
      const mergedStats = this.mergeToolStats(existingStats, newStats);
      
      // 生成新的内容
      const mergedContent = this.generateToolMemoryContent(
        item.uri.split("/").pop()?.replace(".md", "") || "",
        mergedStats,
        item.content
      );

      await this.storage.store({
        uri: item.uri,
        content: {
          l0: item.abstract,
          l1: item.overview,
          l2: mergedContent,
        },
        metadata: {
          ...existing.metadata,
          ...item.metadata,
          toolStats: mergedStats,
          updatedAt: Date.now(),
        },
      });
      this.hotnessScorer.activate(item.uri);
    }

    this.emit("toolSkillUpdated", item);
  }

  /**
   * 存储普通记忆
   */
  private async storeRegularMemory(item: UnifiedMemoryItem): Promise<void> {
    await this.storage.store({
      uri: item.uri,
      content: {
        l0: item.abstract,
        l1: item.overview,
        l2: item.content,
      },
      metadata: item.metadata,
    });
    
    this.hotnessScorer.initializeContext(item.uri, 0.3);
    this.emit("memoryStored", item);
  }

  // ========================================================================
  // 检索方法
  // ========================================================================

  /**
   * 获取某板块的记忆
   */
  async getSectionMemories(
    section: MemorySection,
    options?: {
      userId?: string;
      agentId?: string;
      category?: MemoryCategory;
      limit?: number;
    }
  ): Promise<UnifiedMemoryItem[]> {
    // 这里应该使用存储适配器的搜索功能
    // 简化实现：返回空数组，实际应该基于向量搜索
    return [];
  }

  /**
   * 获取用户画像
   */
  async getUserProfile(userId: string): Promise<UnifiedMemoryItem | undefined> {
    // 检查缓存
    if (this.profileCache.has(userId)) {
      return this.profileCache.get(userId);
    }

    // 从存储读取
    const uri = `viking://user/${userId}/memories/profile.md`;
    const existing = await this.storage.read(uri);
    
    if (existing) {
      const item: UnifiedMemoryItem = {
        uri,
        section: "user",
        category: MC.PROFILE,
        abstract: existing.content.l0,
        overview: existing.content.l1,
        content: existing.content.l2,
        sourceSession: "",
        metadata: existing.metadata as UnifiedMemoryItem["metadata"],
      };
      this.profileCache.set(userId, item);
      return item;
    }

    return undefined;
  }

  /**
   * 获取工具统计
   */
  async getToolStats(
    toolName: string,
    userId: string,
    agentId: string
  ): Promise<ToolStats | undefined> {
    const agentSpace = this.getAgentSpace(userId, agentId);
    const uri = `viking://agent/${agentSpace}/memories/tools/${toolName}.md`;
    
    const existing = await this.storage.read(uri);
    if (existing) {
      return existing.metadata.toolStats as ToolStats | undefined;
    }
    return undefined;
  }

  /**
   * 获取技能统计
   */
  async getSkillStats(
    skillName: string,
    userId: string,
    agentId: string
  ): Promise<SkillStats | undefined> {
    const agentSpace = this.getAgentSpace(userId, agentId);
    const uri = `viking://agent/${agentSpace}/memories/skills/${skillName}.md`;
    
    const existing = await this.storage.read(uri);
    if (existing) {
      return existing.metadata.skillStats as SkillStats | undefined;
    }
    return undefined;
  }

  // ========================================================================
  // 关系管理
  // ========================================================================

  /**
   * 创建记忆关系
   * 
   * 在记忆和资源/技能之间建立双向关系
   */
  async createRelations(
    memoryUris: string[],
    resourceUris: string[],
    skillUris: string[]
  ): Promise<void> {
    // 这里应该调用存储适配器的关系功能
    // 简化实现：仅触发事件
    this.emit("relationsCreated", {
      memories: memoryUris,
      resources: resourceUris,
      skills: skillUris,
    });
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  /**
   * 合并 Profile 内容
   */
  private async mergeProfileContent(
    existing: string,
    newContent: string,
    language: string
  ): Promise<{ abstract: string; overview: string; content: string } | null> {
    // 简化实现：直接追加
    // 实际应该调用 LLM 进行智能合并
    return {
      abstract: "Updated profile",
      overview: existing.slice(0, 100) + "...",
      content: existing + "\n\n---\n\n" + newContent,
    };
  }

  /**
   * 合并工具统计
   */
  private mergeToolStats(
    existing?: ToolStats,
    newStats?: ToolStats
  ): ToolStats {
    const base: ToolStats = existing || {
      totalCalls: 0,
      successCount: 0,
      failCount: 0,
      totalTimeMs: 0,
      totalTokens: 0,
    };

    if (!newStats) return base;

    const merged: ToolStats = {
      totalCalls: base.totalCalls + newStats.totalCalls,
      successCount: base.successCount + newStats.successCount,
      failCount: base.failCount + newStats.failCount,
      totalTimeMs: base.totalTimeMs + newStats.totalTimeMs,
      totalTokens: base.totalTokens + newStats.totalTokens,
    };

    // 计算派生统计
    if (merged.totalCalls > 0) {
      merged.avgTimeMs = merged.totalTimeMs / merged.totalCalls;
      merged.avgTokens = merged.totalTokens / merged.totalCalls;
      merged.successRate = merged.successCount / merged.totalCalls;
    }

    return merged;
  }

  /**
   * 生成工具记忆内容
   */
  private generateToolMemoryContent(
    toolName: string,
    stats: ToolStats,
    insights: string
  ): string {
    const formatMs = (ms: number): string => {
      if (ms < 1) return `${(ms * 1000).toFixed(3)}μs`;
      if (ms < 1000) return `${ms.toFixed(2)}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    return `## 工具信息
- **名称**: ${toolName}

## 调用统计
- **总调用次数**: ${stats.totalCalls}
- **成功率**: ${((stats.successRate || 0) * 100).toFixed(1)}% (${stats.successCount} 成功，${stats.failCount} 失败)
- **平均耗时**: ${formatMs(stats.avgTimeMs || 0)}
- **平均Token**: ${Math.round(stats.avgTokens || 0)}

## 使用洞察
${insights}
`;
  }

  /**
   * 获取代理空间
   */
  private getAgentSpace(userId: string, agentId: string): string {
    // 与 UserIdentifier.agentSpaceName() 一致
    const crypto = require("crypto");
    return crypto
      .createHash("md5")
      .update(userId + agentId)
      .digest("hex")
      .slice(0, 12);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.profileCache.clear();
  }
}

/**
 * 创建统一记忆存储
 */
export function createUnifiedMemoryStore(
  storage: StorageAdapter,
  hotnessScorer: HotnessScorerAdapter
): UnifiedMemoryStore {
  return new UnifiedMemoryStore(storage, hotnessScorer);
}
