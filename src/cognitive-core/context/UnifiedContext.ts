/**
 * 统一上下文类 (UnifiedContext)
 * 
 * 参考 OpenViking 的 Context 类设计
 * 提供统一的上下文抽象，支持多种上下文类型和三层存储
 */

import { ContextLevel, LevelContent, ThreeLevelContent } from "./ContextLevel.js";

/**
 * 上下文类型
 */
export type ContextType = 
  | "skill"      // 技能
  | "memory"     // 记忆
  | "resource"   // 资源
  | "experience" // 经验
  | "knowledge"  // 知识
  | "preference" // 偏好
  | "entity"     // 实体
  | "event";     // 事件

/**
 * 上下文分类
 */
export type ContextCategory =
  | "patterns"     // 模式
  | "cases"        // 案例
  | "profile"      // 画像
  | "preferences"  // 偏好
  | "entities"     // 实体
  | "events"       // 事件
  | "decisions"    // 决策
  | "learning"     // 学习
  | "";            // 无分类

/**
 * 资源内容类型
 */
export type ResourceContentType = 
  | "text" 
  | "image" 
  | "video" 
  | "audio" 
  | "binary";

/**
 * 用户标识
 */
export interface UserIdentifier {
  accountId: string;
  userId?: string;
  agentId?: string;
  userSpaceName(): string;
  agentSpaceName(): string;
}

/**
 * 统一上下文接口
 */
export interface UnifiedContextData {
  id: string;
  uri: string;                    // viking:// 风格 URI
  parentUri?: string;             // 父目录 URI
  isLeaf: boolean;                // 是否为叶子节点
  
  // 层级内容 (L0/L1/L2)
  levelContents: ThreeLevelContent;
  currentLevel: ContextLevel;     // 当前加载的层级
  
  // 类型信息
  contextType: ContextType;
  category: ContextCategory;
  contentType: ResourceContentType;
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
  activeCount: number;            // 激活次数
  hotnessScore: number;           // 热度评分 (0-1)
  
  // 关联
  relatedUris: string[];          // 关联 URI
  
  // 向量 (可选，用于语义搜索)
  vector?: number[];
  
  // 会话和权限
  sessionId?: string;
  user?: UserIdentifier;
  accountId: string;
  ownerSpace: string;
  
  // 扩展元数据
  metadata: Record<string, unknown>;
}

/**
 * 统一上下文类
 */
export class UnifiedContext implements UnifiedContextData {
  id: string;
  uri: string;
  parentUri?: string;
  isLeaf: boolean;
  levelContents: ThreeLevelContent;
  currentLevel: ContextLevel;
  contextType: ContextType;
  category: ContextCategory;
  contentType: ResourceContentType;
  createdAt: Date;
  updatedAt: Date;
  activeCount: number;
  hotnessScore: number;
  relatedUris: string[];
  vector?: number[];
  sessionId?: string;
  user?: UserIdentifier;
  accountId: string;
  ownerSpace: string;
  metadata: Record<string, unknown>;

  constructor(data: Partial<UnifiedContextData> & { uri: string }) {
    this.id = data.id ?? generateUUID();
    this.uri = data.uri;
    this.parentUri = data.parentUri;
    this.isLeaf = data.isLeaf ?? false;
    this.levelContents = data.levelContents ?? {};
    this.currentLevel = data.currentLevel ?? ContextLevel.OVERVIEW;
    this.contextType = data.contextType ?? this.deriveContextType();
    this.category = data.category ?? this.deriveCategory();
    this.contentType = data.contentType ?? "text";
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
    this.activeCount = data.activeCount ?? 0;
    this.hotnessScore = data.hotnessScore ?? 0.5;
    this.relatedUris = data.relatedUris ?? [];
    this.vector = data.vector;
    this.sessionId = data.sessionId;
    this.user = data.user;
    this.accountId = data.accountId ?? "default";
    this.ownerSpace = data.ownerSpace ?? this.deriveOwnerSpace();
    this.metadata = data.metadata ?? {};
  }

  /**
   * 从 URI 推导上下文类型
   */
  private deriveContextType(): ContextType {
    if (this.uri.includes("/skills")) return "skill";
    if (this.uri.includes("/memories")) return "memory";
    if (this.uri.includes("/resources")) return "resource";
    if (this.uri.includes("/experiences")) return "experience";
    if (this.uri.includes("/knowledge")) return "knowledge";
    if (this.uri.includes("/preferences")) return "preference";
    if (this.uri.includes("/entities")) return "entity";
    if (this.uri.includes("/events")) return "event";
    return "resource";
  }

  /**
   * 从 URI 推导分类
   */
  private deriveCategory(): ContextCategory {
    if (this.uri.includes("/patterns")) return "patterns";
    if (this.uri.includes("/cases")) return "cases";
    if (this.uri.includes("/profile")) return "profile";
    if (this.uri.includes("/preferences")) return "preferences";
    if (this.uri.includes("/entities")) return "entities";
    if (this.uri.includes("/events")) return "events";
    if (this.uri.includes("/decisions")) return "decisions";
    if (this.uri.includes("/learning")) return "learning";
    return "";
  }

  /**
   * 推导所有者空间
   */
  private deriveOwnerSpace(): string {
    if (!this.user) return "";
    if (this.uri.startsWith("viking://agent/")) {
      return this.user.agentSpaceName();
    }
    if (this.uri.startsWith("viking://user/") || 
        this.uri.startsWith("viking://session/")) {
      return this.user.userSpaceName();
    }
    return "";
  }

  /**
   * 更新活动计数
   */
  updateActivity(): void {
    this.activeCount++;
    this.updatedAt = new Date();
    // 热度评分衰减公式
    this.hotnessScore = Math.min(1, this.hotnessScore * 0.95 + 0.05);
  }

  /**
   * 设置层级内容
   */
  setLevelContent(level: ContextLevel, content: string, tokenCount?: number): void {
    const levelContent: LevelContent = {
      level,
      content,
      tokenCount,
      lastUpdated: Date.now(),
    };

    switch (level) {
      case ContextLevel.ABSTRACT:
        this.levelContents.abstract = levelContent;
        break;
      case ContextLevel.OVERVIEW:
        this.levelContents.overview = levelContent;
        break;
      case ContextLevel.DETAIL:
        this.levelContents.detail = levelContent;
        break;
    }

    this.updatedAt = new Date();
  }

  /**
   * 获取指定层级的内容
   */
  getContentAtLevel(level: ContextLevel): string | undefined {
    switch (level) {
      case ContextLevel.ABSTRACT:
        return this.levelContents.abstract?.content;
      case ContextLevel.OVERVIEW:
        return this.levelContents.overview?.content;
      case ContextLevel.DETAIL:
        return this.levelContents.detail?.content;
      default:
        return undefined;
    }
  }

  /**
   * 获取当前层级的内容
   */
  getCurrentContent(): string | undefined {
    return this.getContentAtLevel(this.currentLevel);
  }

  /**
   * 获取最详细的内容
   */
  getMostDetailedContent(): string | undefined {
    return this.levelContents.detail?.content ?? 
           this.levelContents.overview?.content ?? 
           this.levelContents.abstract?.content;
  }

  /**
   * 获取用于向量化的文本
   */
  getVectorizationText(): string {
    // 优先使用 L0 摘要进行向量化
    return this.levelContents.abstract?.content ?? 
           this.levelContents.overview?.content ?? 
           this.getMostDetailedContent() ?? 
           "";
  }

  /**
   * 添加关联 URI
   */
  addRelatedUri(uri: string, reason?: string): void {
    if (!this.relatedUris.includes(uri)) {
      this.relatedUris.push(uri);
      
      // 在元数据中记录关联原因
      if (reason) {
        const relations = (this.metadata.relations as Record<string, string>) ?? {};
        relations[uri] = reason;
        this.metadata.relations = relations;
      }
    }
  }

  /**
   * 移除关联 URI
   */
  removeRelatedUri(uri: string): void {
    this.relatedUris = this.relatedUris.filter(u => u !== uri);
  }

  /**
   * 切换到指定层级
   */
  switchLevel(level: ContextLevel): boolean {
    const hasContent = this.getContentAtLevel(level) !== undefined;
    if (hasContent) {
      this.currentLevel = level;
      return true;
    }
    return false;
  }

  /**
   * 衰减热度评分
   */
  decayHotness(decayRate: number = 0.95): void {
    this.hotnessScore *= decayRate;
  }

  /**
   * 转换为字典格式
   */
  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      uri: this.uri,
      parent_uri: this.parentUri,
      is_leaf: this.isLeaf,
      current_level: this.currentLevel,
      context_type: this.contextType,
      category: this.category,
      content_type: this.contentType,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      active_count: this.activeCount,
      hotness_score: this.hotnessScore,
      related_uris: this.relatedUris,
      vector: this.vector,
      session_id: this.sessionId,
      account_id: this.accountId,
      owner_space: this.ownerSpace,
      metadata: this.metadata,
      // 层级内容
      abstract: this.levelContents.abstract?.content,
      overview: this.levelContents.overview?.content,
      detail: this.levelContents.detail?.content,
    };
  }

  /**
   * 从字典创建
   */
  static fromDict(data: Record<string, unknown>): UnifiedContext {
    const levelContents: ThreeLevelContent = {};
    
    if (data.abstract) {
      levelContents.abstract = {
        level: ContextLevel.ABSTRACT,
        content: String(data.abstract),
        lastUpdated: Date.now(),
      };
    }
    if (data.overview) {
      levelContents.overview = {
        level: ContextLevel.OVERVIEW,
        content: String(data.overview),
        lastUpdated: Date.now(),
      };
    }
    if (data.detail) {
      levelContents.detail = {
        level: ContextLevel.DETAIL,
        content: String(data.detail),
        lastUpdated: Date.now(),
      };
    }

    return new UnifiedContext({
      id: String(data.id ?? generateUUID()),
      uri: String(data.uri),
      parentUri: data.parent_uri ? String(data.parent_uri) : undefined,
      isLeaf: Boolean(data.is_leaf),
      levelContents,
      currentLevel: (data.current_level as ContextLevel) ?? ContextLevel.OVERVIEW,
      contextType: (data.context_type as ContextType) ?? "resource",
      category: (data.category as ContextCategory) ?? "",
      contentType: (data.content_type as ResourceContentType) ?? "text",
      createdAt: data.created_at ? new Date(String(data.created_at)) : new Date(),
      updatedAt: data.updated_at ? new Date(String(data.updated_at)) : new Date(),
      activeCount: Number(data.active_count ?? 0),
      hotnessScore: Number(data.hotness_score ?? 0.5),
      relatedUris: Array.isArray(data.related_uris) ? data.related_uris.map(String) : [],
      vector: Array.isArray(data.vector) ? data.vector.map(Number) : undefined,
      sessionId: data.session_id ? String(data.session_id) : undefined,
      accountId: String(data.account_id ?? "default"),
      ownerSpace: String(data.owner_space ?? ""),
      metadata: (data.metadata as Record<string, unknown>) ?? {},
    });
  }

  /**
   * 克隆
   */
  clone(): UnifiedContext {
    return UnifiedContext.fromDict(this.toDict());
  }
}

/**
 * 生成 UUID
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 创建技能上下文
 */
export function createSkillContext(
  uri: string,
  name: string,
  description: string,
  implementation?: string
): UnifiedContext {
  const context = new UnifiedContext({
    uri,
    contextType: "skill",
    isLeaf: true,
  });

  context.setLevelContent(ContextLevel.ABSTRACT, name);
  context.setLevelContent(ContextLevel.OVERVIEW, description);
  if (implementation) {
    context.setLevelContent(ContextLevel.DETAIL, implementation);
  }

  context.metadata = {
    name,
    description,
    skillType: "custom",
  };

  return context;
}

/**
 * 创建记忆上下文
 */
export function createMemoryContext(
  uri: string,
  summary: string,
  details: string,
  metadata?: Record<string, unknown>
): UnifiedContext {
  const context = new UnifiedContext({
    uri,
    contextType: "memory",
    isLeaf: true,
  });

  context.setLevelContent(ContextLevel.ABSTRACT, summary.slice(0, 100));
  context.setLevelContent(ContextLevel.OVERVIEW, summary);
  context.setLevelContent(ContextLevel.DETAIL, details);
  context.metadata = metadata ?? {};

  return context;
}

/**
 * 解析 URI 获取路径组件
 */
export function parseURI(uri: string): {
  scheme: string;
  namespace: string;
  space: string;
  path: string[];
} {
  const match = uri.match(/^viking:\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
  if (!match) {
    throw new Error(`Invalid URI format: ${uri}`);
  }

  const [, namespace, space, pathStr] = match;
  return {
    scheme: "viking",
    namespace,
    space,
    path: pathStr ? pathStr.split("/").filter(Boolean) : [],
  };
}

/**
 * 构建 URI
 */
export function buildURI(
  namespace: string,
  space: string,
  ...path: string[]
): string {
  const pathStr = path.length > 0 ? "/" + path.join("/") : "";
  return `viking://${namespace}/${space}${pathStr}`;
}
