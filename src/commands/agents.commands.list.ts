import { formatCliCommand } from "../cli/command-format.js";
import type { AgentBinding } from "../config/types.js";
import { normalizeAgentId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
import { describeBinding } from "./agents.bindings.js";
import { requireValidConfig } from "./agents.command-shared.js";
import type { AgentSummary } from "./agents.config.js";
import { buildAgentSummaries } from "./agents.config.js";
import {
  buildProviderStatusIndex,
  listProvidersForAgent,
  summarizeBindings,
} from "./agents.providers.js";

type AgentsListOptions = {
  json?: boolean;
  bindings?: boolean;
};

function formatSummary(summary: AgentSummary) {
  const defaultTag = summary.isDefault ? " (默认)" : "";
  const header =
    summary.name && summary.name !== summary.id
      ? `${summary.id}${defaultTag} (${summary.name})`
      : `${summary.id}${defaultTag}`;

  const identityParts = [];
  if (summary.identityEmoji) {
    identityParts.push(summary.identityEmoji);
  }
  if (summary.identityName) {
    identityParts.push(summary.identityName);
  }
  const identityLine = identityParts.length > 0 ? identityParts.join(" ") : null;
  const identitySource =
    summary.identitySource === "identity"
      ? "IDENTITY.md"
      : summary.identitySource === "配置"
        ? "配置"
        : null;

  const lines = [`- ${header}`];
  if (identityLine) {
    lines.push(`  身份: ${identityLine}${identitySource ? ` (${identitySource})` : ""}`);
  }
  lines.push(`  工作区: ${shortenHomePath(summary.workspace)}`);
  lines.push(`  智能体目录: ${shortenHomePath(summary.agentDir)}`);
  if (summary.model) {
    lines.push(`  模型: ${summary.model}`);
  }
  lines.push(`  路由规则: ${summary.bindings}`);

  if (summary.routes?.length) {
    lines.push(`  路由: ${summary.routes.join(", ")}`);
  }
  if (summary.providers?.length) {
    lines.push("  提供商:");
    for (const provider of summary.providers) {
      lines.push(`    - ${provider}`);
    }
  }

  if (summary.bindingDetails?.length) {
    lines.push("  路由规则:");
    for (const binding of summary.bindingDetails) {
      lines.push(`    - ${binding}`);
    }
  }
  return lines.join("\n");
}

export async function agentsListCommand(
  opts: AgentsListOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const summaries = buildAgentSummaries(cfg);
  const bindingMap = new Map<string, AgentBinding[]>();
  for (const binding of cfg.bindings ?? []) {
    const agentId = normalizeAgentId(binding.agentId);
    const list = bindingMap.get(agentId) ?? [];
    list.push(binding);
    bindingMap.set(agentId, list);
  }

  if (opts.bindings) {
    for (const summary of summaries) {
      const bindings = bindingMap.get(summary.id) ?? [];
      if (bindings.length > 0) {
        summary.bindingDetails = bindings.map((binding) => describeBinding(binding));
      }
    }
  }

  const providerStatus = await buildProviderStatusIndex(cfg);

  for (const summary of summaries) {
    const bindings = bindingMap.get(summary.id) ?? [];
    const routes = summarizeBindings(cfg, bindings);
    if (routes.length > 0) {
      summary.routes = routes;
    } else if (summary.isDefault) {
      summary.routes = ["默认（无显式规则）"];
    }

    const providerLines = listProvidersForAgent({
      summaryIsDefault: summary.isDefault,
      cfg,
      bindings,
      providerStatus,
    });
    if (providerLines.length > 0) {
      summary.providers = providerLines;
    }
  }

  if (opts.json) {
    runtime.log(JSON.stringify(summaries, null, 2));
    return;
  }

  const lines = ["智能体列表:", ...summaries.map(formatSummary)];
  lines.push("路由规则将频道/账户/同伴映射到智能体。使用 --bindings 查看完整规则。");
  lines.push(
    `频道状态反映本地配置/凭证。实时健康检查: ${formatCliCommand("nsemclaw channels status --probe")}.`,
  );
  runtime.log(lines.join("\n"));
}
