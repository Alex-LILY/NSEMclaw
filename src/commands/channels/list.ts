import { loadAuthProfileStore } from "../../agents/auth-profiles.js";
import { listChannelPlugins } from "../../channels/plugins/index.js";
import { buildChannelAccountSnapshot } from "../../channels/plugins/status.js";
import type { ChannelAccountSnapshot, ChannelPlugin } from "../../channels/plugins/types.js";
import { withProgress } from "../../cli/progress.js";
import { formatUsageReportLines, loadProviderUsageSummary } from "../../infra/provider-usage.js";
import { defaultRuntime, type RuntimeEnv } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { formatChannelAccountLabel, requireValidConfig } from "./shared.js";

export type ChannelsListOptions = {
  json?: boolean;
  usage?: boolean;
};

const colorValue = (value: string) => {
  if (value === "none" || value === "无") {
    return theme.error("无");
  }
  if (value === "env") {
    return theme.accent("环境变量");
  }
  return theme.success("已配置");
};

function formatEnabled(value: boolean | undefined): string {
  return value === false ? theme.error("已禁用") : theme.success("已启用");
}

function formatConfigured(value: boolean): string {
  return value ? theme.success("已配置") : theme.warn("未配置");
}

function formatTokenSource(source?: string): string {
  const value = source || "无";
  return `令牌=${colorValue(value)}`;
}

function formatSource(label: string, source?: string): string {
  const value = source || "无";
  const labelMap: Record<string, string> = { bot: "机器人", app: "应用" };
  return `${labelMap[label] || label}=${colorValue(value)}`;
}

function formatLinked(value: boolean): string {
  return value ? theme.success("已链接") : theme.warn("未链接");
}

function shouldShowConfigured(channel: ChannelPlugin): boolean {
  return channel.meta.showConfigured !== false;
}

function formatAccountLine(params: {
  channel: ChannelPlugin;
  snapshot: ChannelAccountSnapshot;
}): string {
  const { channel, snapshot } = params;
  const label = formatChannelAccountLabel({
    channel: channel.id,
    accountId: snapshot.accountId,
    name: snapshot.name,
    channelStyle: theme.accent,
    accountStyle: theme.heading,
  });
  const bits: string[] = [];
  if (snapshot.linked !== undefined) {
    bits.push(formatLinked(snapshot.linked));
  }
  if (shouldShowConfigured(channel) && typeof snapshot.configured === "boolean") {
    bits.push(formatConfigured(snapshot.configured));
  }
  if (snapshot.tokenSource) {
    bits.push(formatTokenSource(snapshot.tokenSource));
  }
  if (snapshot.botTokenSource) {
    bits.push(formatSource("bot", snapshot.botTokenSource));
  }
  if (snapshot.appTokenSource) {
    bits.push(formatSource("app", snapshot.appTokenSource));
  }
  if (snapshot.baseUrl) {
    bits.push(`base=${theme.muted(snapshot.baseUrl)}`);
  }
  if (typeof snapshot.enabled === "boolean") {
    bits.push(formatEnabled(snapshot.enabled));
  }
  return `- ${label}: ${bits.join(", ")}`;
}
async function loadUsageWithProgress(
  runtime: RuntimeEnv,
): Promise<Awaited<ReturnType<typeof loadProviderUsageSummary>> | null> {
  try {
    return await withProgress(
      { label: "获取使用快照…", indeterminate: true, enabled: true },
      async () => await loadProviderUsageSummary(),
    );
  } catch (err) {
    runtime.error(String(err));
    return null;
  }
}

export async function channelsListCommand(
  opts: ChannelsListOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }
  const includeUsage = opts.usage !== false;

  const plugins = listChannelPlugins();

  const authStore = loadAuthProfileStore();
  const authProfiles = Object.entries(authStore.profiles).map(([profileId, profile]) => ({
    id: profileId,
    provider: profile.provider,
    type: profile.type,
    isExternal: false,
  }));
  if (opts.json) {
    const usage = includeUsage ? await loadProviderUsageSummary() : undefined;
    const chat: Record<string, string[]> = {};
    for (const plugin of plugins) {
      chat[plugin.id] = plugin.config.listAccountIds(cfg);
    }
    const payload = { chat, auth: authProfiles, ...(usage ? { usage } : {}) };
    runtime.log(JSON.stringify(payload, null, 2));
    return;
  }

  const lines: string[] = [];
  lines.push(theme.heading("聊天频道:"));

  for (const plugin of plugins) {
    const accounts = plugin.config.listAccountIds(cfg);
    if (!accounts || accounts.length === 0) {
      continue;
    }
    for (const accountId of accounts) {
      const snapshot = await buildChannelAccountSnapshot({
        plugin,
        cfg,
        accountId,
      });
      lines.push(
        formatAccountLine({
          channel: plugin,
          snapshot,
        }),
      );
    }
  }

  lines.push("");
  lines.push(theme.heading("认证提供商 (OAuth + API 密钥):"));
  if (authProfiles.length === 0) {
    lines.push(theme.muted("- 无"));
  } else {
    for (const profile of authProfiles) {
      const external = profile.isExternal ? theme.muted(" (已同步)") : "";
      lines.push(
        `- ${theme.accent(profile.id)} (${theme.success(profile.type === "api_key" ? "API密钥" : profile.type)}${external})`,
      );
    }
  }

  runtime.log(lines.join("\n"));

  if (includeUsage) {
    runtime.log("");
    const usage = await loadUsageWithProgress(runtime);
    if (usage) {
      const usageLines = formatUsageReportLines(usage);
      if (usageLines.length > 0) {
        usageLines[0] = theme.accent(usageLines[0]);
        runtime.log(usageLines.join("\n"));
      }
    }
  }

  runtime.log("");
  runtime.log(`文档: ${formatDocsLink("/gateway/configuration", "gateway/configuration")}`);
}
