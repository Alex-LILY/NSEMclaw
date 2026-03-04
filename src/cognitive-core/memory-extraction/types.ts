/**
 * 记忆提取系统类型定义
 * 
 * 与 OpenViking 对齐的8类记忆提取系统
 * 融合到 Nsemclaw 的三层记忆架构
 */

import type { RequestContext } from "../security/RequestContext.js";

// ============================================================================
// 记忆分类枚举
// ============================================================================

/**
 * 记忆类别枚举
 * 
 * 对应 OpenViking 的 MemoryCategory
 * 分为三个板块：用户、代理、工具
 */
export enum MemoryCategory {
  // ========== 用户板块 (User Section) ==========
  /** 用户画像 - 写入 profile.md */
  PROFILE = "profile",
  /** 用户偏好 - 按主题聚合 */
  PREFERENCES = "preferences",
  /** 实体记忆 - 项目、人物、概念 */
  ENTITIES = "entities",
  /** 事件记录 - 决策、里程碑 */
  EVENTS = "events",

  // ========== 代理板块 (Agent Section) ==========
  /** 案例记忆 - 具体问题+解决方案 */
  CASES = "cases",
  /** 模式记忆 - 可复用流程/方法 */
  PATTERNS = "patterns",

  // ========== 工具板块 (Tool Section) ==========
  /** 工具使用记忆 - 优化、统计 */
  TOOLS = "tools",
  /** 技能执行记忆 - 工作流、策略 */
  SKILLS = "skills",
}

/**
 * 记忆板块类型
 */
export type MemorySection = "user" | "agent" | "tool";

/**
 * 获取记忆类别所属的板块
 */
export function getMemorySection(category: MemoryCategory): MemorySection {
  const userCategories = [
    MemoryCategory.PROFILE,
    MemoryCategory.PREFERENCES,
    MemoryCategory.ENTITIES,
    MemoryCategory.EVENTS,
  ];
  const agentCategories = [
    MemoryCategory.CASES,
    MemoryCategory.PATTERNS,
  ];
  
  if (userCategories.includes(category)) return "user";
  if (agentCategories.includes(category)) return "agent";
  return "tool";
}

/**
 * 获取板块的默认类别
 */
export function getDefaultCategories(section: MemorySection): MemoryCategory[] {
  switch (section) {
    case "user":
      return [
        MemoryCategory.PROFILE,
        MemoryCategory.PREFERENCES,
        MemoryCategory.ENTITIES,
        MemoryCategory.EVENTS,
      ];
    case "agent":
      return [
        MemoryCategory.CASES,
        MemoryCategory.PATTERNS,
      ];
    case "tool":
      return [
        MemoryCategory.TOOLS,
        MemoryCategory.SKILLS,
      ];
  }
}

// ============================================================================
// 会话类型
// ============================================================================

/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * 消息Part类型
 */
export type MessagePartType = "text" | "tool_call" | "tool_result" | "context";

/**
 * 消息Part
 */
export interface MessagePart {
  type: MessagePartType;
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolStatus?: "completed" | "error" | "pending";
  skillUri?: string;
  uri?: string;
  contextType?: "memories" | "resources" | "skills";
}

/**
 * 会话消息
 */
export interface SessionMessage {
  id: string;
  role: MessageRole;
  content: string;
  parts?: MessagePart[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
  id: string;
  toolName: string;
  skillUri?: string;
  input: Record<string, unknown>;
  output?: string;
  status: "completed" | "error" | "pending";
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  timestamp: number;
}

/**
 * 会话
 */
export interface Session {
  id: string;
  userId: string;
  agentId: string;
  accountId: string;
  messages: SessionMessage[];
  toolCalls: ToolCallInfo[];
  startTime: number;
  lastActivityTime: number;
  metadata: {
    compressionSummary?: string;
    usedResources?: string[];
    usedSkills?: string[];
    [key: string]: unknown;
  };
}

// ============================================================================
// 候选记忆类型
// ============================================================================

/**
 * 候选记忆
 * 
 * 从会话中提取的原始记忆候选
 */
export interface CandidateMemory {
  /** 记忆类别 */
  category: MemoryCategory;
  
  /** L0: 一句话摘要 (~100 tokens) */
  abstract: string;
  
  /** L1: 中等详细程度 (~2k tokens) */
  overview: string;
  
  /** L2: 完整叙述 */
  content: string;
  
  /** 来源会话ID */
  sourceSession: string;
  
  /** 用户ID */
  userId: string;
  
  /** 语言 */
  language: string;
  
  /** 关联的URIs */
  relatedUris?: {
    resources?: string[];
    skills?: string[];
    memories?: string[];
  };
}

/**
 * 工具/技能候选记忆
 * 
 * 包含统计信息的特殊候选
 */
export interface ToolSkillCandidateMemory extends CandidateMemory {
  /** 工具名称 */
  toolName?: string;
  
  /** 技能名称 */
  skillName?: string;
  
  /** 执行耗时 (ms) */
  durationMs: number;
  
  /** 输入 Token */
  promptTokens: number;
  
  /** 输出 Token */
  completionTokens: number;
  
  /** 调用次数 */
  callTime: number;
  
  /** 成功次数 */
  successTime: number;
  
  /** 工具状态 */
  toolStatus?: "completed" | "error";
}

/**
 * 检查是否为工具/技能候选记忆
 */
export function isToolSkillCandidate(
  candidate: CandidateMemory
): candidate is ToolSkillCandidateMemory {
  return (
    candidate.category === MemoryCategory.TOOLS ||
    candidate.category === MemoryCategory.SKILLS
  );
}

// ============================================================================
// 提取结果类型
// ============================================================================

/**
 * 提取结果
 */
export interface ExtractionResult {
  /** 提取的记忆列表 */
  memories: CandidateMemory[];
  
  /** 各板块统计 */
  stats: {
    user: number;
    agent: number;
    tool: number;
  };
  
  /** 会话ID */
  sessionId: string;
  
  /** 处理时间 (ms) */
  processingTimeMs: number;
  
  /** 输出语言 */
  language: string;
}

/**
 * 提取统计
 */
export interface ExtractionStats {
  /** 创建数 */
  created: number;
  /** 合并数 */
  merged: number;
  /** 删除数 */
  deleted: number;
  /** 跳过数 */
  skipped: number;
}

// ============================================================================
// 去重决策类型
// ============================================================================

/**
 * 去重决策类型
 */
export enum DedupDecision {
  /** 重复，跳过 */
  SKIP = "skip",
  /** 创建新记忆 */
  CREATE = "create",
  /** 仅处理现有记忆，不创建新候选 */
  NONE = "none",
}

/**
 * 记忆动作决策
 */
export enum MemoryActionDecision {
  /** 合并候选到现有记忆 */
  MERGE = "merge",
  /** 删除冲突的现有记忆 */
  DELETE = "delete",
}

/**
 * 现有记忆动作
 */
export interface ExistingMemoryAction {
  /** 现有记忆URI */
  uri: string;
  /** 决策 */
  decision: MemoryActionDecision;
  /** 原因 */
  reason: string;
}

/**
 * 去重结果
 */
export interface DedupResult {
  /** 决策 */
  decision: DedupDecision;
  /** 候选记忆 */
  candidate: CandidateMemory;
  /** 相似的记忆 */
  similarMemories: string[];
  /** 动作列表 */
  actions: ExistingMemoryAction[];
  /** 原因 */
  reason: string;
}

// ============================================================================
// 存储类型
// ============================================================================

/**
 * 统一记忆项
 * 
 * 存储到 ThreeTierMemoryStore 的标准格式
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
    [key: string]: unknown;
  };
}

/**
 * 工具统计
 */
export interface ToolStats {
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failCount: number;
  /** 总耗时 (ms) */
  totalTimeMs: number;
  /** 总Token数 */
  totalTokens: number;
  /** 平均耗时 (ms) */
  avgTimeMs?: number;
  /** 平均Token数 */
  avgTokens?: number;
  /** 成功率 */
  successRate?: number;
}

/**
 * 技能统计
 */
export interface SkillStats {
  /** 总执行次数 */
  totalExecutions: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failCount: number;
  /** 成功率 */
  successRate?: number;
}

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 板块配置
 */
export interface SectionConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 包含的类别 */
  categories: MemoryCategory[];
  /** 存储路径模板 */
  storagePath: string;
  /** 合并策略 */
  mergeStrategy: "append" | "replace" | "smart";
  /** 去重阈值 */
  dedupThreshold: number;
}

/**
 * 会话管理配置
 */
export interface SessionManagerConfig {
  /** 最大消息数阈值 */
  maxMessages: number;
  /** 最大持续时间 (ms) */
  maxDuration: number;
  /** 最小内容长度 */
  minContentLength: number;
  /** 空闲超时 (ms) */
  idleTimeout: number;
  /** 自动提取 */
  autoExtract: boolean;
}

/**
 * 记忆提取配置
 */
export interface MemoryExtractionConfig {
  /** 用户板块配置 */
  user: SectionConfig;
  /** 代理板块配置 */
  agent: SectionConfig;
  /** 工具板块配置 */
  tool: SectionConfig;
  /** 默认输出语言 */
  defaultLanguage: string;
  /** 语言检测 */
  detectLanguage: boolean;
}

/**
 * 去重配置
 */
export interface DeduplicationConfig {
  /** 向量相似度阈值 */
  similarityThreshold: number;
  /** 最大相似记忆数 */
  maxSimilarMemories: number;
  /** 各板块策略 */
  strategies: {
    user: "merge" | "skip" | "create";
    agent: "merge" | "skip" | "create";
    tool: "always_merge" | "merge" | "create";
  };
}

// ============================================================================
// 事件类型
// ============================================================================

/**
 * 会话事件
 */
export interface SessionEvent {
  type: "started" | "message" | "tool_call" | "ended" | "extracted";
  sessionId: string;
  timestamp: number;
  data?: unknown;
}

/**
 * 提取事件
 */
export interface ExtractionEvent {
  type: "extraction_started" | "category_extracted" | "deduplicated" | "stored" | "completed";
  sessionId: string;
  category?: MemoryCategory;
  section?: MemorySection;
  count?: number;
  timestamp: number;
}
