import type { ChatType } from "../channels/chat-type.js";
import type { AgentDefaultsConfig } from "./types.agent-defaults.js";
import type { AgentModelConfig, AgentSandboxConfig } from "./types.agents-shared.js";
import type { HumanDelayConfig, IdentityConfig } from "./types.base.js";
import type { GroupChatConfig } from "./types.messages.js";
import type { AgentToolsConfig, MemorySearchConfig } from "./types.tools.js";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type NSEMAdapterConfig = {
  /** 是否启用NSEM增强 */
  enabled: boolean;
  /** 神经搜索权重 (0-1) */
  neuralSearchWeight: number;
  /** 传统搜索权重 (0-1) */
  traditionalSearchWeight: number;
  /** 自动进化间隔 (分钟, 0=禁用) */
  autoEvolveIntervalMinutes: number;
  /** 是否将对话摄入为记忆 */
  ingestConversations: boolean;
  /** 会话记忆摄入配置 */
  conversationIngest: {
    /** 摄入消息角色 */
    roles: Array<"user" | "assistant" | "system">;
    /** 最小消息长度 */
    minLength: number;
    /** 摄入间隔 (消息数) */
    batchSize: number;
  };
  /** 结果增强配置 */
  resultEnhancement?: {
    /** 包含涌现关系 */
    includeEmergentRelations?: boolean;
    /** 包含场上下文 */
    includeFieldContext?: boolean;
    /** 关联深度 */
    associationDepth?: number;
  };
};

export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentModelConfig;
  /** Optional allowlist of skills for this agent (omit = all skills; empty = none). */
  skills?: string[];
  memorySearch?: MemorySearchConfig;
  /** Human-like delay between block replies for this agent. */
  humanDelay?: HumanDelayConfig;
  /** Optional per-agent heartbeat overrides. */
  heartbeat?: AgentDefaultsConfig["heartbeat"];
  identity?: IdentityConfig;
  groupChat?: GroupChatConfig;
  subagents?: {
    /** Allow spawning sub-agents under other agent ids. Use "*" to allow any. */
    allowAgents?: string[];
    /** Per-agent default model for spawned sub-agents (string or {primary,fallbacks}). */
    model?: AgentModelConfig;
  };
  /** Optional per-agent sandbox overrides. */
  sandbox?: AgentSandboxConfig;
  /** Optional per-agent stream params (e.g. cacheRetention, temperature). */
  params?: Record<string, unknown>;
  tools?: AgentToolsConfig;
  /** NSEM 进化记忆配置 */
  nsem?: Partial<NSEMAdapterConfig>;
};

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
};

export type AgentBinding = {
  agentId: string;
  comment?: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: { kind: ChatType; id: string };
    guildId?: string;
    teamId?: string;
    /** Discord role IDs used for role-based routing. */
    roles?: string[];
  };
};
