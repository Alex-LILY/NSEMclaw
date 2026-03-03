/**
 * NSEM 集成入口
 *
 * 将NSEM无缝集成到Nsemclaw的记忆系统
 *
 * 使用方式:
 * ```typescript
 * // 在原有代码中替换:
 * const { manager } = await getMemorySearchManager({ cfg, agentId });
 *
 * // 改为:
 * const { manager } = await getEnhancedMemoryManager({ cfg, agentId });
 * // 返回的 manager 带有NSEM增强功能
 * ```
 */

import type { NsemclawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getMemorySearchManager } from "../../memory/search-manager.js";
import type { MemorySearchManager } from "../../memory/types.js";
import { wrapWithNSEM, type NSEMAdapterConfig } from "./NSEMAdapter.js";

const log = createSubsystemLogger("nsem-integration");

// 缓存包装后的管理器
const NSEM_WRAPPER_CACHE = new Map<string, ReturnType<typeof wrapWithNSEM>>();

export interface EnhancedMemoryManagerResult {
  manager: MemorySearchManager | null;
  error?: string;
  /** 是否使用了NSEM增强 */
  nsemEnabled: boolean;
}

/**
 * 获取增强的记忆管理器 (带NSEM)
 *
 * 这是原有 getMemorySearchManager 的增强版本
 * 如果配置中启用了NSEM，则返回包装后的管理器
 */
export async function getEnhancedMemoryManager(params: {
  cfg: NsemclawConfig;
  agentId: string;
  purpose?: "default" | "status";
}): Promise<EnhancedMemoryManagerResult> {
  const { cfg, agentId, purpose } = params;

  // 先获取基础管理器
  const baseResult = await getMemorySearchManager(params);

  if (!baseResult.manager) {
    return { manager: null, error: baseResult.error, nsemEnabled: false };
  }

  // 检查是否启用NSEM
  const nsemConfig = resolveNSEMConfig(cfg, agentId);

  if (!nsemConfig.enabled) {
    log.debug(`NSEM 已禁用 (agent: ${agentId})`);
    return { manager: baseResult.manager, nsemEnabled: false };
  }

  // 检查缓存
  const cacheKey = `${agentId}:${purpose || "default"}`;
  const cached = NSEM_WRAPPER_CACHE.get(cacheKey);
  if (cached && purpose !== "status") {
    log.debug(`NSEM 使用缓存 (agent: ${agentId})`);
    return { manager: cached as any, nsemEnabled: true };
  }

  // 创建包装器
  try {
    const wrapper = wrapWithNSEM(baseResult.manager, agentId, nsemConfig);

    if (purpose !== "status") {
      NSEM_WRAPPER_CACHE.set(cacheKey, wrapper);
    }

    log.info(`NSEM 已启用 (agent: ${agentId})`);
    return { manager: wrapper as any, nsemEnabled: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`NSEM 初始化失败: ${message}`);
    // 降级到基础管理器
    return { manager: baseResult.manager, error: message, nsemEnabled: false };
  }
}

/**
 * 清理NSEM缓存
 */
export function clearNSEMCache(agentId?: string): void {
  if (agentId) {
    // 清理特定agent的缓存
    for (const key of NSEM_WRAPPER_CACHE.keys()) {
      if (key.startsWith(`${agentId}:`)) {
        const wrapper = NSEM_WRAPPER_CACHE.get(key);
        wrapper?.close?.().catch(() => {});
        NSEM_WRAPPER_CACHE.delete(key);
      }
    }
  } else {
    // 清理所有缓存
    for (const wrapper of NSEM_WRAPPER_CACHE.values()) {
      wrapper?.close?.().catch(() => {});
    }
    NSEM_WRAPPER_CACHE.clear();
  }
}

/**
 * 从配置解析NSEM设置
 */
function resolveNSEMConfig(cfg: NsemclawConfig, agentId: string): NSEMAdapterConfig {
  const agentList = cfg.agents?.list ?? [];
  const agentEntry = agentList.find((a) => a.id === agentId);
  const defaults = cfg.agents?.defaults?.nsem;
  const agentCfg = agentEntry?.nsem;

  return {
    enabled: agentCfg?.enabled ?? defaults?.enabled ?? false,
    neuralSearchWeight: agentCfg?.neuralSearchWeight ?? defaults?.neuralSearchWeight ?? 0.7,
    traditionalSearchWeight:
      agentCfg?.traditionalSearchWeight ?? defaults?.traditionalSearchWeight ?? 0.3,
    autoEvolveIntervalMinutes:
      agentCfg?.autoEvolveIntervalMinutes ?? defaults?.autoEvolveIntervalMinutes ?? 60,
    ingestConversations: agentCfg?.ingestConversations ?? defaults?.ingestConversations ?? true,
    conversationIngest: {
      roles: agentCfg?.conversationIngest?.roles ??
        defaults?.conversationIngest?.roles ?? ["user", "assistant"],
      minLength:
        agentCfg?.conversationIngest?.minLength ?? defaults?.conversationIngest?.minLength ?? 20,
      batchSize:
        agentCfg?.conversationIngest?.batchSize ?? defaults?.conversationIngest?.batchSize ?? 5,
    },
    resultEnhancement: {
      includeEmergentRelations:
        agentCfg?.resultEnhancement?.includeEmergentRelations ??
        defaults?.resultEnhancement?.includeEmergentRelations ??
        true,
      includeFieldContext:
        agentCfg?.resultEnhancement?.includeFieldContext ??
        defaults?.resultEnhancement?.includeFieldContext ??
        true,
      associationDepth:
        agentCfg?.resultEnhancement?.associationDepth ??
        defaults?.resultEnhancement?.associationDepth ??
        2,
    },
  };
}

// 类型扩展 - 让TypeScript知道增强后的管理器有额外方法
declare module "../../memory/types.js" {
  interface MemorySearchManager {
    /** NSEM: 摄入对话消息 */
    ingestConversationMessage?(message: {
      role: string;
      content: string;
      timestamp?: number;
    }): Promise<void>;

    /** NSEM: 手动触发进化 */
    evolve?(): Promise<void>;

    /** NSEM: 获取生态状态 */
    getEcosystemState?(): any;

    /** NSEM: 联想搜索 */
    associativeSearch?(
      query: string,
      count?: number,
    ): Promise<Array<{ content: string; confidence: number }>>;
  }
}
