import {
  resolveChannelGroupRequireMention,
  resolveChannelGroupToolsPolicy,
} from "../config/group-policy.js";
import { requireActivePluginRegistry } from "../plugins/runtime.js";
import { normalizeAccountId } from "../routing/session-key.js";
import { resolveTelegramAccount } from "../telegram/accounts.js";
import {
  resolveTelegramGroupRequireMention,
  resolveTelegramGroupToolPolicy,
} from "./plugins/group-mentions.js";
import type {
  ChannelCapabilities,
  ChannelCommandAdapter,
  ChannelConfigAdapter,
  ChannelElevatedAdapter,
  ChannelGroupAdapter,
  ChannelId,
  ChannelAgentPromptAdapter,
  ChannelMentionAdapter,
  ChannelPlugin,
  ChannelThreadingAdapter,
} from "./plugins/types.js";
import { CHAT_CHANNEL_ORDER, type ChatChannelId, getChatChannelMeta } from "./registry.js";

export type ChannelDock = {
  id: ChannelId;
  capabilities: ChannelCapabilities;
  commands?: ChannelCommandAdapter;
  outbound?: {
    textChunkLimit?: number;
  };
  streaming?: ChannelDockStreaming;
  elevated?: ChannelElevatedAdapter;
  config?: Pick<
    ChannelConfigAdapter<unknown>,
    "resolveAllowFrom" | "formatAllowFrom" | "resolveDefaultTo"
  >;
  groups?: ChannelGroupAdapter;
  mentions?: ChannelMentionAdapter;
  threading?: ChannelThreadingAdapter;
  agentPrompt?: ChannelAgentPromptAdapter;
};

type ChannelDockStreaming = {
  blockStreamingCoalesceDefaults?: {
    minChars?: number;
    idleMs?: number;
  };
};

const formatLower = (allowFrom: Array<string | number>) =>
  allowFrom
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .map((entry) => entry.toLowerCase());

const stringifyAllowFrom = (allowFrom: Array<string | number>) =>
  allowFrom.map((entry) => String(entry));

const trimAllowFromEntries = (allowFrom: Array<string | number>) =>
  allowFrom.map((entry) => String(entry).trim()).filter(Boolean);

const DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT_4000 = { textChunkLimit: 4000 };

const DEFAULT_BLOCK_STREAMING_COALESCE = {
  blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
};

function formatAllowFromWithReplacements(
  allowFrom: Array<string | number>,
  replacements: RegExp[],
): string[] {
  return trimAllowFromEntries(allowFrom).map((entry) => {
    let normalized = entry;
    for (const replacement of replacements) {
      normalized = normalized.replace(replacement, "");
    }
    return normalized.toLowerCase();
  });
}

function resolveCaseInsensitiveAccount<T>(
  accounts: Record<string, T> | undefined,
  accountId?: string | null,
): T | undefined {
  if (!accounts) {
    return undefined;
  }
  const normalized = normalizeAccountId(accountId);
  return (
    accounts[normalized] ??
    accounts[
      Object.keys(accounts).find((key) => key.toLowerCase() === normalized.toLowerCase()) ?? ""
    ]
  );
}

function resolveDefaultToCaseInsensitiveAccount(params: {
  channel?:
    | {
        accounts?: Record<string, { defaultTo?: string }>;
        defaultTo?: string;
      }
    | undefined;
  accountId?: string | null;
}): string | undefined {
  const account = resolveCaseInsensitiveAccount(params.channel?.accounts, params.accountId);
  return (account?.defaultTo ?? params.channel?.defaultTo)?.trim() || undefined;
}

function resolveChannelDefaultTo(
  channel:
    | {
        accounts?: Record<string, { defaultTo?: string }>;
        defaultTo?: string;
      }
    | undefined,
  accountId?: string | null,
): string | undefined {
  return resolveDefaultToCaseInsensitiveAccount({ channel, accountId });
}

// Channel docks: lightweight channel metadata/behavior for shared code paths.
//
// Rules:
// - keep this module *light* (no monitors, probes, puppeteer/web login, etc)
// - OK: config readers, allowFrom formatting, mention stripping patterns, threading defaults
// - shared code should import from here (and from `src/channels/registry.ts`), not from the plugins registry
//
// Adding a channel:
// - add a new entry to `DOCKS`
// - keep it cheap; push heavy logic into `src/channels/plugins/<id>.ts` or channel modules
const DOCKS: Record<ChatChannelId, ChannelDock> = {
  telegram: {
    id: "telegram",
    capabilities: {
      chatTypes: ["direct", "group", "channel", "thread"],
      nativeCommands: true,
      blockStreaming: true,
    },
    outbound: DEFAULT_OUTBOUND_TEXT_CHUNK_LIMIT_4000,
    config: {
      resolveAllowFrom: ({ cfg, accountId }) =>
        stringifyAllowFrom(resolveTelegramAccount({ cfg, accountId }).config.allowFrom ?? []),
      formatAllowFrom: ({ allowFrom }) =>
        trimAllowFromEntries(allowFrom)
          .map((entry) => entry.replace(/^(telegram|tg):/i, ""))
          .map((entry) => entry.toLowerCase()),
      resolveDefaultTo: ({ cfg, accountId }) => {
        const val = resolveTelegramAccount({ cfg, accountId }).config.defaultTo;
        return val != null ? String(val) : undefined;
      },
    },
    groups: {
      resolveRequireMention: resolveTelegramGroupRequireMention,
      resolveToolPolicy: resolveTelegramGroupToolPolicy,
    },
    threading: {
      resolveReplyToMode: ({ cfg }) => cfg.channels?.telegram?.replyToMode ?? "off",
      buildToolContext: ({ context, hasRepliedRef }) => {
        // Telegram auto-threading should only use actual thread/topic IDs.
        // ReplyToId is a message ID and causes invalid message_thread_id in DMs.
        const threadId = context.MessageThreadId;
        const rawCurrentMessageId = context.CurrentMessageId;
        const currentMessageId =
          typeof rawCurrentMessageId === "number"
            ? rawCurrentMessageId
            : rawCurrentMessageId?.trim() || undefined;
        return {
          currentChannelId: context.To?.trim() || undefined,
          currentThreadTs: threadId != null ? String(threadId) : undefined,
          currentMessageId,
          hasRepliedRef,
        };
      },
    },
  },
};

function buildDockFromPlugin(plugin: ChannelPlugin): ChannelDock {
  return {
    id: plugin.id,
    capabilities: plugin.capabilities,
    commands: plugin.commands,
    outbound: plugin.outbound?.textChunkLimit
      ? { textChunkLimit: plugin.outbound.textChunkLimit }
      : undefined,
    streaming: plugin.streaming
      ? { blockStreamingCoalesceDefaults: plugin.streaming.blockStreamingCoalesceDefaults }
      : undefined,
    elevated: plugin.elevated,
    config: plugin.config
      ? {
          resolveAllowFrom: plugin.config.resolveAllowFrom,
          formatAllowFrom: plugin.config.formatAllowFrom,
          resolveDefaultTo: plugin.config.resolveDefaultTo,
        }
      : undefined,
    groups: plugin.groups,
    mentions: plugin.mentions,
    threading: plugin.threading,
    agentPrompt: plugin.agentPrompt,
  };
}

function listPluginDockEntries(): Array<{ id: ChannelId; dock: ChannelDock; order?: number }> {
  const registry = requireActivePluginRegistry();
  const entries: Array<{ id: ChannelId; dock: ChannelDock; order?: number }> = [];
  const seen = new Set<string>();
  for (const entry of registry.channels) {
    const plugin = entry.plugin;
    const id = String(plugin.id).trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (CHAT_CHANNEL_ORDER.includes(plugin.id as ChatChannelId)) {
      continue;
    }
    const dock = entry.dock ?? buildDockFromPlugin(plugin);
    entries.push({ id: plugin.id, dock, order: plugin.meta.order });
  }
  return entries;
}

export function listChannelDocks(): ChannelDock[] {
  const baseEntries = CHAT_CHANNEL_ORDER.map((id) => ({
    id,
    dock: DOCKS[id],
    order: getChatChannelMeta(id).order,
  }));
  const pluginEntries = listPluginDockEntries();
  const combined = [...baseEntries, ...pluginEntries];
  combined.sort((a, b) => {
    const indexA = CHAT_CHANNEL_ORDER.indexOf(a.id as ChatChannelId);
    const indexB = CHAT_CHANNEL_ORDER.indexOf(b.id as ChatChannelId);
    const orderA = a.order ?? (indexA === -1 ? 999 : indexA);
    const orderB = b.order ?? (indexB === -1 ? 999 : indexB);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return String(a.id).localeCompare(String(b.id));
  });
  return combined.map((entry) => entry.dock);
}

export function getChannelDock(id: ChannelId): ChannelDock | undefined {
  const core = DOCKS[id as ChatChannelId];
  if (core) {
    return core;
  }
  const registry = requireActivePluginRegistry();
  const pluginEntry = registry.channels.find((entry) => entry.plugin.id === id);
  if (!pluginEntry) {
    return undefined;
  }
  return pluginEntry.dock ?? buildDockFromPlugin(pluginEntry.plugin);
}
