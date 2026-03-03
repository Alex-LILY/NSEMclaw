import { z } from "zod";
import {
  resolveTelegramPreviewStreamMode,
  resolveDiscordPreviewStreamMode,
  resolveSlackNativeStreaming,
  resolveSlackStreamingMode,
} from "./discord-preview-streaming.js";
import {
  normalizeTelegramCommandDescription,
  normalizeTelegramCommandName,
  resolveTelegramCustomCommands,
} from "./telegram-custom-commands.js";
import { ToolPolicySchema } from "./zod-schema.agent-runtime.js";
import { ChannelHeartbeatVisibilitySchema } from "./zod-schema.channels.js";
import {
  BlockStreamingChunkSchema,
  BlockStreamingCoalesceSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  HexColorSchema,
  MarkdownConfigSchema,
  MSTeamsReplyStyleSchema,
  ProviderCommandsSchema,
  SecretRefSchema,
  ReplyToModeSchema,
  RetryConfigSchema,
  TtsConfigSchema,
  requireAllowlistAllowFrom,
  requireOpenAllowFrom,
} from "./zod-schema.core.js";
import { sensitive } from "./zod-schema.sensitive.js";

const ToolPolicyBySenderSchema = z.record(z.string(), ToolPolicySchema).optional();

const TelegramInlineButtonsScopeSchema = z.enum(["off", "dm", "group", "all", "allowlist"]);

const TelegramCapabilitiesSchema = z.union([
  z.array(z.string()),
  z
    .object({
      inlineButtons: TelegramInlineButtonsScopeSchema.optional(),
    })
    .strict(),
]);

export const TelegramTopicSchema = z
  .object({
    requireMention: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional(),
    skills: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    systemPrompt: z.string().optional(),
  })
  .strict();

export const TelegramGroupSchema = z
  .object({
    requireMention: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional(),
    tools: ToolPolicySchema,
    toolsBySender: ToolPolicyBySenderSchema,
    skills: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    systemPrompt: z.string().optional(),
    topics: z.record(z.string(), TelegramTopicSchema.optional()).optional(),
  })
  .strict();

const TelegramCustomCommandSchema = z
  .object({
    command: z.string().transform(normalizeTelegramCommandName),
    description: z.string().transform(normalizeTelegramCommandDescription),
  })
  .strict();

const validateTelegramCustomCommands = (
  value: { customCommands?: Array<{ command?: string; description?: string }> },
  ctx: z.RefinementCtx,
) => {
  if (!value.customCommands || value.customCommands.length === 0) {
    return;
  }
  const { issues } = resolveTelegramCustomCommands({
    commands: value.customCommands,
    checkReserved: false,
    checkDuplicates: false,
  });
  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customCommands", issue.index, issue.field],
      message: issue.message,
    });
  }
};

function normalizeTelegramStreamingConfig(value: { streaming?: unknown; streamMode?: unknown }) {
  value.streaming = resolveTelegramPreviewStreamMode(value);
  delete value.streamMode;
}

function normalizeDiscordStreamingConfig(value: { streaming?: unknown; streamMode?: unknown }) {
  value.streaming = resolveDiscordPreviewStreamMode(value);
  delete value.streamMode;
}

function normalizeSlackStreamingConfig(value: {
  streaming?: unknown;
  nativeStreaming?: unknown;
  streamMode?: unknown;
}) {
  value.nativeStreaming = resolveSlackNativeStreaming(value);
  value.streaming = resolveSlackStreamingMode(value);
  delete value.streamMode;
}

export const TelegramAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    capabilities: TelegramCapabilitiesSchema.optional(),
    markdown: MarkdownConfigSchema,
    enabled: z.boolean().optional(),
    commands: ProviderCommandsSchema,
    customCommands: z.array(TelegramCustomCommandSchema).optional(),
    configWrites: z.boolean().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    botToken: z.string().optional().register(sensitive),
    tokenFile: z.string().optional(),
    replyToMode: ReplyToModeSchema.optional(),
    groups: z.record(z.string(), TelegramGroupSchema.optional()).optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    defaultTo: z.union([z.string(), z.number()]).optional(),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    streaming: z.union([z.boolean(), z.enum(["off", "partial", "block", "progress"])]).optional(),
    blockStreaming: z.boolean().optional(),
    draftChunk: BlockStreamingChunkSchema.optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    // Legacy key kept for automatic migration to `streaming`.
    streamMode: z.enum(["off", "partial", "block"]).optional(),
    mediaMaxMb: z.number().positive().optional(),
    timeoutSeconds: z.number().int().positive().optional(),
    retry: RetryConfigSchema,
    network: z
      .object({
        autoSelectFamily: z.boolean().optional(),
        dnsResultOrder: z.enum(["ipv4first", "verbatim"]).optional(),
      })
      .strict()
      .optional(),
    proxy: z.string().optional(),
    webhookUrl: z
      .string()
      .optional()
      .describe(
        "Public HTTPS webhook URL registered with Telegram for inbound updates. This must be internet-reachable and requires channels.telegram.webhookSecret.",
      ),
    webhookSecret: z
      .string()
      .optional()
      .describe(
        "Secret token sent to Telegram during webhook registration and verified on inbound webhook requests. Telegram returns this value for verification; this is not the gateway auth token and not the bot token.",
      )
      .register(sensitive),
    webhookPath: z
      .string()
      .optional()
      .describe(
        "Local webhook route path served by the gateway listener. Defaults to /telegram-webhook.",
      ),
    webhookHost: z
      .string()
      .optional()
      .describe(
        "Local bind host for the webhook listener. Defaults to 127.0.0.1; keep loopback unless you intentionally expose direct ingress.",
      ),
    webhookPort: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Local bind port for the webhook listener. Defaults to 8787; set to 0 to let the OS assign an ephemeral port.",
      ),
    actions: z
      .object({
        reactions: z.boolean().optional(),
        sendMessage: z.boolean().optional(),
        deleteMessage: z.boolean().optional(),
        sticker: z.boolean().optional(),
      })
      .strict()
      .optional(),
    reactionNotifications: z.enum(["off", "own", "all"]).optional(),
    reactionLevel: z.enum(["off", "ack", "minimal", "extensive"]).optional(),
    heartbeat: ChannelHeartbeatVisibilitySchema,
    linkPreview: z.boolean().optional(),
    responsePrefix: z.string().optional(),
    ackReaction: z.string().optional(),
  })
  .strict();

export const TelegramAccountSchema = TelegramAccountSchemaBase.superRefine((value, ctx) => {
  normalizeTelegramStreamingConfig(value);
  // Account-level schemas skip allowFrom validation because accounts inherit
  // allowFrom from the parent channel config at runtime (resolveTelegramAccount
  // shallow-merges top-level and account values in src/telegram/accounts.ts).
  // Validation is enforced at the top-level TelegramConfigSchema instead.
  validateTelegramCustomCommands(value, ctx);
});

export const TelegramConfigSchema = TelegramAccountSchemaBase.extend({
  accounts: z.record(z.string(), TelegramAccountSchema.optional()).optional(),
}).superRefine((value, ctx) => {
  normalizeTelegramStreamingConfig(value);
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.telegram.dmPolicy="open" requires channels.telegram.allowFrom to include "*"',
  });
  requireAllowlistAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.telegram.dmPolicy="allowlist" requires channels.telegram.allowFrom to contain at least one sender ID',
  });
  validateTelegramCustomCommands(value, ctx);

  if (value.accounts) {
    for (const [accountId, account] of Object.entries(value.accounts)) {
      if (!account) {
        continue;
      }
      const effectivePolicy = account.dmPolicy ?? value.dmPolicy;
      const effectiveAllowFrom = account.allowFrom ?? value.allowFrom;
      requireOpenAllowFrom({
        policy: effectivePolicy,
        allowFrom: effectiveAllowFrom,
        ctx,
        path: ["accounts", accountId, "allowFrom"],
        message:
          'channels.telegram.accounts.*.dmPolicy="open" requires channels.telegram.accounts.*.allowFrom (or channels.telegram.allowFrom) to include "*"',
      });
      requireAllowlistAllowFrom({
        policy: effectivePolicy,
        allowFrom: effectiveAllowFrom,
        ctx,
        path: ["accounts", accountId, "allowFrom"],
        message:
          'channels.telegram.accounts.*.dmPolicy="allowlist" requires channels.telegram.accounts.*.allowFrom (or channels.telegram.allowFrom) to contain at least one sender ID',
      });
    }
  }

  const baseWebhookUrl = typeof value.webhookUrl === "string" ? value.webhookUrl.trim() : "";
  const baseWebhookSecret =
    typeof value.webhookSecret === "string" ? value.webhookSecret.trim() : "";
  if (baseWebhookUrl && !baseWebhookSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "channels.telegram.webhookUrl requires channels.telegram.webhookSecret",
      path: ["webhookSecret"],
    });
  }
  if (!value.accounts) {
    return;
  }
  for (const [accountId, account] of Object.entries(value.accounts)) {
    if (!account) {
      continue;
    }
    if (account.enabled === false) {
      continue;
    }
    const effectiveDmPolicy = account.dmPolicy ?? value.dmPolicy;
    const effectiveAllowFrom = Array.isArray(account.allowFrom)
      ? account.allowFrom
      : value.allowFrom;
    requireOpenAllowFrom({
      policy: effectiveDmPolicy,
      allowFrom: effectiveAllowFrom,
      ctx,
      path: ["accounts", accountId, "allowFrom"],
      message:
        'channels.telegram.accounts.*.dmPolicy="open" requires channels.telegram.allowFrom or channels.telegram.accounts.*.allowFrom to include "*"',
    });
    requireAllowlistAllowFrom({
      policy: effectiveDmPolicy,
      allowFrom: effectiveAllowFrom,
      ctx,
      path: ["accounts", accountId, "allowFrom"],
      message:
        'channels.telegram.accounts.*.dmPolicy="allowlist" requires channels.telegram.allowFrom or channels.telegram.accounts.*.allowFrom to contain at least one sender ID',
    });

    const accountWebhookUrl =
      typeof account.webhookUrl === "string" ? account.webhookUrl.trim() : "";
    if (!accountWebhookUrl) {
      continue;
    }
    const accountSecret =
      typeof account.webhookSecret === "string" ? account.webhookSecret.trim() : "";
    if (!accountSecret && !baseWebhookSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "channels.telegram.accounts.*.webhookUrl requires channels.telegram.webhookSecret or channels.telegram.accounts.*.webhookSecret",
        path: ["accounts", accountId, "webhookSecret"],
      });
    }
  }
});

const BlueBubblesAllowFromEntry = z.union([z.string(), z.number()]);

const BlueBubblesActionSchema = z
  .object({
    reactions: z.boolean().optional(),
    edit: z.boolean().optional(),
    unsend: z.boolean().optional(),
    reply: z.boolean().optional(),
    sendWithEffect: z.boolean().optional(),
    renameGroup: z.boolean().optional(),
    setGroupIcon: z.boolean().optional(),
    addParticipant: z.boolean().optional(),
    removeParticipant: z.boolean().optional(),
    leaveGroup: z.boolean().optional(),
    sendAttachment: z.boolean().optional(),
  })
  .strict()
  .optional();

const BlueBubblesGroupConfigSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    toolsBySender: ToolPolicyBySenderSchema,
  })
  .strict();

export const BlueBubblesAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    markdown: MarkdownConfigSchema,
    configWrites: z.boolean().optional(),
    enabled: z.boolean().optional(),
    serverUrl: z.string().optional(),
    password: z.string().optional().register(sensitive),
    webhookPath: z.string().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(BlueBubblesAllowFromEntry).optional(),
    groupAllowFrom: z.array(BlueBubblesAllowFromEntry).optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    mediaMaxMb: z.number().int().positive().optional(),
    mediaLocalRoots: z.array(z.string()).optional(),
    sendReadReceipts: z.boolean().optional(),
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    groups: z.record(z.string(), BlueBubblesGroupConfigSchema.optional()).optional(),
    heartbeat: ChannelHeartbeatVisibilitySchema,
    responsePrefix: z.string().optional(),
  })
  .strict();

// Account-level schemas skip allowFrom validation because accounts inherit
// allowFrom from the parent channel config at runtime.
// Validation is enforced at the top-level BlueBubblesConfigSchema instead.
export const BlueBubblesAccountSchema = BlueBubblesAccountSchemaBase;

export const BlueBubblesConfigSchema = BlueBubblesAccountSchemaBase.extend({
  accounts: z.record(z.string(), BlueBubblesAccountSchema.optional()).optional(),
  actions: BlueBubblesActionSchema,
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.bluebubbles.dmPolicy="open" requires channels.bluebubbles.allowFrom to include "*"',
  });
  requireAllowlistAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.bluebubbles.dmPolicy="allowlist" requires channels.bluebubbles.allowFrom to contain at least one sender ID',
  });

  if (!value.accounts) {
    return;
  }
  for (const [accountId, account] of Object.entries(value.accounts)) {
    if (!account) {
      continue;
    }
    const effectivePolicy = account.dmPolicy ?? value.dmPolicy;
    const effectiveAllowFrom = account.allowFrom ?? value.allowFrom;
    requireOpenAllowFrom({
      policy: effectivePolicy,
      allowFrom: effectiveAllowFrom,
      ctx,
      path: ["accounts", accountId, "allowFrom"],
      message:
        'channels.bluebubbles.accounts.*.dmPolicy="open" requires channels.bluebubbles.accounts.*.allowFrom (or channels.bluebubbles.allowFrom) to include "*"',
    });
    requireAllowlistAllowFrom({
      policy: effectivePolicy,
      allowFrom: effectiveAllowFrom,
      ctx,
      path: ["accounts", accountId, "allowFrom"],
      message:
        'channels.bluebubbles.accounts.*.dmPolicy="allowlist" requires channels.bluebubbles.accounts.*.allowFrom (or channels.bluebubbles.allowFrom) to contain at least one sender ID',
    });
  }
});

export const MSTeamsChannelSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    toolsBySender: ToolPolicyBySenderSchema,
    replyStyle: MSTeamsReplyStyleSchema.optional(),
  })
  .strict();

export const MSTeamsTeamSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    toolsBySender: ToolPolicyBySenderSchema,
    replyStyle: MSTeamsReplyStyleSchema.optional(),
    channels: z.record(z.string(), MSTeamsChannelSchema.optional()).optional(),
  })
  .strict();

export const MSTeamsConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    capabilities: z.array(z.string()).optional(),
    dangerouslyAllowNameMatching: z.boolean().optional(),
    markdown: MarkdownConfigSchema,
    configWrites: z.boolean().optional(),
    appId: z.string().optional(),
    appPassword: z.string().optional().register(sensitive),
    tenantId: z.string().optional(),
    webhook: z
      .object({
        port: z.number().int().positive().optional(),
        path: z.string().optional(),
      })
      .strict()
      .optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.string()).optional(),
    defaultTo: z.string().optional(),
    groupAllowFrom: z.array(z.string()).optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    mediaAllowHosts: z.array(z.string()).optional(),
    mediaAuthAllowHosts: z.array(z.string()).optional(),
    requireMention: z.boolean().optional(),
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    replyStyle: MSTeamsReplyStyleSchema.optional(),
    teams: z.record(z.string(), MSTeamsTeamSchema.optional()).optional(),
    /** Max media size in MB (default: 100MB for OneDrive upload support). */
    mediaMaxMb: z.number().positive().optional(),
    /** SharePoint site ID for file uploads in group chats/channels (e.g., "contoso.sharepoint.com,guid1,guid2") */
    sharePointSiteId: z.string().optional(),
    heartbeat: ChannelHeartbeatVisibilitySchema,
    responsePrefix: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    requireOpenAllowFrom({
      policy: value.dmPolicy,
      allowFrom: value.allowFrom,
      ctx,
      path: ["allowFrom"],
      message:
        'channels.msteams.dmPolicy="open" requires channels.msteams.allowFrom to include "*"',
    });
    requireAllowlistAllowFrom({
      policy: value.dmPolicy,
      allowFrom: value.allowFrom,
      ctx,
      path: ["allowFrom"],
      message:
        'channels.msteams.dmPolicy="allowlist" requires channels.msteams.allowFrom to contain at least one sender ID',
    });
  });
