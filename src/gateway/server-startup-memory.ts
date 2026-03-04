import { listAgentIds } from "../agents/agent-scope.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";
import type { NsemclawConfig } from "../config/config.js";
import { resolveMemoryBackendConfig } from "../memory/backend-config.js";
import { getMemorySearchManager } from "../memory/index.js";

export async function startGatewayMemoryBackend(params: {
  cfg: NsemclawConfig;
  log: { info?: (msg: string) => void; warn: (msg: string) => void };
}): Promise<void> {
  const agentIds = listAgentIds(params.cfg);
  params.log.info?.(`[memory-backend] 发现 ${agentIds.length} 个 agent: ${agentIds.join(", ")}`);
  
  for (const agentId of agentIds) {
    const memoryConfig = resolveMemorySearchConfig(params.cfg, agentId);
    if (!memoryConfig) {
      params.log.info?.(`[memory-backend] agent "${agentId}": memorySearch 未启用，跳过`);
      continue;
    }
    const resolved = resolveMemoryBackendConfig({ cfg: params.cfg, agentId });
    params.log.info?.(`[memory-backend] agent "${agentId}": backend=${resolved.backend}`);
    if (resolved.backend !== "qmd" || !resolved.qmd) {
      params.log.info?.(`[memory-backend] agent "${agentId}": 不是 qmd 后端，跳过`);
      continue;
    }

    const { manager, error } = await getMemorySearchManager({ cfg: params.cfg, agentId });
    if (!manager) {
      params.log.warn(
        `qmd memory startup initialization failed for agent "${agentId}": ${error ?? "unknown error"}`,
      );
      continue;
    }
    params.log.info?.(`qmd memory startup initialization armed for agent "${agentId}"`);
  }
}
