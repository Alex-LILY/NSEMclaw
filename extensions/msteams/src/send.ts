import type { NsemclawConfig } from "nsemclaw/plugin-sdk";
import { resolveChannelMediaMaxBytes } from "nsemclaw/plugin-sdk";
import { createMSTeamsConversationStoreFs } from "./conversation-store-fs.js";
import {
  classifyMSTeamsSendError,
  formatMSTeamsSendErrorHint,
  formatUnknownError,
} from "./errors.js";
import { extractFilename, extractMessageId } from "./media-helpers.js";
import { buildConversationReference, sendMSTeamsMessages } from "./messenger.js";
import { buildMSTeamsPollCard } from "./polls.js";
import { getMSTeamsRuntime } from "./runtime.js";
import { resolveMSTeamsSendContext, type MSTeamsProactiveContext } from "./send-context.js";

export type SendMSTeamsMessageParams = {
  /** Full config (for credentials) */
  cfg: NsemclawConfig;
  /** Conversation ID or user ID to send to */
  to: string;
  /** Message text */
  text: string;
  /** Optional media URL */
  mediaUrl?: string;
};

export type SendMSTeamsMessageResult = {
  messageId: string;
  conversationId: string;
  /** If a FileConsentCard was sent instead of the file, this contains the upload ID */
  pendingUploadId?: string;
};

/** Threshold for large files that require FileConsentCard flow in personal chats */
const FILE_CONSENT_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4MB

/**
 * MSTeams-specific media size limit (100MB).
 * Higher than the default because OneDrive upload handles large files well.
 */
const MSTEAMS_MAX_MEDIA_BYTES = 100 * 1024 * 1024;

export type SendMSTeamsPollParams = {
  /** Full config (for credentials) */
  cfg: NsemclawConfig;
  /** Conversation ID or user ID to send to */
  to: string;
  /** Poll question */
  question: string;
  /** Poll options */
  options: string[];
  /** Max selections (defaults to 1) */
  maxSelections?: number;
};

export type SendMSTeamsPollResult = {
  pollId: string;
  messageId: string;
  conversationId: string;
};

export type SendMSTeamsCardParams = {
  /** Full config (for credentials) */
  cfg: NsemclawConfig;
  /** Conversation ID or user ID to send to */
  to: string;
  /** Adaptive Card JSON object */
  card: Record<string, unknown>;
};

export type SendMSTeamsCardResult = {
  messageId: string;
  conversationId: string;
};

/**
 * Send a message to a Teams conversation or user.
 *
 * Uses the stored ConversationReference from previous interactions.
 * The bot must have received at least one message from the conversation
 * before proactive messaging works.
 *
 * File handling by conversation type:
 * - Personal (1:1) chats: small images (<4MB) use base64, large files and non-images use FileConsentCard
 * - Group chats / channels: files are uploaded to OneDrive and shared via link
 */
export async function sendMessageMSTeams(
  params: SendMSTeamsMessageParams,
): Promise<SendMSTeamsMessageResult> {
  const { cfg, to, text, mediaUrl } = params;
  const tableMode = getMSTeamsRuntime().channel.text.resolveMarkdownTableMode({
    cfg,
    channel: "msteams",
  });
  const messageText = getMSTeamsRuntime().channel.text.convertMarkdownTables(text ?? "", tableMode);
  const ctx = await resolveMSTeamsSendContext({ cfg, to });
  const {
    adapter,
    appId,
    conversationId,
    ref,
    log,
    conversationType,
    tokenProvider,
    sharePointSiteId,
  } = ctx;

  log.debug?.("sending proactive message", {
    conversationId,
    conversationType,
    textLength: messageText.length,
    hasMedia: Boolean(mediaUrl),
  });

  // Handle media if present
  if (mediaUrl) {
    throw new Error("Media loading is not supported in this build");
  }

  // No media: send text only
  return sendTextWithMedia(ctx, messageText, undefined);
}

/**
 * Send a text message with optional base64 media URL.
 */
async function sendTextWithMedia(
  ctx: MSTeamsProactiveContext,
  text: string,
  mediaUrl: string | undefined,
): Promise<SendMSTeamsMessageResult> {
  const {
    adapter,
    appId,
    conversationId,
    ref,
    log,
    tokenProvider,
    sharePointSiteId,
    mediaMaxBytes,
  } = ctx;

  let messageIds: string[];
  try {
    messageIds = await sendMSTeamsMessages({
      replyStyle: "top-level",
      adapter,
      appId,
      conversationRef: ref,
      messages: [{ text: text || undefined, mediaUrl }],
      retry: {},
      onRetry: (event) => {
        log.debug?.("retrying send", { conversationId, ...event });
      },
      tokenProvider,
      sharePointSiteId,
      mediaMaxBytes,
    });
  } catch (err) {
    const classification = classifyMSTeamsSendError(err);
    const hint = formatMSTeamsSendErrorHint(classification);
    const status = classification.statusCode ? ` (HTTP ${classification.statusCode})` : "";
    throw new Error(
      `msteams send failed${status}: ${formatUnknownError(err)}${hint ? ` (${hint})` : ""}`,
      { cause: err },
    );
  }

  const messageId = messageIds[0] ?? "unknown";
  log.info("sent proactive message", { conversationId, messageId });

  return {
    messageId,
    conversationId,
  };
}

type ProactiveActivityParams = {
  adapter: MSTeamsProactiveContext["adapter"];
  appId: string;
  ref: MSTeamsProactiveContext["ref"];
  activity: Record<string, unknown>;
  errorPrefix: string;
};

async function sendProactiveActivity({
  adapter,
  appId,
  ref,
  activity,
  errorPrefix,
}: ProactiveActivityParams): Promise<string> {
  const baseRef = buildConversationReference(ref);
  const proactiveRef = {
    ...baseRef,
    activityId: undefined,
  };

  let messageId = "unknown";
  try {
    await adapter.continueConversation(appId, proactiveRef, async (ctx) => {
      const response = await ctx.sendActivity(activity);
      messageId = extractMessageId(response) ?? "unknown";
    });
    return messageId;
  } catch (err) {
    const classification = classifyMSTeamsSendError(err);
    const hint = formatMSTeamsSendErrorHint(classification);
    const status = classification.statusCode ? ` (HTTP ${classification.statusCode})` : "";
    throw new Error(
      `${errorPrefix} failed${status}: ${formatUnknownError(err)}${hint ? ` (${hint})` : ""}`,
      { cause: err },
    );
  }
}

/**
 * Send a poll (Adaptive Card) to a Teams conversation or user.
 */
export async function sendPollMSTeams(
  params: SendMSTeamsPollParams,
): Promise<SendMSTeamsPollResult> {
  const { cfg, to, question, options, maxSelections } = params;
  const { adapter, appId, conversationId, ref, log } = await resolveMSTeamsSendContext({
    cfg,
    to,
  });

  const pollCard = buildMSTeamsPollCard({
    question,
    options,
    maxSelections,
  });

  log.debug?.("sending poll", {
    conversationId,
    pollId: pollCard.pollId,
    optionCount: pollCard.options.length,
  });

  const activity = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: pollCard.card,
      },
    ],
  };

  // Send poll via proactive conversation (Adaptive Cards require direct activity send)
  const messageId = await sendProactiveActivity({
    adapter,
    appId,
    ref,
    activity,
    errorPrefix: "msteams poll send",
  });

  log.info("sent poll", { conversationId, pollId: pollCard.pollId, messageId });

  return {
    pollId: pollCard.pollId,
    messageId,
    conversationId,
  };
}

/**
 * Send an arbitrary Adaptive Card to a Teams conversation or user.
 */
export async function sendAdaptiveCardMSTeams(
  params: SendMSTeamsCardParams,
): Promise<SendMSTeamsCardResult> {
  const { cfg, to, card } = params;
  const { adapter, appId, conversationId, ref, log } = await resolveMSTeamsSendContext({
    cfg,
    to,
  });

  log.debug?.("sending adaptive card", {
    conversationId,
    cardType: card.type,
    cardVersion: card.version,
  });

  const activity = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: card,
      },
    ],
  };

  // Send card via proactive conversation
  const messageId = await sendProactiveActivity({
    adapter,
    appId,
    ref,
    activity,
    errorPrefix: "msteams card send",
  });

  log.info("sent adaptive card", { conversationId, messageId });

  return {
    messageId,
    conversationId,
  };
}

/**
 * List all known conversation references (for debugging/CLI).
 */
export async function listMSTeamsConversations(): Promise<
  Array<{
    conversationId: string;
    userName?: string;
    conversationType?: string;
  }>
> {
  const store = createMSTeamsConversationStoreFs();
  const all = await store.list();
  return all.map(({ conversationId, reference }) => ({
    conversationId,
    userName: reference.user?.name,
    conversationType: reference.conversation?.conversationType,
  }));
}
