import type { CommandHandlerResult } from "../commands-types.js";
import { formatRunLabel, sortSubagentRuns } from "../subagents-utils.js";
import { type SubagentsCommandContext, stopWithText } from "./shared.js";

export function handleSubagentsAgentsAction(ctx: SubagentsCommandContext): CommandHandlerResult {
  const { runs } = ctx;
  const visibleRuns = sortSubagentRuns(runs).filter((entry) => !entry.endedAt);

  const lines = ["agents:", "-----"];
  if (visibleRuns.length === 0) {
    lines.push("(none)");
  } else {
    let index = 1;
    for (const entry of visibleRuns) {
      lines.push(`${index}. ${formatRunLabel(entry)}`);
      index += 1;
    }
  }

  return stopWithText(lines.join("\n"));
}
