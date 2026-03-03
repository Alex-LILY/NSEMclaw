import type { CommandHandlerResult } from "../commands-types.js";
import { type SubagentsCommandContext, stopWithText } from "./shared.js";

export function handleSubagentsUnfocusAction(_ctx: SubagentsCommandContext): CommandHandlerResult {
  return stopWithText("⚠️ /unfocus is temporarily unavailable.");
}
