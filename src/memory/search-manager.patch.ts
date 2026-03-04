/**
 * search-manager.ts 的 Unified Core V2 集成补丁
 *
 * 使用方式：
 * 1. 将此文件中的代码片段复制到 search-manager.ts
 * 2. 或者使用 patch 命令：patch src/memory/search-manager.ts < search-manager.patch.diff
 */

// ============================================================================
// 第 1 步：添加导入
// ============================================================================

// 在文件顶部，现有导入之后添加：
/*
import {
  UnifiedCoreV2Adapter,
  createUnifiedCoreV2Adapter,
} from "./unified-core-v2-adapter.js";
*/

// ============================================================================
// 第 2 步：添加缓存
// ============================================================================

// 在 QMD_MANAGER_CACHE 和 HYBRID_MANAGER_CACHE 定义之后添加：
// const UNIFIED_CORE_V2_CACHE = new Map<string, UnifiedCoreV2Adapter>();

// ============================================================================
// 第 3 步：修改 getMemorySearchManager 函数
// ============================================================================

// 在函数开始处，检查 NSEM 启用后添加 Unified Core V2 检查：
/*
export async function getMemorySearchManager(params: {
  cfg: NsemclawConfig;
  agentId: string;
  purpose?: "default" | "status";
}): Promise<MemorySearchManagerResult> {
  // ... 现有代码 ...

  // 新增：检查是否启用 Unified Core V2
  const unifiedCoreV2Mode = getUnifiedCoreV2Mode(cfg, params.agentId);
  
  if (unifiedCoreV2Mode) {
    try {
      const unifiedAdapter = await createUnifiedCoreV2Manager(
        params,
        cfg,
        unifiedCoreV2Mode,
        statusOnly,
        cacheKey
      );
      if (unifiedAdapter) {
        if (!statusOnly) {
          UNIFIED_CORE_V2_CACHE.set(cacheKey, unifiedAdapter);
        }
        log.info(`Unified Core V2 已启动 (agent: ${params.agentId}, mode: ${unifiedCoreV2Mode})`);
        return { manager: unifiedAdapter };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Unified Core V2 初始化失败: ${message}`);
      // 继续尝试其他系统
    }
  }

  // ... 现有 NSEM 和传统系统的代码 ...
}
*/

// ============================================================================
// 第 4 步：添加 Unified Core V2 管理器创建函数
// ============================================================================

/*
async function createUnifiedCoreV2Manager(
  params: { cfg: NsemclawConfig; agentId: string },
  cfg: NsemclawConfig,
  mode: "unified-nsem2" | "three-tier" | "hybrid",
  statusOnly: boolean,
  cacheKey: string,
): Promise<UnifiedCoreV2Adapter | null> {
  // 检查缓存
  if (!statusOnly) {
    const cached = UNIFIED_CORE_V2_CACHE.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const memoryConfig = resolveMemorySearchConfig(cfg, params.agentId);
  
  const adapter = createUnifiedCoreV2Adapter(params.agentId, {
    storageMode: mode,
    enableExtraction: true,
    enableSessionManager: true,
    workingMemoryCapacity: 15,
  });

  await adapter.initialize(cfg, memoryConfig ?? undefined);

  return adapter;
}
*/

// ============================================================================
// 第 5 步：添加配置读取函数
// ============================================================================

/*
function getUnifiedCoreV2Mode(
  cfg: NsemclawConfig,
  agentId: string,
): "unified-nsem2" | "three-tier" | "hybrid" | null {
  // 从配置中读取
  const agentList = cfg.agents?.list as Array<{
    id: string;
    unifiedCoreV2?: { enabled?: boolean; mode?: "unified-nsem2" | "three-tier" | "hybrid" };
  }> | undefined;
  
  const agentConfig = agentList?.find((a) => a.id === agentId);
  
  // 优先使用 agent 级别配置
  if (agentConfig?.unifiedCoreV2?.enabled === true) {
    return agentConfig.unifiedCoreV2.mode ?? "three-tier";
  }
  
  // 使用默认配置
  const defaults = (cfg.agents?.defaults as any)?.unifiedCoreV2;
  if (defaults?.enabled === true) {
    return defaults.mode ?? "three-tier";
  }
  
  return null;
}
*/

// ============================================================================
// 完整修改后的 getMemorySearchManager 函数
// ============================================================================

/*
export async function getMemorySearchManager(params: {
  cfg: NsemclawConfig;
  agentId: string;
  purpose?: "default" | "status";
}): Promise<MemorySearchManagerResult> {
  // 如果启用 NSEM，先自动注入默认配置
  let cfg = params.cfg;
  
  // 默认启用 NSEM（如果用户没有明确禁用）
  const agentList = cfg.agents?.list as Array<{ id: string; nsem?: { enabled?: boolean } }> | undefined;
  const nsemExplicitlyDisabled = (cfg.agents?.defaults as any)?.nsem?.enabled === false ||
    agentList?.find((a) => a.id === params.agentId)?.nsem?.enabled === false;
  
  if (!nsemExplicitlyDisabled) {
    cfg = injectNSEMDefaults(cfg);
    log.debug("NSEM defaults injected into config (enabled by default)");
  }

  const statusOnly = params.purpose === "status";
  const cacheKey = buildCacheKey(params.agentId, cfg);

  // 检查缓存
  if (!statusOnly) {
    const cached = 
      UNIFIED_CORE_V2_CACHE.get(cacheKey) ??
      HYBRID_MANAGER_CACHE.get(cacheKey) ??
      QMD_MANAGER_CACHE.get(cacheKey);
    if (cached) {
      return { manager: cached };
    }
  }

  // 1. 尝试 Unified Core V2
  const unifiedCoreV2Mode = getUnifiedCoreV2Mode(cfg, params.agentId);
  if (unifiedCoreV2Mode) {
    try {
      const unifiedAdapter = await createUnifiedCoreV2Manager(
        params, cfg, unifiedCoreV2Mode, statusOnly, cacheKey
      );
      if (unifiedAdapter) {
        if (!statusOnly) {
          UNIFIED_CORE_V2_CACHE.set(cacheKey, unifiedAdapter);
        }
        log.info(`Unified Core V2 已启动 (agent: ${params.agentId}, mode: ${unifiedCoreV2Mode})`);
        return { manager: unifiedAdapter };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Unified Core V2 初始化失败: ${message}`);
    }
  }

  // 2. 尝试创建混合管理器（NSEM + 传统系统）
  if (isNSEMEnabled(cfg, params.agentId)) {
    try {
      const hybridManager = await createHybridManager(params, cfg, statusOnly);
      if (hybridManager) {
        if (!statusOnly) {
          HYBRID_MANAGER_CACHE.set(cacheKey, hybridManager);
        }
        log.info(`NSEM混合记忆系统已启动 (agent: ${params.agentId})`);
        return { manager: hybridManager };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`NSEM混合记忆系统初始化失败: ${message}`);
    }
  }

  // 3. 回退到传统系统
  return getTraditionalManager(params, statusOnly, cacheKey);
}
*/

// ============================================================================
// 配置示例 (nsemclaw.config.json)
// ============================================================================

/*
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "enabled": true,
        "backend": "qmd"
      },
      "unifiedCoreV2": {
        "enabled": true,
        "mode": "three-tier"
      }
    },
    "list": [
      {
        "id": "my-agent",
        "unifiedCoreV2": {
          "enabled": true,
          "mode": "hybrid"
        }
      }
    ]
  }
}
*/

export {};
