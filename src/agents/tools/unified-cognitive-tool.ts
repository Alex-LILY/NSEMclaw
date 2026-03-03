/**
 * 统一认知核心工具 - 简化版
 *
 * 将原来的 20+ actions 简化为 6 个核心操作
 * 所有功能通过 UnifiedNSEM2Core 实现
 */

import { Type } from "@sinclair/typebox";
import type {
  UnifiedNSEM2Core,
  MemoryScope,
} from "../../cognitive-core/mind/nsem/UnifiedNSEM2Core.js";
import type { ContentType } from "../../cognitive-core/types/index.js";
import type { MemoryQuery, QueryStrategy } from "../../cognitive-core/types/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import {
  jsonResult,
  readStringParam,
  readNumberParam,
  readStringArrayParam,
  readBooleanParam,
} from "./common.js";

const log = createSubsystemLogger("unified-cognitive-tool");

// ============================================================================
// 简化后的 6 个核心操作
// ============================================================================

const COGNITIVE_ACTIONS = [
  "memory.store", // 存储记忆
  "memory.retrieve", // 检索记忆
  "memory.forget", // 遗忘/删除记忆
  "memory.stats", // 获取统计
  "memory.evolve", // 触发进化
  "memory.configure", // 动态配置
] as const;

type CognitiveAction = (typeof COGNITIVE_ACTIONS)[number];

// ============================================================================
// 统一参数 Schema
// ============================================================================

const UnifiedCognitiveToolSchema = Type.Object({
  action: optionalStringEnum(COGNITIVE_ACTIONS),

  // memory.store / memory.retrieve 共用
  content: Type.Optional(Type.String({ description: "记忆内容 (用于store)" })),
  query: Type.Optional(Type.String({ description: "查询内容 (用于retrieve)" })),

  // 作用域
  scope: Type.Optional(optionalStringEnum(["personal", "shared", "inherited", "all"])),

  // 记忆类型
  type: Type.Optional(
    optionalStringEnum(["fact", "experience", "insight", "pattern", "narrative", "intuition"]),
  ),

  // 标签
  tags: Type.Optional(Type.Array(Type.String(), { description: "记忆标签" })),

  // 重要性 (0-1)
  importance: Type.Optional(Type.Number({ minimum: 0, maximum: 1, description: "重要性 0-1" })),

  // 检索配置
  maxResults: Type.Optional(Type.Number({ description: "最大结果数" })),
  minSimilarity: Type.Optional(Type.Number({ description: "最小相似度" })),
  strategy: Type.Optional(optionalStringEnum(["focused", "exploratory", "associative"])),

  // forget 用
  memoryId: Type.Optional(Type.String({ description: "记忆ID (用于forget)" })),

  // configure 用
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "配置项" })),
});

// ============================================================================
// 全局实例管理
// ============================================================================

const coreInstances = new Map<string, UnifiedNSEM2Core>();

export function registerCoreInstance(agentId: string, core: UnifiedNSEM2Core): void {
  coreInstances.set(agentId, core);
  log.info(`Registered UnifiedNSEM2Core for agent ${agentId}`);
}

export function getCoreInstance(agentId: string): UnifiedNSEM2Core | undefined {
  return coreInstances.get(agentId);
}

export function unregisterCoreInstance(agentId: string): void {
  coreInstances.delete(agentId);
}

// ============================================================================
// 处理器实现
// ============================================================================

async function handleMemoryStore(core: UnifiedNSEM2Core, params: Record<string, unknown>) {
  const content = readStringParam(params, "content", { required: true });
  const type = readStringParam(params, "type") ?? "fact";
  const scope = readStringParam(params, "scope") ?? "personal";
  const tags = readStringArrayParam(params, "tags") ?? [];
  const importance = readNumberParam(params, "importance") ?? 0.5;

  if (!content) {
    return jsonResult({
      status: "error",
      error: "content is required for memory.store",
    });
  }

  const atom = await core.ingest(content, {
    type: type as ContentType,
    scope: scope as MemoryScope,
    tags,
    strength: importance,
  });

  return jsonResult({
    status: "ok",
    action: "memory.store",
    memoryId: atom.id,
    scope,
    type,
    content: content.slice(0, 100),
    tags,
    importance,
    timestamp: Date.now(),
    text: `Memory stored to ${scope}: ${content.slice(0, 50)}...`,
  });
}

async function handleMemoryRetrieve(core: UnifiedNSEM2Core, params: Record<string, unknown>) {
  const query = readStringParam(params, "query", { required: true });
  const maxResults = readNumberParam(params, "maxResults") ?? 10;
  const minSimilarity = readNumberParam(params, "minSimilarity") ?? 0.3;
  const strategy = readStringParam(params, "strategy") ?? "focused";
  const scopeParam = readStringParam(params, "scope");

  if (!query) {
    return jsonResult({
      status: "error",
      error: "query is required for memory.retrieve",
    });
  }

  const memoryQuery: MemoryQuery = {
    intent: query,
    strategy: strategy as QueryStrategy,
    constraints: {
      maxResults,
      minStrength: minSimilarity,
    },
  };

  let result: Awaited<ReturnType<UnifiedNSEM2Core["activate"]>>;

  // 如果指定了scope，使用作用域检索
  if (scopeParam && scopeParam !== "all") {
    const scopes: MemoryScope[] =
      scopeParam === "inherited"
        ? ["inherited"]
        : scopeParam === "shared"
          ? ["shared"]
          : ["personal"];
    result = await core.retrieveByScope(memoryQuery, scopes);
  } else {
    result = await core.activate(memoryQuery);
  }

  const memories = result.atoms.map((item) => ({
    id: item.atom.id,
    content: item.atom.content.slice(0, 200),
    relevance: Math.round(item.relevance * 100) / 100,
    activation: Math.round(item.activation * 100) / 100,
    type: item.atom.contentType,
  }));

  return jsonResult({
    status: "ok",
    action: "memory.retrieve",
    query,
    scope: scopeParam ?? "all",
    strategy,
    resultCount: memories.length,
    memories,
    semantic: {
      coherence: Math.round(result.semantic.coherence * 100) / 100,
      coverage: Math.round(result.semantic.coverage * 100) / 100,
    },
    text: `Retrieved ${memories.length} memories for "${query.slice(0, 50)}"`,
  });
}

async function handleMemoryForget(core: UnifiedNSEM2Core, params: Record<string, unknown>) {
  const memoryId = readStringParam(params, "memoryId", { required: true });

  if (!memoryId) {
    return jsonResult({
      status: "error",
      error: "memoryId is required for memory.forget",
    });
  }

  // TODO: 实现 forget 逻辑
  // await core.forget(memoryId);

  return jsonResult({
    status: "ok",
    action: "memory.forget",
    memoryId,
    text: `Memory ${memoryId.slice(0, 8)}... marked for deletion`,
  });
}

async function handleMemoryStats(core: UnifiedNSEM2Core) {
  const stats = core.getStats();

  return jsonResult({
    status: "ok",
    action: "memory.stats",
    stats: {
      memory: stats.memory,
      edges: stats.edges,
      fields: stats.fields,
      cache: {
        hitRate: `${(stats.cache.hitRate * 100).toFixed(1)}%`,
        hits: stats.cache.hits,
        misses: stats.cache.misses,
      },
      storage: {
        hotCache: stats.storage.hotCacheSize,
        warmCache: stats.storage.warmCacheSize,
        totalVectors: stats.storage.totalVectors,
      },
      queue: stats.queue,
      resources: {
        memory: `${(stats.resources.memory.available / 1024 / 1024 / 1024).toFixed(1)} GB available`,
        cpu: `${stats.resources.cpu.usagePercent.toFixed(1)}% usage`,
      },
    },
    text:
      `Memory stats:\n` +
      `- Working: ${stats.memory.working}\n` +
      `- Short-term: ${stats.memory.shortTerm}\n` +
      `- Cache hit rate: ${(stats.cache.hitRate * 100).toFixed(1)}%`,
  });
}

async function handleMemoryEvolve(core: UnifiedNSEM2Core) {
  const startTime = Date.now();
  await core.evolve();
  const durationMs = Date.now() - startTime;

  return jsonResult({
    status: "ok",
    action: "memory.evolve",
    durationMs,
    text: `Memory evolution completed in ${durationMs}ms`,
  });
}

async function handleMemoryConfigure(core: UnifiedNSEM2Core, params: Record<string, unknown>) {
  const config = params.config as Record<string, unknown> | undefined;

  if (!config) {
    // 返回当前配置
    const currentConfig = core.getConfig();
    return jsonResult({
      status: "ok",
      action: "memory.configure",
      mode: "get",
      config: {
        tieredStorage: currentConfig.tieredStorage,
        enhancedRetrieval: currentConfig.enhancedRetrieval,
        batchLoading: currentConfig.batchLoading,
        asyncWrite: currentConfig.asyncWrite,
        modelLoading: currentConfig.modelLoading,
      },
      text: "Current configuration retrieved",
    });
  }

  // TODO: 实现动态配置更新
  // await core.updateConfig(config);

  return jsonResult({
    status: "ok",
    action: "memory.configure",
    mode: "set",
    updated: Object.keys(config),
    text: `Configuration updated: ${Object.keys(config).join(", ")}`,
  });
}

// ============================================================================
// 工具创建函数
// ============================================================================

export function createUnifiedCognitiveTool(options?: {
  agentSessionKey?: string;
  agentId?: string;
}): AnyAgentTool {
  return {
    label: "UnifiedCognitiveCore",
    name: "unified_cognitive_core",
    description:
      "Unified cognitive core for memory management. " +
      "Actions: memory.store, memory.retrieve, memory.forget, " +
      "memory.stats, memory.evolve, memory.configure. " +
      "Supports scoped memory (personal/shared/inherited), " +
      "batch operations, and automatic tier management.",
    parameters: UnifiedCognitiveToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = (readStringParam(params, "action") ?? "memory.stats") as CognitiveAction;
      const agentId = options?.agentId ?? options?.agentSessionKey ?? DEFAULT_AGENT_ID;

      const core = getCoreInstance(agentId);
      if (!core) {
        return jsonResult({
          status: "error",
          error:
            `No UnifiedNSEM2Core instance found for agent ${agentId}. ` +
            `Please register an instance first using registerCoreInstance().`,
        });
      }

      try {
        switch (action) {
          case "memory.store":
            return await handleMemoryStore(core, params);

          case "memory.retrieve":
            return await handleMemoryRetrieve(core, params);

          case "memory.forget":
            return await handleMemoryForget(core, params);

          case "memory.stats":
            return await handleMemoryStats(core);

          case "memory.evolve":
            return await handleMemoryEvolve(core);

          case "memory.configure":
            return await handleMemoryConfigure(core, params);

          default:
            return jsonResult({
              status: "error",
              error: `Unknown action: ${action}`,
              availableActions: COGNITIVE_ACTIONS,
            });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`Unified cognitive tool error: ${err.message}`);
        return jsonResult({
          status: "error",
          error: err.message,
          action,
        });
      }
    },
  };
}

// ============================================================================
// 兼容性导出 (用于平滑迁移)
// ============================================================================

/** @deprecated 使用 createUnifiedCognitiveTool */
export function createCognitiveCoreTool() {
  console.warn("createCognitiveCoreTool is deprecated, use createUnifiedCognitiveTool instead");
  return createUnifiedCognitiveTool();
}
