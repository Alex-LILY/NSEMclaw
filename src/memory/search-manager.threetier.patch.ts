/**
 * search-manager.ts 的 ThreeTier 集成补丁
 *
 * 将以下代码片段添加到 src/memory/search-manager.ts 中
 */

// ==================== 添加到文件顶部导入 ====================

// 在现有导入后添加：
// import type { ThreeTierSearchManager } from "../cognitive-core/adapter/ThreeTierSearchManager.js";

// ==================== 添加到缓存定义 ====================

// 在 QMD_MANAGER_CACHE 和 HYBRID_MANAGER_CACHE 后添加：
// const THREETIER_MANAGER_CACHE = new Map<string, ThreeTierSearchManager>();

// ==================== 添加到 getMemorySearchManager ====================

// 在函数开始处，检查 NSEM 启用后添加 ThreeTier 检查：

/*
export async function getMemorySearchManager(params: {
  cfg: NsemclawConfig;
  agentId: string;
  purpose?: "default" | "status";
}): Promise<MemorySearchManagerResult> {
  // ... 现有代码 ...

  // 检查是否启用 ThreeTier 记忆系统
  const threeTierEnabled = isThreeTierEnabled(cfg, params.agentId);
  
  if (threeTierEnabled) {
    try {
      const tripleHybrid = await createTripleHybridManager(params, cfg, statusOnly);
      if (tripleHybrid) {
        if (!statusOnly) {
          HYBRID_MANAGER_CACHE.set(cacheKey, tripleHybrid as any);
        }
        log.info(`三重NSEM混合记忆系统已启动 (agent: ${params.agentId})`);
        return { manager: tripleHybrid as any };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`三重NSEM混合记忆系统初始化失败: ${message}`);
      // 继续尝试其他系统
    }
  }

  // ... 现有 NSEM 和传统系统的代码 ...
}
*/

// ==================== 添加到 createHybridManager 后 ====================

/**
 * 创建三重混合管理器（QMD + NSEM + ThreeTier）
 */
/*
async function createTripleHybridManager(
  params: { cfg: NsemclawConfig; agentId: string },
  cfg: NsemclawConfig,
  statusOnly: boolean,
): Promise<TripleHybridSearchManager | null> {
  const { TripleHybridSearchManager } = await import("../cognitive-core/adapter/TripleHybridSearchManager.js");
  const { createThreeTierSearchManager } = await import("../cognitive-core/adapter/ThreeTierSearchManager.js");

  // 获取或创建 ThreeTier 管理器
  const cacheKey = `${params.agentId}:threetier`;
  let threeTier = THREETIER_MANAGER_CACHE.get(cacheKey);
  
  if (!threeTier && !statusOnly) {
    const threeTierConfig = getThreeTierConfig(cfg, params.agentId);
    threeTier = createThreeTierSearchManager({
      agentId: params.agentId,
      workingMemoryCapacity: threeTierConfig.workingMemoryCapacity,
      autoTierTransition: threeTierConfig.autoTierTransition,
    });
    THREETIER_MANAGER_CACHE.set(cacheKey, threeTier);
  }

  // 尝试获取 QMD 管理器
  const qmdManager = await getTraditionalManagerInternal(params, statusOnly);
  if (!qmdManager) {
    throw new Error("QMD manager not available for triple hybrid");
  }

  // 尝试获取 NSEM 管理器（可选）
  let nsemAdapter: MemorySearchManager | undefined;
  if (isNSEMEnabled(cfg, params.agentId)) {
    try {
      const { getNSEMFusionCore } = await import("../cognitive-core/NSEMFusionCore.js");
      const { NSEM2Adapter } = await import("../cognitive-core/integration/NSEM2Adapter.js");
      const { getNSEM2Config } = await import("../cognitive-core/config.js");
      const { resolveMemorySearchConfig } = await import("../agents/memory-search.js");

      const memoryConfig = resolveMemorySearchConfig(cfg, params.agentId);
      if (memoryConfig) {
        const nsemConfig = getNSEM2Config(cfg, params.agentId);
        const nsem = await getNSEMFusionCore(params.agentId, {
          rerankerModel: nsemConfig.rerankerModel,
          expansionModel: nsemConfig.expansionModel,
        });
        nsemAdapter = new NSEM2Adapter(nsem, { agentId: params.agentId, cfg });
      }
    } catch {
      // NSEM 可选，失败不影响整体
    }
  }

  return new TripleHybridSearchManager({
    qmd: qmdManager,
    nsem: nsemAdapter,
    threeTier,
    options: {
      qmdWeight: 0.8,
      nsemWeight: 1.0,
      threeTierWeight: 0.9,
      dedupThreshold: 0.85,
      maxResults: 10,
    },
  });
}
*/

// ==================== 添加配置函数 ====================

/**
 * 检查是否启用 ThreeTier 记忆系统
 */
/*
function isThreeTierEnabled(cfg: NsemclawConfig, agentId: string): boolean {
  // 从配置中检查
  const agentList = cfg.agents?.list as Array<{ id: string; threeTier?: { enabled?: boolean } }> | undefined;
  const agentConfig = agentList?.find((a) => a.id === agentId);
  
  // 优先使用 agent 级别配置
  if (agentConfig?.threeTier?.enabled !== undefined) {
    return agentConfig.threeTier.enabled;
  }
  
  // 使用默认配置
  return (cfg.agents?.defaults as any)?.threeTier?.enabled ?? false;
}
*/

/**
 * 获取 ThreeTier 配置
 */
/*
function getThreeTierConfig(cfg: NsemclawConfig, agentId: string) {
  const defaults = (cfg.agents?.defaults as any)?.threeTier ?? {};
  const agentList = cfg.agents?.list as Array<{ id: string; threeTier?: object }> | undefined;
  const agentConfig = agentList?.find((a) => a.id === agentId)?.threeTier ?? {};

  return {
    workingMemoryCapacity: (agentConfig as any)?.workingMemoryCapacity ?? defaults?.workingMemoryCapacity ?? 15,
    autoTierTransition: (agentConfig as any)?.autoTierTransition ?? defaults?.autoTierTransition ?? true,
  };
}
*/

// ==================== 配置示例 ====================

/**
 * nsemclaw.config.json 配置示例：
 * 
 * {
 *   "agents": {
 *     "defaults": {
 *       "threeTier": {
 *         "enabled": true,
 *         "workingMemoryCapacity": 15,
 *         "autoTierTransition": true
 *       }
 *     }
 *   }
 * }
 */

export {};
