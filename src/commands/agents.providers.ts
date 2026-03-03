import { resolveChannelDefaultAccountId } from "../channels/plugins/helpers.js";
import {
  getChannelPlugin,
  listChannelPlugins,
  normalizeChannelId,
} from "../channels/plugins/index.js";
import type { ChannelId } from "../channels/plugins/types.js";
import type { NsemclawConfig } from "../config/config.js";
import type { AgentBinding } from "../config/types.js";
import { DEFAULT_ACCOUNT_ID } from "../routing/session-key.js";

type ProviderAccountState = "已链接" | "未链接" | "已配置" | "未配置" | "已启用" | "已禁用";

type ProviderAccountStatus = {
  provider: ChannelId;
  accountId: string;
  name?: string;
  state: ProviderAccountState;
  enabled?: boolean;
  configured?: boolean;
};

/** 将英文状态转换为中文状态 */
function toChineseState(state: string): ProviderAccountState {
  const stateMap: Record<string, ProviderAccountState> = {
    linked: "已链接",
    "not linked": "未链接",
    configured: "已配置",
    "not configured": "未配置",
    enabled: "已启用",
    disabled: "已禁用",
  };
  return stateMap[state] ?? (state as ProviderAccountState);
}

function providerAccountKey(provider: ChannelId, accountId?: string) {
  return `${provider}:${accountId ?? DEFAULT_ACCOUNT_ID}`;
}

function formatChannelAccountLabel(params: {
  provider: ChannelId;
  accountId: string;
  name?: string;
}): string {
  const label = getChannelPlugin(params.provider)?.meta.label ?? params.provider;
  const account = params.name?.trim()
    ? `${params.accountId} (${params.name.trim()})`
    : params.accountId;
  return `${label} ${account}`;
}

function formatProviderState(entry: ProviderAccountStatus): string {
  const parts = [entry.state];
  if (entry.enabled === false && entry.state !== "已禁用") {
    parts.push("已禁用");
  }
  return parts.join(", ");
}

export async function buildProviderStatusIndex(
  cfg: NsemclawConfig,
): Promise<Map<string, ProviderAccountStatus>> {
  const map = new Map<string, ProviderAccountStatus>();

  for (const plugin of listChannelPlugins()) {
    const accountIds = plugin.config.listAccountIds(cfg);
    for (const accountId of accountIds) {
      const account = plugin.config.resolveAccount(cfg, accountId);
      const snapshot = plugin.config.describeAccount?.(account, cfg);
      const enabled = plugin.config.isEnabled
        ? plugin.config.isEnabled(account, cfg)
        : typeof snapshot?.enabled === "boolean"
          ? snapshot.enabled
          : (account as { enabled?: boolean }).enabled;
      const configured = plugin.config.isConfigured
        ? await plugin.config.isConfigured(account, cfg)
        : snapshot?.configured;
      const resolvedEnabled = typeof enabled === "boolean" ? enabled : true;
      const resolvedConfigured = typeof configured === "boolean" ? configured : true;
      const rawState =
        plugin.status?.resolveAccountState?.({
          account,
          cfg,
          configured: resolvedConfigured,
          enabled: resolvedEnabled,
        }) ??
        (typeof snapshot?.linked === "boolean"
          ? snapshot.linked
            ? "linked"
            : "not linked"
          : resolvedConfigured
            ? "configured"
            : "not configured");
      const state = toChineseState(rawState);
      const name = snapshot?.name ?? (account as { name?: string }).name;
      map.set(providerAccountKey(plugin.id, accountId), {
        provider: plugin.id,
        accountId,
        name,
        state,
        enabled,
        configured,
      });
    }
  }

  return map;
}

function resolveDefaultAccountId(cfg: NsemclawConfig, provider: ChannelId): string {
  const plugin = getChannelPlugin(provider);
  if (!plugin) {
    return DEFAULT_ACCOUNT_ID;
  }
  return resolveChannelDefaultAccountId({ plugin, cfg });
}

function shouldShowProviderEntry(entry: ProviderAccountStatus, cfg: NsemclawConfig): boolean {
  const plugin = getChannelPlugin(entry.provider);
  if (!plugin) {
    return Boolean(entry.configured);
  }
  if (plugin.meta.showConfigured === false) {
    const providerConfig = (cfg as Record<string, unknown>)[plugin.id];
    return Boolean(entry.configured) || Boolean(providerConfig);
  }
  return Boolean(entry.configured);
}

function formatProviderEntry(entry: ProviderAccountStatus): string {
  const label = formatChannelAccountLabel({
    provider: entry.provider,
    accountId: entry.accountId,
    name: entry.name,
  });
  return `${label}: ${formatProviderState(entry)}`;
}

export function summarizeBindings(cfg: NsemclawConfig, bindings: AgentBinding[]): string[] {
  if (bindings.length === 0) {
    return [];
  }
  const seen = new Map<string, string>();
  for (const binding of bindings) {
    const channel = normalizeChannelId(binding.match.channel);
    if (!channel) {
      continue;
    }
    const accountId = binding.match.accountId ?? resolveDefaultAccountId(cfg, channel);
    const key = providerAccountKey(channel, accountId);
    if (!seen.has(key)) {
      const label = formatChannelAccountLabel({
        provider: channel,
        accountId,
      });
      seen.set(key, label);
    }
  }
  return [...seen.values()];
}

export function listProvidersForAgent(params: {
  summaryIsDefault: boolean;
  cfg: NsemclawConfig;
  bindings: AgentBinding[];
  providerStatus: Map<string, ProviderAccountStatus>;
}): string[] {
  const allProviderEntries = [...params.providerStatus.values()];
  const providerLines: string[] = [];
  if (params.bindings.length > 0) {
    const seen = new Set<string>();
    for (const binding of params.bindings) {
      const channel = normalizeChannelId(binding.match.channel);
      if (!channel) {
        continue;
      }
      const accountId = binding.match.accountId ?? resolveDefaultAccountId(params.cfg, channel);
      const key = providerAccountKey(channel, accountId);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const status = params.providerStatus.get(key);
      if (status) {
        providerLines.push(formatProviderEntry(status));
      } else {
        providerLines.push(
          `${formatChannelAccountLabel({ provider: channel, accountId })}: unknown`,
        );
      }
    }
    return providerLines;
  }

  if (params.summaryIsDefault) {
    for (const entry of allProviderEntries) {
      if (shouldShowProviderEntry(entry, params.cfg)) {
        providerLines.push(formatProviderEntry(entry));
      }
    }
  }

  return providerLines;
}
