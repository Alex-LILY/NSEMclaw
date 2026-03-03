import {
  resolveAcpSessionCwd,
  resolveAcpThreadSessionDetailLines,
} from "../../../acp/runtime/session-identifiers.js";
import { readAcpSessionEntry } from "../../../acp/runtime/session-meta.js";
import { getSessionBindingService } from "../../../infra/outbound/session-binding-service.js";
import type { CommandHandlerResult } from "../commands-types.js";
import { type SubagentsCommandContext, resolveFocusTargetSession, stopWithText } from "./shared.js";

export async function handleSubagentsFocusAction(
  _ctx: SubagentsCommandContext,
): Promise<CommandHandlerResult> {
  return stopWithText("⚠️ /focus is temporarily unavailable.");
}
