/**
 * 进化记忆系统核心类型定义
 *
 * 设计原则:
 * 1. 兼容现有: 能读取 ~/.nsemclaw/memory/*.md 和 *.qmd
 * 2. 进化增强: 将静态文件转化为活记忆
 * 3. 双向可选: 可写回兼容格式,也可纯进化模式
 */

import type { Vector } from "./embedding.js";

// ============================================================================
// 原子记忆单元 (MemAtom) - 最小可进化单元
// ============================================================================

export interface MemAtom {
  /** 全局唯一ID */
  id: string;

  /** 内容哈希 - 检测变化 */
  contentHash: string;

  /** 原始内容 - 来自md/qmd或生成 */
  content: string;

  /** 内容类型 */
  contentType: "fact" | "experience" | "insight" | "pattern" | "narrative" | "intuition";

  /** 语义向量 - 动态演化 */
  embedding: Vector;

  /** 时间锚点 */
  temporal: {
    created: number;
    modified: number;
    lastAccessed: number;
    accessCount: number;
    decayRate: number; // 遗忘曲线参数
  };

  /** 空间锚点 - 来源位置 */
  spatial: {
    sourceFile?: string; // 原始md/qmd文件
    lineRange?: [number, number];
    workspace?: string;
    agent?: string;
  };

  /** 记忆强度 - 影响留存和检索优先级 */
  strength: {
    current: number; // 0-1
    base: number; // 初始强度
    reinforcement: number; // 强化次数
    emotional: number; // 情感标记(如有)
  };

  /** 进化代数 */
  generation: number;

  /** 元数据 */
  meta: {
    tags: string[];
    confidence: number; // 确定性分数
    source: "user" | "ai" | "derived" | "compressed";
    compressionRatio?: number; // 如果是压缩来的
  };
}

// ============================================================================
// 活关系边 (LivingEdge) - 动态关系网络
// ============================================================================

export interface LivingEdge {
  id: string;

  /** 连接的源和目标 */
  from: string; // MemAtom ID
  to: string; // MemAtom ID

  /** 关系类型 - 可多类型叠加 */
  types: Array<{
    type:
      | "causal"
      | "similar"
      | "contrast"
      | "temporal"
      | "spatial"
      | "hierarchical"
      | "associative";
    weight: number; // 0-1
    confidence: number; // 0-1
    learned: boolean; // 是否机器学习发现
  }>;

  /** 动态权重 - 随使用演化 */
  dynamicWeight: {
    current: number;
    history: Array<{ timestamp: number; weight: number; trigger: string }>;
    trend: "strengthening" | "weakening" | "stable";
  };

  /** 激活传播 */
  activation: {
    lastSpread: number;
    spreadCount: number;
    decayFactor: number;
  };
}

// ============================================================================
// 记忆场 (MemoryField) - 向量空间的活组织
// ============================================================================

export interface MemoryField {
  id: string;
  name: string;

  /** 场的语义描述 */
  description: string;

  /** 中心向量 - 场的质心 */
  centroid: Vector;

  /** 场的范围 - 有效半径 */
  radius: number;

  /** 包含的记忆原子 */
  atoms: Set<string>; // MemAtom IDs

  /** 场的活力 - 访问频率 */
  vitality: number;

  /** 场之间的关系 */
  fieldRelations: Array<{
    targetField: string;
    overlap: number; // 重叠度
    bridgeAtoms: string[]; // 桥接原子
  }>;

  /** 时序演化 */
  evolution: {
    created: number;
    snapshots: Array<{ timestamp: number; centroid: Vector; radius: number }>;
  };
}

// ============================================================================
// 记忆晶体 (MemoryCrystal) - 升华的压缩知识
// ============================================================================

export interface MemoryCrystal {
  id: string;

  /** 晶体类型 */
  type: "pattern" | "narrative" | "intuition" | "schema";

  /** 摘要/抽象内容 */
  abstract: string;

  /** 来源记忆 - 压缩了哪些原子 */
  sources: {
    atomIds: string[];
    timeRange: [number, number];
    totalAtoms: number;
  };

  /** 压缩统计 */
  compression: {
    ratio: number; // 压缩比
    informationRetained: number; // 保留信息量
    method: "extractive" | "abstractive" | "pattern" | "cluster";
  };

  /** 检索效率 */
  utility: {
    queryCount: number;
    hitRate: number;
    avgRelevance: number;
  };

  /** 可展开为具体记忆 */
  expandability: {
    canExpand: boolean;
    expansionQuery: string; // 如何展开
    sampleExpansion: string;
  };
}

// ============================================================================
// 记忆生态状态 (EcosystemState)
// ============================================================================

export interface EcosystemState {
  timestamp: number;

  /** 统计 */
  stats: {
    totalAtoms: number;
    totalEdges: number;
    totalFields: number;
    totalCrystals: number;
    avgAtomStrength: number;
    networkDensity: number;
  };

  /** 健康度 */
  health: {
    overall: number; // 0-1
    fragmentation: number; // 碎片化程度
    redundancy: number; // 冗余度
    coverage: number; // 覆盖度
    vitality: number; // 活力
  };

  /** 热点区域 */
  hotspots: Array<{
    fieldId: string;
    activity: number;
    trend: "rising" | "falling" | "stable";
  }>;

  /** 推荐的进化操作 */
  recommendedActions: Array<{
    action: "compress" | "prune" | "merge" | "split" | "reinforce";
    target: string;
    reason: string;
    priority: number;
  }>;
}

// ============================================================================
// 查询与激活
// ============================================================================

export interface MemoryQuery {
  /** 查询意图 */
  intent: string;

  /** 上下文 */
  context?: {
    recentAtoms?: string[];
    currentField?: string;
    temporalWindow?: [number, number];
  };

  /** 检索策略 */
  strategy: "precise" | "exploratory" | "creative" | "associative";

  /** 约束 */
  constraints?: {
    maxResults?: number;
    minStrength?: number;
    contentTypes?: MemAtom["contentType"][];
    timeRange?: [number, number];
  };
}

export interface ActivatedMemory {
  /** 激活的记忆原子 */
  atoms: Array<{
    atom: MemAtom;
    activation: number; // 激活强度
    relevance: number; // 相关度
    spreadDepth: number; // 传播深度
    path: string[]; // 激活路径
  }>;

  /** 激活的场 */
  fields: Array<{
    field: MemoryField;
    overlap: number;
  }>;

  /** 涌现的关联 */
  emergentRelations: Array<{
    from: string;
    to: string;
    via: string[];
    strength: number;
    isNovel: boolean; // 是否是新发现的关系
  }>;

  /** 整体语义 */
  semantic: {
    centroid: Vector;
    coherence: number; // 一致性
    coverage: number; // 覆盖度
  };
}

// ============================================================================
// 进化操作
// ============================================================================

export interface EvolutionOperation {
  id: string;
  timestamp: number;
  type: "birth" | "death" | "merge" | "split" | "compress" | "reinforce" | "mutate";

  /** 操作目标 */
  targets: string[];

  /** 操作结果 */
  result: {
    newAtoms?: string[];
    removedAtoms?: string[];
    newEdges?: string[];
    newCrystals?: string[];
  };

  /** 效果评估 */
  impact: {
    healthDelta: number;
    utilityDelta: number;
    description: string;
  };
}

// ============================================================================
// 与现有系统的兼容性接口
// ============================================================================

/** 从md/qmd导入 */
export interface MarkdownImportOptions {
  filePath: string;
  workspace?: string;
  agent?: string;

  /** 解析策略 */
  parseStrategy: "atomic" | "section" | "semantic";

  /** 是否监视变化 */
  watch: boolean;
}

/** 导出到md/qmd */
export interface MarkdownExportOptions {
  targetDir: string;

  /** 导出策略 */
  strategy: "crystal" | "field" | "narrative" | "full";

  /** 组织方式 */
  organization: "temporal" | "topical" | "hierarchical" | "associative";

  /** 包含元数据 */
  includeMeta: boolean;
}
