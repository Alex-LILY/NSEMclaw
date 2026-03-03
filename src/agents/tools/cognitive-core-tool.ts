/**
 * 认知核心工具 - 让主 Agents 使用 NSEM2 认知核心功能
 *
 * 提供功能:
 * - 选择性记忆继承 (规避共享记忆问题)
 * - 三层记忆存储操作 (工作/短期/长期记忆)
 * - 弹性子代理协调 (断路器、重试、死信队列)
 * - 知识检索和激活
 * - 多智能体协作
 */

import { Type } from "@sinclair/typebox";
import {
  createPersistentSelectiveMemoryInheritance,
  PersistentSelectiveMemoryInheritance,
} from "../../cognitive-core/memory/PersistentSelectiveMemoryInheritance.js";
import {
  createSelectiveMemoryInheritance,
  SelectiveMemoryInheritance,
} from "../../cognitive-core/memory/SelectiveMemoryInheritance.js";
import type {
  MemoryScope,
  InheritanceStrategy,
  MemoryFilter,
} from "../../cognitive-core/memory/SelectiveMemoryInheritance.js";
import { createMetaCognitionMonitor } from "../../cognitive-core/meta-cognition/MetaCognitionMonitor.js";
import {
  createMultiAgentCollaborationSystem,
  MultiAgentCollaborationSystem,
} from "../../cognitive-core/multi-agent/MultiAgentCollaboration.js";
import {
  createResilientSubagentOrchestrator,
  ResilientSubagentOrchestrator,
} from "../../cognitive-core/multi-agent/ResilientSubagentOrchestrator.js";
import { generateId } from "../../cognitive-core/utils/common.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam, readStringArrayParam } from "./common.js";

const log = createSubsystemLogger("cognitive-core-tool");

// ============================================================================
// 配置
// ============================================================================

/** 是否使用真实子代理执行 */
const USE_REAL_SUBAGENTS = process.env.NSEM_USE_REAL_SUBAGENTS !== "false";

// ============================================================================
// 工具参数 Schema
// ============================================================================

const COGNITIVE_ACTIONS = [
  // 选择性记忆继承
  "inherit_memory", // 从父 Agent 继承记忆
  "memory_store", // 存储记忆 (支持 scope)
  "memory_retrieve", // 检索记忆 (跨 inherited/shared/personal)
  "memory_annotate", // 对继承记忆添加注释
  "memory_snapshot", // 创建记忆快照
  "memory_restore", // 恢复快照
  "memory_stats", // 获取记忆统计
  // 协作和弹性
  "collaboration_start", // 启动协作会话
  "collaboration_task", // 添加协作任务
  "collaboration_status", // 获取协作状态
  "resilient_execute", // 执行弹性任务
  "circuit_breaker_status", // 断路器状态
  "dead_letter_queue", // 死信队列操作
  "dead_letter_replay", // 重放死信
  "monitor_status", // 监控状态
  // 子代理生命周期管理
  "subagent_create", // 创建子代理 (session 模式)
  "subagent_send", // 发送消息给子代理
  "subagent_close", // 关闭子代理 (优雅关闭)
  "subagent_delete", // 删除子代理 (完全删除)
  "subagent_list", // 列出所有子代理
  "subagent_status", // 获取子代理状态
  "subagent_a2a", // 子代理间通信
  // 工作队列和 Pipeline
  "queue_submit", // 提交任务到队列
  "queue_claim", // 子代理领取任务
  "queue_complete", // 报告任务完成
  "queue_fail", // 报告任务失败
  "queue_list", // 查看队列任务
  "queue_stats", // 队列统计
  "pipeline_create", // 创建 Pipeline
  "pipeline_submit", // 提交 Pipeline 任务
  "pipeline_list", // 列出所有 Pipeline
  "pipeline_status", // 查看 Pipeline 状态
] as const;

const CognitiveCoreToolSchema = Type.Object({
  action: optionalStringEnum(COGNITIVE_ACTIONS),

  // 选择性记忆继承参数
  parent_agent_id: Type.Optional(Type.String({ description: "父 Agent ID (用于继承)" })),
  memory_scope: Type.Optional(
    Type.String({ description: "记忆作用域: inherited/shared/personal" }),
  ),
  inheritance_strategy: Type.Optional(
    Type.String({ description: "继承策略: full/filtered/summarized/referenced/none" }),
  ),
  include_tags: Type.Optional(Type.Array(Type.String(), { description: "继承时包含的标签" })),
  exclude_tags: Type.Optional(Type.Array(Type.String(), { description: "继承时排除的标签" })),
  min_importance: Type.Optional(Type.Number({ description: "最小重要性 (0-1)" })),
  snapshot_id: Type.Optional(Type.String({ description: "快照ID" })),
  snapshot_name: Type.Optional(Type.String({ description: "快照名称" })),
  annotation: Type.Optional(Type.String({ description: "注释内容" })),
  memory_id: Type.Optional(Type.String({ description: "记忆ID" })),

  // 记忆操作参数
  memory_tier: Type.Optional(
    Type.String({ description: "记忆层级: working/short-term/long-term" }),
  ),
  memory_content: Type.Optional(Type.String({ description: "记忆内容" })),
  memory_type: Type.Optional(
    Type.String({ description: "记忆类型: fact/experience/insight/pattern/narrative/intuition" }),
  ),
  memory_tags: Type.Optional(Type.Array(Type.String(), { description: "记忆标签" })),
  query: Type.Optional(Type.String({ description: "查询内容" })),

  // 协作参数
  session_id: Type.Optional(Type.String({ description: "协作会话ID" })),
  task_description: Type.Optional(Type.String({ description: "任务描述" })),
  task_content: Type.Optional(Type.String({ description: "任务内容" })),
  task_type: Type.Optional(
    Type.String({ description: "任务类型: analysis/generation/research/review/integration" }),
  ),
  priority: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: "优先级 1-10" })),
  strategy: Type.Optional(
    Type.String({ description: "策略: parallel-fast/sequential-quality/hierarchical-adaptive" }),
  ),

  // 弹性执行参数
  task_name: Type.Optional(Type.String({ description: "任务名称" })),
  timeout: Type.Optional(Type.Number({ description: "超时时间(毫秒)" })),
  use_circuit_breaker: Type.Optional(Type.Boolean({ description: "是否使用断路器" })),
  use_retry: Type.Optional(Type.Boolean({ description: "是否使用重试" })),
  max_retries: Type.Optional(Type.Number({ description: "最大重试次数" })),

  // 死信队列参数
  entry_id: Type.Optional(Type.String({ description: "死信条目ID" })),
  replay_filter: Type.Optional(
    Type.String({ description: "重放过滤器: all/retryable/transient/permanent" }),
  ),

  // 子代理生命周期管理参数
  subagent_id: Type.Optional(Type.String({ description: "子代理ID" })),
  target_subagent_id: Type.Optional(Type.String({ description: "目标子代理ID (用于A2A通信)" })),
  task: Type.Optional(Type.String({ description: "任务内容 (用于创建子代理)" })),
  message: Type.Optional(Type.String({ description: "消息内容 (用于发送消息)" })),
  subagent_mode: Type.Optional(Type.String({ description: "子代理模式: run/session" })),
  subagent_thread: Type.Optional(Type.Boolean({ description: "是否绑定线程 (session模式)" })),
  subagent_cleanup: Type.Optional(Type.String({ description: "子代理清理模式: delete/keep" })),
  close_reason: Type.Optional(Type.String({ description: "关闭原因" })),
  timeout_seconds: Type.Optional(Type.Number({ description: "超时秒数" })),

  // 工作队列和 Pipeline 参数
  task_id: Type.Optional(Type.String({ description: "任务ID" })),
  queue_type: Type.Optional(Type.String({ description: "队列任务类型" })),
  queue_content: Type.Optional(Type.String({ description: "队列任务内容" })),
  queue_result: Type.Optional(Type.String({ description: "队列任务结果" })),
  queue_error: Type.Optional(Type.String({ description: "队列任务错误" })),
  pipeline_id: Type.Optional(Type.String({ description: "Pipeline ID" })),
  pipeline_name: Type.Optional(Type.String({ description: "Pipeline 名称" })),
  pipeline_stages: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    description: Type.String(),
    subagent_id: Type.String(),
    timeout_seconds: Type.Optional(Type.Number()),
    blocking: Type.Optional(Type.Boolean()),
    max_retries: Type.Optional(Type.Number()),
  }), { description: "Pipeline 阶段定义" })),

  // 通用参数
  agent_id: Type.Optional(Type.String({ description: "代理ID" })),
});

// ============================================================================
// 全局实例管理
// ============================================================================

const orchestrators = new Map<string, ResilientSubagentOrchestrator>();
const collaborationSystems = new Map<string, MultiAgentCollaborationSystem>();
const inheritanceSystems = new Map<
  string,
  SelectiveMemoryInheritance | PersistentSelectiveMemoryInheritance
>();

function getOrchestrator(sessionKey: string): ResilientSubagentOrchestrator {
  let orchestrator = orchestrators.get(sessionKey);
  if (!orchestrator) {
    orchestrator = createResilientSubagentOrchestrator(sessionKey);
    orchestrator.start();
    orchestrators.set(sessionKey, orchestrator);
    log.info(`为会话 ${sessionKey} 创建弹性协调器`);
  }
  return orchestrator;
}

function getCollaborationSystem(
  sessionKey: string,
  useRealSubagents: boolean = true,
): MultiAgentCollaborationSystem {
  let system = collaborationSystems.get(sessionKey);
  if (!system) {
    system = createMultiAgentCollaborationSystem(sessionKey, { useRealSubagents });
    system.start();
    collaborationSystems.set(sessionKey, system);
    log.info(`为会话 ${sessionKey} 创建协作系统 (${useRealSubagents ? "真实子代理" : "模拟模式"})`);
  }
  return system;
}

/**
 * 判断是否为子 Agent（需要记忆继承系统）
 * 主 Agent 如 agent:main:main、agent:worker 等不需要继承系统
 */
function isSubAgent(agentId: string): boolean {
  // 子 Agent ID 通常包含 session 标识或 task 标识
  // 例如: subagent-xxx, task-yyy, 或包含时间戳的临时 ID
  const subAgentPatterns = [
    /^subagent-/i,
    /^task-/i,
    /^spawn-/i,
    /^worker-/i,
    /^job-/i,
    /-\d{13,}-/, // 时间戳格式
    /-[a-f0-9]{8,}$/, // hash 后缀
  ];
  
  // 主 agent 模式（明确的主 agent 标识）
  const mainAgentPatterns = [
    /^agent:main:/i,
    /^main$/i,
    /^default$/i,
  ];
  
  // 如果匹配主 agent 模式，不是 subagent
  if (mainAgentPatterns.some(p => p.test(agentId))) {
    return false;
  }
  
  // 如果匹配 subagent 模式，是 subagent
  return subAgentPatterns.some(p => p.test(agentId));
}

/**
 * 获取或创建 Agent 的选择性记忆继承系统
 * 使用持久化存储
 * 
 * 注意：此系统专为子 Agent 设计，用于从父 Agent 继承记忆
 * 主 Agent 直接访问 NSEM2Core，不使用此系统
 */
export function getInheritanceSystem(
  agentId: string,
  parentAgentId?: string,
  usePersistence: boolean = true,
): SelectiveMemoryInheritance | PersistentSelectiveMemoryInheritance | null {
  // 检测主 Agent - 主 Agent 不需要继承系统，直接使用 NSEM2Core
  if (!parentAgentId && !isSubAgent(agentId)) {
    log.debug(`Agent ${agentId} 是主 Agent，跳过创建选择性记忆继承系统`);
    return null;
  }
  
  let system = inheritanceSystems.get(agentId);
  if (!system) {
    const config = {
      strategy: (parentAgentId ? "filtered" : "timeline") as InheritanceStrategy,
      parentChain: parentAgentId ? [parentAgentId] : [],
      maxInheritedMemories: 1000,
      inheritanceDecay: 0.9,
      enablePersistence: usePersistence,
    };

    if (usePersistence) {
      system = createPersistentSelectiveMemoryInheritance(agentId, config);
    } else {
      system = createSelectiveMemoryInheritance(agentId, config);
    }
    inheritanceSystems.set(agentId, system);
    log.info(`为 Agent ${agentId} 创建选择性记忆继承系统 (${usePersistence ? "持久化" : "内存"})`);
  }
  return system;
}

// ============================================================================
// 动作处理器 - 选择性记忆继承
// ============================================================================

async function handleInheritMemory(agentId: string, params: Record<string, unknown>) {
  const parentAgentId = readStringParam(params, "parent_agent_id", { required: true });
  const strategy = readStringParam(params, "inheritance_strategy") ?? "filtered";
  const includeTags = readStringArrayParam(params, "include_tags");
  const excludeTags = readStringArrayParam(params, "exclude_tags");
  const minImportance = readNumberParam(params, "min_importance");

  if (!parentAgentId) {
    return jsonResult({ status: "error", error: "parent_agent_id is required" });
  }

  // 获取或创建继承系统
  const inheritance = getInheritanceSystem(agentId, parentAgentId);
  if (!inheritance) {
    return jsonResult({ 
      status: "error", 
      error: `Agent ${agentId} 是主 Agent，不需要继承记忆。继承系统专为子 Agent 设计。` 
    });
  }

  // 获取父 Agent 的记忆（简化实现，实际应从父 Agent 的存储中获取）
  const parentInheritance = getInheritanceSystem(parentAgentId);
  // 这里我们获取父 Agent 的所有记忆来模拟继承
  const allParentMemories: import("../../cognitive-core/types/index.js").MemAtom[] = [];

  // 执行继承
  const result = await inheritance.inheritFromParent(parentAgentId, allParentMemories);

  return jsonResult({
    status: "ok",
    action: "inherit_memory",
    agent_id: agentId,
    parent_agent_id: parentAgentId,
    strategy,
    inherited: result.inherited,
    filtered: result.filtered,
    text: `从 ${parentAgentId} 继承了 ${result.inherited} 条记忆 (过滤了 ${result.filtered} 条)`,
  });
}

async function handleMemoryStore(agentId: string, params: Record<string, unknown>) {
  const content = readStringParam(params, "memory_content", { required: true });
  const type = readStringParam(params, "memory_type") ?? "fact";
  const tags = readStringArrayParam(params, "memory_tags") ?? [];
  const scope = (readStringParam(params, "memory_scope") ?? "personal") as MemoryScope;

  if (!content) {
    return jsonResult({ status: "error", error: "memory_content is required" });
  }

  const inheritance = getInheritanceSystem(agentId);
  if (!inheritance) {
    return jsonResult({ 
      status: "error", 
      error: `Agent ${agentId} 是主 Agent，请直接使用 NSEM2Core 存储记忆，而不是选择性记忆继承系统` 
    });
  }

  const atom = await inheritance.store(content, {
    type,
    tags,
    scope,
    importance: 0.5,
  });

  return jsonResult({
    status: "ok",
    action: "memory_store",
    memory_id: atom.id,
    scope,
    content: content.slice(0, 100),
    type,
    tags,
    timestamp: Date.now(),
    text: `记忆已存储到 ${scope}: ${content.slice(0, 50)}...`,
  });
}

async function handleMemoryRetrieve(agentId: string, params: Record<string, unknown>) {
  const query = readStringParam(params, "query", { required: true });
  const maxResults = readNumberParam(params, "max_results") ?? 10;
  const scopeParam = readStringParam(params, "memory_scope");

  if (!query) {
    return jsonResult({ status: "error", error: "query is required" });
  }

  const inheritance = getInheritanceSystem(agentId);
  if (!inheritance) {
    return jsonResult({ 
      status: "error", 
      error: `Agent ${agentId} 是主 Agent，请直接使用 NSEM2Core 检索记忆，而不是选择性记忆继承系统` 
    });
  }

  // 确定搜索范围
  const scopes: MemoryScope[] = scopeParam
    ? [scopeParam as MemoryScope]
    : ["inherited", "shared", "personal"];

  const results = await inheritance.retrieve(query, {
    maxResults,
    scopes,
    includeInherited: scopes.includes("inherited"),
  });

  const formatted = results.map((r) => ({
    id: "atom" in r.item ? r.item.atom.id : r.item.id,
    content: ("atom" in r.item ? r.item.atom.content : r.item.content).slice(0, 100),
    score: r.score,
    scope: r.scope,
    source: "source" in r.item ? r.item.source : undefined,
  }));

  return jsonResult({
    status: "ok",
    action: "memory_retrieve",
    query,
    scopes,
    result_count: results.length,
    results: formatted,
    text: `检索 "${query}" (${scopes.join(", ")}): 找到 ${results.length} 条结果`,
  });
}

async function handleMemoryAnnotate(agentId: string, params: Record<string, unknown>) {
  const memoryId = readStringParam(params, "memory_id", { required: true });
  const annotation = readStringParam(params, "annotation", { required: true });

  if (!memoryId || !annotation) {
    return jsonResult({ status: "error", error: "memory_id and annotation are required" });
  }

  const inheritance = getInheritanceSystem(agentId);
  if (!inheritance) {
    return jsonResult({ 
      status: "error", 
      error: `Agent ${agentId} 是主 Agent，不支持继承记忆注释功能` 
    });
  }

  const result = await inheritance.annotateInherited(memoryId, annotation);

  return jsonResult({
    status: "ok",
    action: "memory_annotate",
    memory_id: memoryId,
    annotation_id: result.annotationId,
    text: `已为记忆 ${memoryId.slice(0, 8)}... 添加注释`,
  });
}

async function handleMemorySnapshot(agentId: string, params: Record<string, unknown>) {
  const name = readStringParam(params, "snapshot_name", { required: true });

  if (!name) {
    return jsonResult({ status: "error", error: "snapshot_name is required" });
  }

  const inheritance = getInheritanceSystem(agentId);
  if (!inheritance) {
    return jsonResult({ 
      status: "error", 
      error: `Agent ${agentId} 是主 Agent，不支持记忆快照功能` 
    });
  }

  const snapshot = inheritance.createSnapshot(name);

  return jsonResult({
    status: "ok",
    action: "memory_snapshot",
    snapshot_id: snapshot.id,
    name: snapshot.name,
    memory_count: snapshot.count,
    created_at: snapshot.createdAt,
    text: `创建快照 "${name}": ${snapshot.count} 条记忆`,
  });
}

async function handleMemoryRestore(agentId: string, params: Record<string, unknown>) {
  const snapshotId = readStringParam(params, "snapshot_id", { required: true });

  if (!snapshotId) {
    return jsonResult({ status: "error", error: "snapshot_id is required" });
  }

  const inheritance = getInheritanceSystem(agentId);
  if (!inheritance) {
    return jsonResult({ 
      status: "error", 
      error: `Agent ${agentId} 是主 Agent，不支持记忆快照恢复功能` 
    });
  }

  const result = await inheritance.restoreSnapshot(snapshotId);

  return jsonResult({
    status: "ok",
    action: "memory_restore",
    snapshot_id: snapshotId,
    restored: result.restored,
    text: `恢复快照: ${result.restored} 条记忆已恢复`,
  });
}

async function handleMemoryStats(agentId: string) {
  const inheritance = getInheritanceSystem(agentId);
  if (!inheritance) {
    // 主 Agent - 从 NSEM 获取统计
    const { getCoreInstance } = await import("./unified-cognitive-tool.js");
    const core = getCoreInstance(agentId);
    
    if (core) {
      const stats = core.getStats();
      return jsonResult({ 
        status: "ok",
        agent_id: agentId,
        agent_type: "main",
        source: "nsem",
        stats: {
          atoms: stats.memory.total,
          edges: stats.edges,
          fields: stats.fields,
          working: stats.memory.working,
          shortTerm: stats.memory.shortTerm,
          cacheHitRate: `${(stats.cache.hitRate * 100).toFixed(1)}%`,
        },
        text: `NSEM 记忆统计:\n- 原子: ${stats.memory.total}\n- 边: ${stats.edges}\n- 场: ${stats.fields}\n- 缓存命中率: ${(stats.cache.hitRate * 100).toFixed(1)}%`,
      });
    }
    
    return jsonResult({ 
      status: "ok",
      agent_id: agentId,
      agent_type: "main",
      message: "主 Agent 不使用选择性记忆继承系统，NSEM 核心未启动",
      stats: null
    });
  }
  
  // 子 Agent - 使用选择性记忆继承系统
  const stats = inheritance.getStats();

  return jsonResult({
    status: "ok",
    action: "memory_stats",
    stats: {
      inherited: stats.inherited,
      shared: stats.shared,
      personal: stats.personal,
      total: stats.total,
      subscriptions: stats.subscriptions,
      snapshots: stats.snapshots,
    },
    text: `记忆统计:\n- 继承: ${stats.inherited}\n- 共享: ${stats.shared}\n- 私有: ${stats.personal}\n- 总计: ${stats.total}`,
  });
}

async function handleCollaborationStart(sessionKey: string, params: Record<string, unknown>) {
  const system = getCollaborationSystem(sessionKey, USE_REAL_SUBAGENTS);
  const strategyName = readStringParam(params, "strategy") ?? "parallel-fast";

  // 策略映射
  const strategyMap: Record<
    string,
    import("../../cognitive-core/multi-agent/MultiAgentCollaboration.js").CollaborationStrategy
  > = {
    "parallel-fast": {
      id: "parallel-fast",
      name: "并行快速",
      type: "parallel",
      assignmentAlgorithm: "load-balanced",
      aggregationMethod: "concatenate",
      parameters: {
        maxParallelTasks: 5,
        timeoutSeconds: 60,
        retryAttempts: 1,
        qualityThreshold: 0.6,
      },
    },
    "sequential-quality": {
      id: "sequential-quality",
      name: "顺序质量",
      type: "sequential",
      assignmentAlgorithm: "capability-based",
      aggregationMethod: "merge",
      parameters: {
        maxParallelTasks: 1,
        timeoutSeconds: 120,
        retryAttempts: 3,
        qualityThreshold: 0.85,
      },
    },
    "hierarchical-adaptive": {
      id: "hierarchical-adaptive",
      name: "分层自适应",
      type: "hierarchical",
      assignmentAlgorithm: "auction",
      aggregationMethod: "summarize",
      parameters: {
        maxParallelTasks: 3,
        timeoutSeconds: 180,
        retryAttempts: 2,
        qualityThreshold: 0.75,
      },
    },
  };

  const strategy = strategyMap[strategyName] ?? strategyMap["parallel-fast"];
  const session = system.createSession(strategy);

  return jsonResult({
    status: "ok",
    action: "collaboration_start",
    session_id: session.id,
    strategy: strategyName,
    participants: Array.from(session.participants.keys()),
    text: `协作会话已启动: ${session.id}\n策略: ${strategy.name}\n参与者: ${session.participants.size}`,
  });
}

async function handleCollaborationTask(sessionKey: string, params: Record<string, unknown>) {
  const system = getCollaborationSystem(sessionKey, USE_REAL_SUBAGENTS);
  const sessionId = readStringParam(params, "session_id", { required: true });
  const description = readStringParam(params, "task_description", { required: true });
  const content = readStringParam(params, "task_content", { required: true });
  const type = readStringParam(params, "task_type") ?? "analysis";
  const priority = readNumberParam(params, "priority") ?? 5;

  if (!sessionId || !description || !content) {
    return jsonResult({
      status: "error",
      error: "session_id, task_description, task_content are required",
    });
  }

  const session = system.getSession(sessionId);
  if (!session) {
    return jsonResult({ status: "error", error: `Session ${sessionId} not found` });
  }

  const task = system.addTask(sessionId, {
    type: type as import("../../cognitive-core/multi-agent/MultiAgentCollaboration.js").TaskType,
    description,
    content,
    priority,
    dependencies: [],
  });

  return jsonResult({
    status: "ok",
    action: "collaboration_task",
    session_id: sessionId,
    task_id: task.id,
    type,
    priority,
    text: `任务已添加: ${task.id.slice(0, 8)}...\n描述: ${description.slice(0, 50)}`,
  });
}

async function handleCollaborationStatus(sessionKey: string, params: Record<string, unknown>) {
  const system = getCollaborationSystem(sessionKey, USE_REAL_SUBAGENTS);
  const sessionId = readStringParam(params, "session_id");

  if (sessionId) {
    const session = system.getSession(sessionId);
    if (!session) {
      return jsonResult({ status: "error", error: `Session ${sessionId} not found` });
    }

    const tasks = Array.from(session.tasks.values());
    const completed = tasks.filter((t) => t.status === "completed").length;
    const failed = tasks.filter((t) => t.status === "failed").length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const running = tasks.filter((t) => t.status === "running").length;

    return jsonResult({
      status: "ok",
      action: "collaboration_status",
      session_id: sessionId,
      session_status: session.status,
      tasks: {
        total: tasks.length,
        pending,
        running,
        completed,
        failed,
      },
      text: `会话 ${sessionId.slice(0, 8)}... 状态: ${session.status}\n任务: ${completed}/${tasks.length} 完成, ${failed} 失败`,
    });
  }

  // 返回所有会话状态
  const sessions = system.getAllSessions();
  return jsonResult({
    status: "ok",
    action: "collaboration_status",
    total_sessions: sessions.length,
    active_sessions: system.getActiveSessions().length,
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      task_count: s.metadata.totalTasks,
    })),
    text: `活跃会话: ${system.getActiveSessions().length}/${sessions.length}`,
  });
}

async function handleResilientExecute(sessionKey: string, params: Record<string, unknown>) {
  const orchestrator = getOrchestrator(sessionKey);
  const taskName = readStringParam(params, "task_name", { required: true });
  const timeout = readNumberParam(params, "timeout") ?? 30000;
  const useCircuitBreaker = params["use_circuit_breaker"] !== false;
  const useRetry = params["use_retry"] !== false;

  if (!taskName) {
    return jsonResult({ status: "error", error: "task_name is required" });
  }

  // 注意：实际执行需要具体的函数，这里简化处理
  return jsonResult({
    status: "ok",
    action: "resilient_execute",
    task_name: taskName,
    config: {
      timeout,
      use_circuit_breaker: useCircuitBreaker,
      use_retry: useRetry,
    },
    text: `弹性任务配置已设置: ${taskName}\n超时: ${timeout}ms, 断路器: ${useCircuitBreaker}, 重试: ${useRetry}`,
  });
}

async function handleCircuitBreakerStatus(sessionKey: string, params: Record<string, unknown>) {
  const orchestrator = getOrchestrator(sessionKey);
  const taskName = readStringParam(params, "task_name");

  if (taskName) {
    const breaker = orchestrator.getOrCreateCircuitBreaker(taskName);
    const stats = breaker.getStats();

    return jsonResult({
      status: "ok",
      action: "circuit_breaker_status",
      task_name: taskName,
      state: stats.state,
      failure_count: stats.failureCount,
      success_count: stats.successCount,
      total_calls: stats.totalCalls,
      text: `断路器 ${taskName}: ${stats.state}\n失败: ${stats.failureCount}, 成功: ${stats.successCount}, 总计: ${stats.totalCalls}`,
    });
  }

  // 返回所有断路器状态
  const stats = orchestrator.getStats();
  return jsonResult({
    status: "ok",
    action: "circuit_breaker_status",
    circuit_breakers: stats.circuitBreakers,
    text: `断路器总数: ${stats.circuitBreakers.length}`,
  });
}

async function handleDeadLetterQueue(sessionKey: string, params: Record<string, unknown>) {
  const orchestrator = getOrchestrator(sessionKey);
  const dlq = orchestrator.getDeadLetterQueue();
  const stats = dlq.getStats();

  return jsonResult({
    status: "ok",
    action: "dead_letter_queue",
    total_entries: stats.total,
    by_category: stats.byCategory,
    avg_replay_count: stats.avgReplayCount,
    text: `死信队列: ${stats.total} 条目\n可重试: ${stats.byCategory.RETRYABLE}, 瞬态: ${stats.byCategory.TRANSIENT}, 永久: ${stats.byCategory.PERMANENT}`,
  });
}

async function handleDeadLetterReplay(sessionKey: string, params: Record<string, unknown>) {
  const orchestrator = getOrchestrator(sessionKey);
  const entryId = readStringParam(params, "entry_id");
  const filter = readStringParam(params, "replay_filter") ?? "all";

  if (entryId) {
    const result = await orchestrator.replayDeadLetter(entryId);
    return jsonResult({
      status: result.success ? "ok" : "error",
      action: "dead_letter_replay",
      entry_id: entryId,
      success: result.success,
      error: result.error?.message,
      text: result.success
        ? `条目 ${entryId.slice(0, 8)}... 重放成功`
        : `重放失败: ${result.error?.message}`,
    });
  }

  // 批量重放
  const filterFn =
    filter === "all"
      ? undefined
      : (
          entry: import("../../cognitive-core/multi-agent/ResilientSubagentOrchestrator.js").DeadLetterEntry,
        ) => {
          if (filter === "retryable") return entry.category === "RETRYABLE";
          if (filter === "transient") return entry.category === "TRANSIENT";
          if (filter === "permanent") return entry.category === "PERMANENT";
          return true;
        };

  const result = await orchestrator.replayAllDeadLetters(filterFn);

  return jsonResult({
    status: "ok",
    action: "dead_letter_replay",
    filter,
    total: result.total,
    success: result.success,
    failed: result.failed,
    text: `批量重放完成: ${result.success}/${result.total} 成功, ${result.failed} 失败`,
  });
}

async function handleMonitorStatus(sessionKey: string) {
  const monitor = createMetaCognitionMonitor();
  const state = monitor.getCurrentState();
  const stats = monitor.getStats();

  return jsonResult({
    status: "ok",
    action: "monitor_status",
    health: state.health,
    load: state.load,
    performance_trend: state.performanceTrend,
    error_rate: state.errorRate,
    active_operations: state.activeOperations,
    stats: {
      total_operations: stats.totalOperations,
      success_rate: stats.successRate,
      avg_quality: stats.avgQuality,
    },
    text: `系统健康度: ${(state.health * 100).toFixed(1)}%\n负载: ${(state.load * 100).toFixed(1)}%\n趋势: ${state.performanceTrend}`,
  });
}

// ============================================================================
// 子代理生命周期管理
// ============================================================================

async function handleSubagentCreate(sessionKey: string, params: Record<string, unknown>) {
  const subagentId = readStringParam(params, "subagent_id", { required: true });
  const task = readStringParam(params, "task", { required: true });
  const mode = readStringParam(params, "subagent_mode") ?? "session";
  const thread = params["subagent_thread"] !== false;
  const cleanup = readStringParam(params, "subagent_cleanup") ?? "keep";
  const model = readStringParam(params, "model");
  const timeoutSeconds = readNumberParam(params, "timeout_seconds") ?? 300;

  if (!subagentId || !task) {
    return jsonResult({
      status: "error",
      error: "subagent_id and task are required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  
  try {
    const sessionInfo = await orchestrator.createSubagent(subagentId, task, {
      thread,
      cleanup: cleanup as "delete" | "keep",
      model,
      timeoutSeconds,
    });

    return jsonResult({
      status: "ok",
      action: "subagent_create",
      subagent_id: subagentId,
      session_key: sessionInfo.sessionKey,
      run_id: sessionInfo.runId,
      mode: sessionInfo.mode,
      created_at: sessionInfo.createdAt,
      text: `子代理 ${subagentId} 创建成功\n会话: ${sessionInfo.sessionKey}\n模式: ${sessionInfo.mode}`,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return jsonResult({
      status: "error",
      error: `创建子代理失败: ${err.message}`,
    });
  }
}

async function handleSubagentSend(sessionKey: string, params: Record<string, unknown>) {
  const subagentId = readStringParam(params, "subagent_id", { required: true });
  const message = readStringParam(params, "message", { required: true });
  const timeoutSeconds = readNumberParam(params, "timeout_seconds") ?? 30;

  if (!subagentId || !message) {
    return jsonResult({
      status: "error",
      error: "subagent_id and message are required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const result = await orchestrator.sendMessageToSubagent(subagentId, message, {
    timeoutSeconds,
    waitForReply: timeoutSeconds > 0,
  });

  return jsonResult({
    status: result.success ? "ok" : "error",
    action: "subagent_send",
    subagent_id: subagentId,
    success: result.success,
    response: result.response,
    error: result.error,
    text: result.success
      ? `消息已发送给 ${subagentId}${result.response ? `\n回复: ${result.response.slice(0, 100)}...` : ""}`
      : `发送失败: ${result.error}`,
  });
}

async function handleSubagentClose(sessionKey: string, params: Record<string, unknown>) {
  const subagentId = readStringParam(params, "subagent_id", { required: true });
  const reason = readStringParam(params, "close_reason");

  if (!subagentId) {
    return jsonResult({
      status: "error",
      error: "subagent_id is required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const success = await orchestrator.closeSubagent(subagentId, reason);

  return jsonResult({
    status: success ? "ok" : "error",
    action: "subagent_close",
    subagent_id: subagentId,
    reason: reason ?? "正常关闭",
    text: success
      ? `子代理 ${subagentId} 已关闭${reason ? ` (原因: ${reason})` : ""}`
      : `关闭子代理 ${subagentId} 失败`,
  });
}

async function handleSubagentDelete(sessionKey: string, params: Record<string, unknown>) {
  const subagentId = readStringParam(params, "subagent_id", { required: true });

  if (!subagentId) {
    return jsonResult({
      status: "error",
      error: "subagent_id is required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const success = await orchestrator.deleteSubagent(subagentId);

  return jsonResult({
    status: success ? "ok" : "error",
    action: "subagent_delete",
    subagent_id: subagentId,
    text: success
      ? `子代理 ${subagentId} 已删除`
      : `删除子代理 ${subagentId} 失败`,
  });
}

async function handleSubagentList(sessionKey: string) {
  const orchestrator = getOrchestrator(sessionKey);
  const subagents = orchestrator.getAllSubagents();
  const stats = orchestrator.getSubagentStats();

  const formatted = subagents.map((s) => ({
    id: s.subagentId,
    session_key: s.sessionKey,
    mode: s.mode,
    is_active: s.isActive,
    created_at: s.createdAt,
    last_active_at: s.lastActiveAt,
  }));

  return jsonResult({
    status: "ok",
    action: "subagent_list",
    stats: {
      total: stats.total,
      active: stats.active,
      inactive: stats.inactive,
    },
    subagents: formatted,
    text: `子代理列表:\n总计: ${stats.total}, 活跃: ${stats.active}, 非活跃: ${stats.inactive}\n\n${formatted
      .map((s) => `${s.is_active ? "🟢" : "⚪"} ${s.id} (${s.mode})`)
      .join("\n")}`,
  });
}

async function handleSubagentStatus(sessionKey: string, params: Record<string, unknown>) {
  const subagentId = readStringParam(params, "subagent_id", { required: true });

  if (!subagentId) {
    return jsonResult({
      status: "error",
      error: "subagent_id is required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const info = orchestrator.getSubagentInfo(subagentId);

  if (!info) {
    return jsonResult({
      status: "error",
      error: `子代理 ${subagentId} 不存在`,
    });
  }

  return jsonResult({
    status: "ok",
    action: "subagent_status",
    subagent_id: subagentId,
    session_key: info.sessionKey,
    run_id: info.runId,
    mode: info.mode,
    is_active: info.isActive,
    created_at: info.createdAt,
    last_active_at: info.lastActiveAt,
    metadata: info.metadata,
    text: `子代理 ${subagentId} 状态:\n会话: ${info.sessionKey}\n模式: ${info.mode}\n状态: ${
      info.isActive ? "🟢 活跃" : "⚪ 非活跃"
    }\n创建: ${new Date(info.createdAt).toLocaleString()}`,
  });
}

async function handleSubagentA2A(sessionKey: string, params: Record<string, unknown>) {
  const sourceSubagentId = readStringParam(params, "subagent_id", { required: true });
  const targetSubagentId = readStringParam(params, "target_subagent_id", { required: true });
  const message = readStringParam(params, "message", { required: true });

  if (!sourceSubagentId || !targetSubagentId || !message) {
    return jsonResult({
      status: "error",
      error: "subagent_id, target_subagent_id, and message are required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const result = await orchestrator.agentToAgentCommunication(
    sourceSubagentId,
    targetSubagentId,
    message,
  );

  return jsonResult({
    status: result.success ? "ok" : "error",
    action: "subagent_a2a",
    from: sourceSubagentId,
    to: targetSubagentId,
    success: result.success,
    error: result.error,
    text: result.success
      ? `${sourceSubagentId} -> ${targetSubagentId}: 消息已发送`
      : `A2A 通信失败: ${result.error}`,
  });
}

// ============================================================================
// Work Queue & Pipeline Handlers
// ============================================================================

async function handleQueueSubmit(sessionKey: string, params: Record<string, unknown>) {
  const type = readStringParam(params, "queue_type", { required: true });
  const content = readStringParam(params, "queue_content", { required: true });
  const priority = readNumberParam(params, "priority") ?? 5;

  if (!type || !content) {
    return jsonResult({
      status: "error",
      error: "queue_type and queue_content are required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const task = orchestrator.submitTaskToQueue(type, content, { priority });

  return jsonResult({
    status: "ok",
    action: "queue_submit",
    task_id: task.id,
    type: task.type,
    priority: task.priority,
    task_status: task.status,
    text: `任务已提交: ${task.id.slice(0, 8)}...\n类型: ${type}\n优先级: ${priority}`,
  });
}

async function handleQueueClaim(sessionKey: string, params: Record<string, unknown>) {
  const subagentId = readStringParam(params, "subagent_id", { required: true });

  if (!subagentId) {
    return jsonResult({
      status: "error",
      error: "subagent_id is required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const task = orchestrator.claimTaskFromQueue(subagentId);

  if (!task) {
    return jsonResult({
      status: "ok",
      action: "queue_claim",
      subagent_id: subagentId,
      has_task: false,
      text: `子代理 ${subagentId}: 没有可领取的任务`,
    });
  }

  return jsonResult({
    status: "ok",
    action: "queue_claim",
    subagent_id: subagentId,
    has_task: true,
    task_id: task.id,
    type: task.type,
    content: task.content,
    priority: task.priority,
    text: `子代理 ${subagentId} 领取任务: ${task.id.slice(0, 8)}...\n类型: ${task.type}`,
  });
}

async function handleQueueComplete(sessionKey: string, params: Record<string, unknown>) {
  const taskId = readStringParam(params, "task_id", { required: true });
  const subagentId = readStringParam(params, "subagent_id", { required: true });
  const result = readStringParam(params, "queue_result", { required: true });

  if (!taskId || !subagentId || !result) {
    return jsonResult({
      status: "error",
      error: "task_id, subagent_id, and queue_result are required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const success = orchestrator.completeQueueTask(taskId, subagentId, result);

  return jsonResult({
    status: success ? "ok" : "error",
    action: "queue_complete",
    task_id: taskId,
    subagent_id: subagentId,
    text: success
      ? `任务 ${taskId.slice(0, 8)}... 已完成`
      : `任务完成报告失败: 任务不存在或不属于 ${subagentId}`,
  });
}

async function handleQueueFail(sessionKey: string, params: Record<string, unknown>) {
  const taskId = readStringParam(params, "task_id", { required: true });
  const subagentId = readStringParam(params, "subagent_id", { required: true });
  const error = readStringParam(params, "queue_error", { required: true });

  if (!taskId || !subagentId || !error) {
    return jsonResult({
      status: "error",
      error: "task_id, subagent_id, and queue_error are required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const success = orchestrator.failQueueTask(taskId, subagentId, error);

  return jsonResult({
    status: success ? "ok" : "error",
    action: "queue_fail",
    task_id: taskId,
    subagent_id: subagentId,
    error: error,
    text: success
      ? `任务 ${taskId.slice(0, 8)}... 标记为失败`
      : `任务失败报告失败: 任务不存在或不属于 ${subagentId}`,
  });
}

async function handleQueueList(sessionKey: string) {
  const orchestrator = getOrchestrator(sessionKey);
  const tasks = orchestrator.getAllQueueTasks();
  const stats = orchestrator.getQueueStats();

  const formatted = tasks.map((t) => ({
    id: t.id,
    type: t.type,
    status: t.status,
    priority: t.priority,
    assigned_to: t.assignedTo,
    created_at: t.createdAt,
  }));

  return jsonResult({
    status: "ok",
    action: "queue_list",
    stats,
    tasks: formatted,
    text: `队列统计:\n等待: ${stats.pending}, 处理中: ${stats.processing}, 完成: ${stats.completed}, 失败: ${stats.failed}\n总计: ${stats.total}`,
  });
}

async function handleQueueStats(sessionKey: string) {
  const orchestrator = getOrchestrator(sessionKey);
  const stats = orchestrator.getQueueStats();

  return jsonResult({
    status: "ok",
    action: "queue_stats",
    stats,
    text: `队列统计:\n- 等待: ${stats.pending}\n- 处理中: ${stats.processing}\n- 完成: ${stats.completed}\n- 失败: ${stats.failed}\n- 总计: ${stats.total}`,
  });
}

async function handlePipelineCreate(sessionKey: string, params: Record<string, unknown>) {
  const name = readStringParam(params, "pipeline_name", { required: true });
  const stagesParam = params["pipeline_stages"];

  if (!name || !Array.isArray(stagesParam)) {
    return jsonResult({
      status: "error",
      error: "pipeline_name and pipeline_stages are required",
    });
  }

  const stages = stagesParam.map((s: Record<string, unknown>) => ({
    name: String(s.name || ""),
    description: String(s.description || ""),
    subagentId: String(s.subagent_id || ""),
    timeoutSeconds: Number(s.timeout_seconds) || 300,
    blocking: s.blocking !== false,
    maxRetries: Number(s.max_retries) || 3,
  }));

  const orchestrator = getOrchestrator(sessionKey);
  const pipeline = orchestrator.createPipeline(name, stages);

  return jsonResult({
    status: "ok",
    action: "pipeline_create",
    pipeline_id: pipeline.id,
    name: pipeline.name,
    stage_count: pipeline.stages.length,
    stages: pipeline.stages.map((s) => ({ name: s.name, subagent_id: s.subagentId })),
    text: `Pipeline 创建成功: ${name}\nID: ${pipeline.id.slice(0, 8)}...\n阶段: ${pipeline.stages.length}`,
  });
}

async function handlePipelineSubmit(sessionKey: string, params: Record<string, unknown>) {
  const pipelineId = readStringParam(params, "pipeline_id", { required: true });
  const content = readStringParam(params, "queue_content", { required: true });
  const priority = readNumberParam(params, "priority") ?? 5;

  if (!pipelineId || !content) {
    return jsonResult({
      status: "error",
      error: "pipeline_id and queue_content are required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const task = orchestrator.submitPipelineTask(pipelineId, content, { priority });

  return jsonResult({
    status: "ok",
    action: "pipeline_submit",
    task_id: task.id,
    pipeline_id: pipelineId,
    stage: task.pipelineStage,
    text: `Pipeline 任务已提交: ${task.id.slice(0, 8)}...\nPipeline: ${pipelineId.slice(0, 8)}...`,
  });
}

async function handlePipelineList(sessionKey: string) {
  const orchestrator = getOrchestrator(sessionKey);
  const pipelines = orchestrator.getAllPipelines();

  const formatted = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    stage_count: p.stages.length,
    stages: p.stages.map((s) => ({ name: s.name, subagent_id: s.subagentId })),
  }));

  return jsonResult({
    status: "ok",
    action: "pipeline_list",
    count: pipelines.length,
    pipelines: formatted,
    text: `Pipeline 列表 (${pipelines.length}):\n${formatted
      .map((p) => `- ${p.name}: ${p.stage_count} 阶段`)
      .join("\n")}`,
  });
}

async function handlePipelineStatus(sessionKey: string, params: Record<string, unknown>) {
  const pipelineId = readStringParam(params, "pipeline_id", { required: true });

  if (!pipelineId) {
    return jsonResult({
      status: "error",
      error: "pipeline_id is required",
    });
  }

  const orchestrator = getOrchestrator(sessionKey);
  const pipeline = orchestrator.getPipeline(pipelineId);

  if (!pipeline) {
    return jsonResult({
      status: "error",
      error: `Pipeline ${pipelineId} 不存在`,
    });
  }

  return jsonResult({
    status: "ok",
    action: "pipeline_status",
    pipeline_id: pipeline.id,
    name: pipeline.name,
    stage_count: pipeline.stages.length,
    stages: pipeline.stages.map((s, i) => ({
      index: i + 1,
      name: s.name,
      subagent_id: s.subagentId,
      description: s.description,
    })),
    text: `Pipeline: ${pipeline.name}\n阶段:\n${pipeline.stages
      .map((s, i) => `${i + 1}. ${s.name} -> ${s.subagentId}`)
      .join("\n")}`,
  });
}

// ============================================================================
// 工具创建函数
// ============================================================================

export function createCognitiveCoreTool(options?: { agentSessionKey?: string }): AnyAgentTool {
  return {
    label: "CognitiveCore",
    name: "cognitive_core",
    description:
      "Cognitive core operations including memory management (working/short-term/long-term), " +
      "resilient task execution with circuit breaker and retry, multi-agent collaboration, " +
      "dead letter queue management, system monitoring, subagent lifecycle management, " +
      "work queue and pipeline processing. " +
      "Actions: memory_store, memory_retrieve, memory_stats, " +
      "collaboration_start, collaboration_task, collaboration_status, " +
      "resilient_execute, circuit_breaker_status, " +
      "dead_letter_queue, dead_letter_replay, monitor_status, " +
      "subagent_create, subagent_send, subagent_close, subagent_delete, subagent_list, subagent_status, subagent_a2a, " +
      "queue_submit, queue_claim, queue_complete, queue_fail, queue_list, queue_stats, " +
      "pipeline_create, pipeline_submit, pipeline_list, pipeline_status.",
    parameters: CognitiveCoreToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action") ?? "memory_stats";
      const sessionKey = options?.agentSessionKey ?? "default";
      const agentId = readStringParam(params, "agent_id") ?? sessionKey;

      try {
        switch (action) {
          // 选择性记忆继承
          case "inherit_memory":
            return await handleInheritMemory(agentId, params);

          case "memory_store":
            return await handleMemoryStore(agentId, params);

          case "memory_retrieve":
            return await handleMemoryRetrieve(agentId, params);

          case "memory_annotate":
            return await handleMemoryAnnotate(agentId, params);

          case "memory_snapshot":
            return await handleMemorySnapshot(agentId, params);

          case "memory_restore":
            return await handleMemoryRestore(agentId, params);

          case "memory_stats":
            return await handleMemoryStats(agentId);

          // 协作和弹性
          case "collaboration_start":
            return await handleCollaborationStart(sessionKey, params);

          case "collaboration_task":
            return await handleCollaborationTask(sessionKey, params);

          case "collaboration_status":
            return await handleCollaborationStatus(sessionKey, params);

          case "resilient_execute":
            return await handleResilientExecute(sessionKey, params);

          case "circuit_breaker_status":
            return await handleCircuitBreakerStatus(sessionKey, params);

          case "dead_letter_queue":
            return await handleDeadLetterQueue(sessionKey, params);

          case "dead_letter_replay":
            return await handleDeadLetterReplay(sessionKey, params);

          case "monitor_status":
            return await handleMonitorStatus(sessionKey);

          // 子代理生命周期管理
          case "subagent_create":
            return await handleSubagentCreate(sessionKey, params);

          case "subagent_send":
            return await handleSubagentSend(sessionKey, params);

          case "subagent_close":
            return await handleSubagentClose(sessionKey, params);

          case "subagent_delete":
            return await handleSubagentDelete(sessionKey, params);

          case "subagent_list":
            return await handleSubagentList(sessionKey);

          case "subagent_status":
            return await handleSubagentStatus(sessionKey, params);

          case "subagent_a2a":
            return await handleSubagentA2A(sessionKey, params);

          // 工作队列
          case "queue_submit":
            return await handleQueueSubmit(sessionKey, params);

          case "queue_claim":
            return await handleQueueClaim(sessionKey, params);

          case "queue_complete":
            return await handleQueueComplete(sessionKey, params);

          case "queue_fail":
            return await handleQueueFail(sessionKey, params);

          case "queue_list":
            return await handleQueueList(sessionKey);

          case "queue_stats":
            return await handleQueueStats(sessionKey);

          // Pipeline
          case "pipeline_create":
            return await handlePipelineCreate(sessionKey, params);

          case "pipeline_submit":
            return await handlePipelineSubmit(sessionKey, params);

          case "pipeline_list":
            return await handlePipelineList(sessionKey);

          case "pipeline_status":
            return await handlePipelineStatus(sessionKey, params);

          default:
            return jsonResult({
              status: "error",
              error: `Unknown action: ${action}`,
              available_actions: COGNITIVE_ACTIONS,
            });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`Cognitive core tool error: ${err.message}`);
        return jsonResult({
          status: "error",
          error: err.message,
          action,
        });
      }
    },
  };
}
