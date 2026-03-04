import { injectNSEMDefaults, isNSEMEnabled } from "../cognitive-core/config.js";
import type { NsemclawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { ResolvedQmdConfig } from "./backend-config.js";
import { resolveMemoryBackendConfig } from "./backend-config.js";
import { HybridSearchManager } from "./hybrid-search-manager.js";
import {
  UnifiedCoreV2Adapter,
  createUnifiedCoreV2Adapter,
  type UnifiedCoreV2AdapterConfig,
  NSEMFusionCoreAdapter,
} from "./unified-core-v2-adapter.js";
import type {
  MemoryEmbeddingProbeResult,
  MemorySearchManager,
  MemorySyncProgressUpdate,
} from "./types.js";

const log = createSubsystemLogger("memory");
const QMD_MANAGER_CACHE = new Map<string, MemorySearchManager>();
const HYBRID_MANAGER_CACHE = new Map<string, HybridSearchManager>();
const UNIFIED_CORE_V2_CACHE = new Map<string, NSEMFusionCoreAdapter>();

export type MemorySearchManagerResult = {
  manager: MemorySearchManager | null;
  error?: string;
};

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

  // 尝试 Unified Core V2（如果启用）
  const unifiedCoreV2Config = getUnifiedCoreV2Config(cfg, params.agentId);
  if (unifiedCoreV2Config) {
    try {
      const unifiedAdapter = await createUnifiedCoreV2Manager(
        params,
        cfg,
        unifiedCoreV2Config,
        statusOnly,
        cacheKey
      );
      if (unifiedAdapter) {
        if (!statusOnly) {
          UNIFIED_CORE_V2_CACHE.set(cacheKey, unifiedAdapter);
        }
        log.info(`Unified Core V2 已启动 (agent: ${params.agentId}, mode: ${unifiedCoreV2Config.storageMode ?? "three-tier"})`);
        return { manager: unifiedAdapter };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Unified Core V2 初始化失败: ${message}`);
      // 继续尝试其他系统
    }
  }

  // 尝试创建混合管理器（NSEM + 传统系统）
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
      // 继续尝试传统系统
    }
  }

  // 回退到传统系统
  return getTraditionalManager(params, statusOnly, cacheKey);
}

/**
 * 创建混合记忆管理器（NSEM + 传统系统）
 */
async function createHybridManager(
  params: { cfg: NsemclawConfig; agentId: string },
  cfg: NsemclawConfig,
  statusOnly: boolean,
): Promise<HybridSearchManager | null> {
  const { getNSEMFusionCore } = await import("../cognitive-core/NSEMFusionCore.js");
  const { NSEM2Adapter } = await import("../cognitive-core/integration/NSEM2Adapter.js");
  const { resolveMemorySearchConfig } = await import("../agents/memory-search.js");
  const { getNSEM2Config } = await import("../cognitive-core/config.js");

  const memoryConfig = resolveMemorySearchConfig(cfg, params.agentId);
  if (!memoryConfig) {
    throw new Error("Memory search config not found");
  }

  const nsemConfig = getNSEM2Config(cfg, params.agentId);

  // 初始化 NSEM (getNSEMFusionCore 内部已调用 initialize，无需再调用 start)
  const nsem = await getNSEMFusionCore(params.agentId);

  const nsemAdapter = new NSEM2Adapter(nsem, { agentId: params.agentId, cfg });

  // 初始化传统系统
  const traditionalManager = await getTraditionalManagerInternal(params, statusOnly);
  if (!traditionalManager) {
    // 如果没有传统系统，只返回 NSEM
    return new HybridSearchManager({
      nsem: nsemAdapter,
      traditional: createNoOpManager(),
      options: { traditionalWeight: 0 },
    });
  }

  return new HybridSearchManager({
    nsem: nsemAdapter,
    traditional: traditionalManager,
    options: {
      nsemWeight: 1.0,
      traditionalWeight: 0.9,
      dedupThreshold: 0.85,
      maxResults: 10,
    },
  });
}

/**
 * 获取传统记忆管理器
 */
async function getTraditionalManager(
  params: { cfg: NsemclawConfig; agentId: string },
  statusOnly: boolean,
  cacheKey: string,
): Promise<MemorySearchManagerResult> {
  const resolved = resolveMemoryBackendConfig(params);
  
  if (resolved.backend === "qmd" && resolved.qmd) {
    if (!statusOnly) {
      const cached = QMD_MANAGER_CACHE.get(cacheKey);
      if (cached) {
        return { manager: cached };
      }
    }
    
    try {
      const { QmdMemoryManager } = await import("./qmd-manager.js");
      const primary = await QmdMemoryManager.create({
        cfg: params.cfg,
        agentId: params.agentId,
        resolved,
        mode: statusOnly ? "status" : "full",
      });
      
      if (primary) {
        if (statusOnly) {
          return { manager: primary };
        }
        
        const wrapper = new FallbackMemoryManager(
          {
            primary,
            fallbackFactory: async () => {
              const { MemoryIndexManager } = await import("./manager.js");
              return await MemoryIndexManager.get(params);
            },
          },
          () => QMD_MANAGER_CACHE.delete(cacheKey),
        );
        QMD_MANAGER_CACHE.set(cacheKey, wrapper);
        return { manager: wrapper };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`qmd memory unavailable; falling back to builtin: ${message}`);
    }
  }

  try {
    const { MemoryIndexManager } = await import("./manager.js");
    const manager = await MemoryIndexManager.get(params);
    return { manager };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { manager: null, error: message };
  }
}

/**
 * 内部获取传统管理器（用于混合管理器创建）
 */
async function getTraditionalManagerInternal(
  params: { cfg: NsemclawConfig; agentId: string },
  statusOnly: boolean,
): Promise<MemorySearchManager | null> {
  const resolved = resolveMemoryBackendConfig(params);
  
  if (resolved.backend === "qmd" && resolved.qmd) {
    try {
      const { QmdMemoryManager } = await import("./qmd-manager.js");
      const manager = await QmdMemoryManager.create({
        cfg: params.cfg,
        agentId: params.agentId,
        resolved,
        mode: statusOnly ? "status" : "full",
      });
      log.info(`[qmd] QmdMemoryManager 创建成功 (agent: ${params.agentId})`);
      return manager;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`[qmd] QmdMemoryManager 创建失败: ${message}，将回退到 builtin`);
      // 失败时继续尝试 builtin
    }
  }

  try {
    const { MemoryIndexManager } = await import("./manager.js");
    return await MemoryIndexManager.get(params);
  } catch {
    return null;
  }
}

/**
 * 创建空操作管理器（当某个系统不可用时使用）
 */
function createNoOpManager(): MemorySearchManager {
  return {
    search: async () => [],
    readFile: async ({ relPath }) => ({ text: "", path: relPath }),
    status: () => ({ provider: "none", backend: "builtin", custom: { ready: false } }),
    probeEmbeddingAvailability: async () => ({ ok: false }),
    probeVectorAvailability: async () => false,
  };
}

class FallbackMemoryManager implements MemorySearchManager {
  private fallback: MemorySearchManager | null = null;
  private primaryFailed = false;
  private lastError?: string;
  private cacheEvicted = false;

  constructor(
    private readonly deps: {
      primary: MemorySearchManager;
      fallbackFactory: () => Promise<MemorySearchManager | null>;
    },
    private readonly onClose?: () => void,
  ) {}

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ) {
    if (!this.primaryFailed) {
      try {
        return await this.deps.primary.search(query, opts);
      } catch (err) {
        this.primaryFailed = true;
        this.lastError = err instanceof Error ? err.message : String(err);
        log.warn(`qmd memory failed; switching to builtin index: ${this.lastError}`);
        await this.deps.primary.close?.().catch(() => {});
        this.evictCacheEntry();
      }
    }
    const fallback = await this.ensureFallback();
    if (fallback) {
      return await fallback.search(query, opts);
    }
    throw new Error(this.lastError ?? "memory search unavailable");
  }

  async readFile(params: { relPath: string; from?: number; lines?: number }) {
    try {
      if (!this.primaryFailed) {
        return await this.deps.primary.readFile(params);
      }
      const fallback = await this.ensureFallback();
      if (fallback) {
        return await fallback.readFile(params);
      }
    } catch (err) {
      // 文件不存在时返回空内容，而不是抛出错误
      const errCode = (err as NodeJS.ErrnoException)?.code;
      if (errCode === "ENOENT") {
        return { text: "", path: params.relPath };
      }
      log.warn(`readFile failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    // 所有尝试都失败，返回空内容
    return { text: "", path: params.relPath };
  }

  status() {
    if (!this.primaryFailed) {
      return this.deps.primary.status();
    }
    const fallbackStatus = this.fallback?.status();
    const fallbackInfo = { from: "qmd", reason: this.lastError ?? "unknown" };
    if (fallbackStatus) {
      const custom = fallbackStatus.custom ?? {};
      return {
        ...fallbackStatus,
        fallback: fallbackInfo,
        custom: {
          ...custom,
          fallback: { disabled: true, reason: this.lastError ?? "unknown" },
        },
      };
    }
    const primaryStatus = this.deps.primary.status();
    const custom = primaryStatus.custom ?? {};
    return {
      ...primaryStatus,
      fallback: fallbackInfo,
      custom: {
        ...custom,
        fallback: { disabled: true, reason: this.lastError ?? "unknown" },
      },
    };
  }

  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }) {
    if (!this.primaryFailed) {
      await this.deps.primary.sync?.(params);
      return;
    }
    const fallback = await this.ensureFallback();
    await fallback?.sync?.(params);
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    if (!this.primaryFailed) {
      return await this.deps.primary.probeEmbeddingAvailability();
    }
    const fallback = await this.ensureFallback();
    if (fallback) {
      return await fallback.probeEmbeddingAvailability();
    }
    return { ok: false, error: this.lastError ?? "memory embeddings unavailable" };
  }

  async probeVectorAvailability() {
    if (!this.primaryFailed) {
      return await this.deps.primary.probeVectorAvailability();
    }
    const fallback = await this.ensureFallback();
    return (await fallback?.probeVectorAvailability()) ?? false;
  }

  async close() {
    await this.deps.primary.close?.();
    await this.fallback?.close?.();
    this.evictCacheEntry();
  }

  private async ensureFallback(): Promise<MemorySearchManager | null> {
    if (this.fallback) {
      return this.fallback;
    }
    let fallback: MemorySearchManager | null;
    try {
      fallback = await this.deps.fallbackFactory();
      if (!fallback) {
        log.warn("memory fallback requested but builtin index is unavailable");
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`memory fallback unavailable: ${message}`);
      return null;
    }
    this.fallback = fallback;
    return this.fallback;
  }

  private evictCacheEntry(): void {
    if (this.cacheEvicted) {
      return;
    }
    this.cacheEvicted = true;
    this.onClose?.();
  }
}

function buildCacheKey(agentId: string, cfg: NsemclawConfig): string {
  const resolved = resolveMemoryBackendConfig({ cfg, agentId });
  if (resolved.backend === "qmd" && resolved.qmd) {
    return `${agentId}:qmd:${stableSerialize(resolved.qmd)}`;
  }
  return `${agentId}:builtin`;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }
  if (value && typeof value === "object") {
    const sortedEntries = Object.keys(value as Record<string, unknown>)
      .toSorted((a, b) => a.localeCompare(b))
      .map((key) => [key, sortValue((value as Record<string, unknown>)[key])]);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

// ============================================================================
// Unified Core V2 支持
// ============================================================================

/**
 * 获取 Unified Core V2 配置
 */
function getUnifiedCoreV2Config(
  cfg: NsemclawConfig,
  agentId: string,
): UnifiedCoreV2AdapterConfig | null {
  const agentList = cfg.agents?.list as Array<{
    id: string;
    unifiedCoreV2?: { enabled?: boolean; mode?: "nsem2-compat" | "three-tier" | "hybrid-all" };
  }> | undefined;
  
  const agentConfig = agentList?.find((a) => a.id === agentId);
  
  // 优先使用 agent 级别配置
  if (agentConfig?.unifiedCoreV2?.enabled === true) {
    return {
      storageMode: agentConfig.unifiedCoreV2.mode ?? "three-tier",
      enableExtraction: true,
      enableSessionManager: true,
    };
  }
  
  // 使用默认配置
  const defaults = (cfg.agents?.defaults as any)?.unifiedCoreV2;
  if (defaults?.enabled === true) {
    return {
      storageMode: defaults.mode ?? "three-tier",
      enableExtraction: true,
      enableSessionManager: true,
    };
  }
  
  return null;
}

/**
 * 创建 Unified Core V2 管理器
 */
async function createUnifiedCoreV2Manager(
  params: { cfg: NsemclawConfig; agentId: string },
  cfg: NsemclawConfig,
  config: UnifiedCoreV2AdapterConfig,
  statusOnly: boolean,
  cacheKey: string,
): Promise<NSEMFusionCoreAdapter | null> {
  // 检查缓存
  if (!statusOnly) {
    const cached = UNIFIED_CORE_V2_CACHE.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const adapter = createUnifiedCoreV2Adapter(params.agentId, config);
  await adapter.initialize();

  return adapter;
}
