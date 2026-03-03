/**
 * Cognitive Core 统一类型定义
 *
 * 从 evolution/memory/core/types.ts 和 NSEM2Core.ts 合并
 * 作为单一类型源，避免重复定义
 */

// ============================================================================
// 基础类型
// ============================================================================

export type Vector = number[];

export type ContentType = "fact" | "experience" | "insight" | "pattern" | "narrative" | "intuition";

export type RelationType =
  | "causal"
  | "similar"
  | "contrast"
  | "temporal"
  | "spatial"
  | "hierarchical"
  | "associative";

export type QueryStrategy = "precise" | "exploratory" | "creative" | "associative";

// ============================================================================
// 记忆原子 (MemAtom) - 最小可进化单元
// ============================================================================

export interface MemAtom {
  /** 全局唯一ID */
  id: string;

  /** 内容哈希 - 检测变化 */
  contentHash: string;

  /** 原始内容 */
  content: string;

  /** 内容类型 */
  contentType: ContentType;

  /** 语义向量 */
  embedding: Vector;

  /** 时间锚点 */
  temporal: {
    created: number;
    modified: number;
    lastAccessed: number;
    accessCount: number;
    decayRate: number;
  };

  /** 空间锚点 - 来源位置 */
  spatial: {
    sourceFile?: string;
    lineRange?: [number, number];
    workspace?: string;
    agent?: string;
  };

  /** 记忆强度 */
  strength: {
    current: number;
    base: number;
    reinforcement: number;
    emotional: number;
  };

  /** 进化代数 */
  generation: number;

  /** 元数据 */
  meta: {
    tags: string[];
    confidence: number;
    source: "user" | "ai" | "derived" | "compressed";
    compressionRatio?: number;
  };
}

// ============================================================================
// 关系边 (LivingEdge) - 动态关系网络
// ============================================================================

export interface LivingEdge {
  id: string;
  from: string;
  to: string;
  types: Array<{
    type: RelationType;
    weight: number;
    confidence: number;
    learned: boolean;
  }>;
  dynamicWeight: {
    current: number;
    history: Array<{ timestamp: number; weight: number; trigger: string }>;
    trend: "strengthening" | "weakening" | "stable";
  };
  activation: {
    lastSpread: number;
    spreadCount: number;
    decayFactor: number;
  };
}

// ============================================================================
// 记忆场 (MemoryField) - 语义聚类
// ============================================================================

export interface MemoryField {
  id: string;
  name: string;
  description: string;
  centroid: Vector;
  radius: number;
  atoms: Set<string>;
  vitality: number;
  fieldRelations: Array<{
    targetField: string;
    overlap: number;
    bridgeAtoms: string[];
  }>;
  evolution: {
    created: number;
    snapshots: Array<{ timestamp: number; centroid: Vector; radius: number }>;
  };
}

// ============================================================================
// 记忆晶体 (MemoryCrystal) - 压缩知识
// ============================================================================

export interface MemoryCrystal {
  id: string;
  type: "pattern" | "narrative" | "intuition" | "schema";
  abstract: string;
  sources: {
    atomIds: string[];
    timeRange: [number, number];
    totalAtoms: number;
  };
  compression: {
    ratio: number;
    informationRetained: number;
    method: "extractive" | "abstractive" | "pattern" | "cluster";
  };
  utility: {
    queryCount: number;
    hitRate: number;
    avgRelevance: number;
  };
  expandability: {
    canExpand: boolean;
    expansionQuery: string;
    sampleExpansion: string;
  };
}

// ============================================================================
// 查询相关
// ============================================================================

export interface MemoryQuery {
  intent: string;
  context?: {
    recentAtoms?: string[];
    currentField?: string;
    temporalWindow?: [number, number];
  };
  strategy: QueryStrategy;
  constraints?: {
    maxResults?: number;
    minStrength?: number;
    contentTypes?: ContentType[];
    timeRange?: [number, number];
  };
}

export interface ActivatedMemory {
  atoms: Array<{
    atom: MemAtom;
    activation: number;
    relevance: number;
    spreadDepth: number;
    path: string[];
  }>;
  fields: Array<{
    field: MemoryField;
    overlap: number;
  }>;
  emergentRelations: Array<{
    from: string;
    to: string;
    via: string[];
    strength: number;
    isNovel: boolean;
  }>;
  semantic: {
    centroid: Vector;
    coherence: number;
    coverage: number;
  };
}

// ============================================================================
// 生态状态
// ============================================================================

export interface EcosystemState {
  timestamp: number;
  stats: {
    totalAtoms: number;
    totalEdges: number;
    totalFields: number;
    totalCrystals: number;
    avgAtomStrength: number;
    networkDensity: number;
  };
  health: {
    overall: number;
    fragmentation: number;
    redundancy: number;
    coverage: number;
    vitality: number;
  };
  hotspots: Array<{
    fieldId: string;
    activity: number;
    trend: "rising" | "falling" | "stable";
  }>;
  recommendedActions: Array<{
    action: "compress" | "prune" | "merge" | "split" | "reinforce";
    target: string;
    reason: string;
    priority: number;
  }>;
}

// ============================================================================
// 配置类型
// ============================================================================

export interface NSEM2Config {
  rootDir: string;
  agentId: string;
  resourceMode: "minimal" | "balanced" | "performance";
  evolutionInterval: number;
  maxAtoms: number;
  compressionTrigger: {
    atomCount: number;
    ageDays: number;
    strengthThreshold: number;
  };
}

export interface SmartEmbeddingConfig {
  resourceMode?: "minimal" | "balanced" | "performance";
  rerankerModel?: string;
  expansionModel?: string;
}

// ============================================================================
// 记忆作用域
// ============================================================================

export type MemoryScope = "local" | "shared" | "global" | "personal";

// ============================================================================
// 导出兼容类型 (用于迁移)
// ============================================================================

/** @deprecated 使用 ContentType */
export type MemAtomContentType = ContentType;

/** @deprecated 使用 RelationType */
export type EdgeRelationType = RelationType;

/** @deprecated 使用 QueryStrategy */
export type SearchStrategy = QueryStrategy;
