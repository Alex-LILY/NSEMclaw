import { Type } from "@sinclair/typebox";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { ACP_SPAWN_MODES, spawnAcpDirect } from "../acp-spawn.js";
import { optionalStringEnum } from "../schema/typebox.js";
import { SUBAGENT_SPAWN_MODES, spawnSubagentDirect } from "../subagent-spawn.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const SESSIONS_SPAWN_RUNTIMES = ["subagent", "acp"] as const;

const SessionsSpawnToolSchema = Type.Object({
  task: Type.String(),
  label: Type.Optional(Type.String()),
  runtime: optionalStringEnum(SESSIONS_SPAWN_RUNTIMES),
  agentId: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  thinking: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
  runTimeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  // Back-compat: older callers used timeoutSeconds for this tool.
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  thread: Type.Optional(Type.Boolean()),
  mode: optionalStringEnum(SUBAGENT_SPAWN_MODES),
  cleanup: optionalStringEnum(["delete", "keep"] as const),
  // 记忆继承参数
  parentAgentId: Type.Optional(Type.String({ description: "父 Agent ID，用于记忆继承" })),
  memoryInheritanceStrategy: Type.Optional(
    Type.String({ description: "记忆继承策略: full/filtered/summarized/referenced/none" }),
  ),
  minInheritedImportance: Type.Optional(
    Type.Number({ minimum: 0, maximum: 1, description: "继承记忆的最小重要性 (0-1)" }),
  ),
});

export function createSessionsSpawnTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  sandboxed?: boolean;
  /** Explicit agent ID override for cron/hook sessions where session key parsing may not work. */
  requesterAgentIdOverride?: string;
}): AnyAgentTool {
  return {
    label: "Sessions",
    name: "sessions_spawn",
    description:
      'Spawn an isolated session (runtime="subagent" or runtime="acp"). mode="run" is one-shot and mode="session" is persistent/thread-bound.',
    parameters: SessionsSpawnToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const task = readStringParam(params, "task", { required: true });
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const runtime = params.runtime === "acp" ? "acp" : "subagent";
      const requestedAgentId = readStringParam(params, "agentId");
      const modelOverride = readStringParam(params, "model");
      const thinkingOverrideRaw = readStringParam(params, "thinking");
      const cwd = readStringParam(params, "cwd");
      const mode = params.mode === "run" || params.mode === "session" ? params.mode : undefined;
      const cleanup =
        params.cleanup === "keep" || params.cleanup === "delete" ? params.cleanup : "keep";
      // Back-compat: older callers used timeoutSeconds for this tool.
      const timeoutSecondsCandidate =
        typeof params.runTimeoutSeconds === "number"
          ? params.runTimeoutSeconds
          : typeof params.timeoutSeconds === "number"
            ? params.timeoutSeconds
            : undefined;
      const runTimeoutSeconds =
        typeof timeoutSecondsCandidate === "number" && Number.isFinite(timeoutSecondsCandidate)
          ? Math.max(0, Math.floor(timeoutSecondsCandidate))
          : undefined;
      const thread = params.thread === true;
      // 记忆继承参数
      const parentAgentId = readStringParam(params, "parentAgentId");
      const memoryInheritanceStrategy = readStringParam(params, "memoryInheritanceStrategy") as
        | "full"
        | "filtered"
        | "summarized"
        | "referenced"
        | "none"
        | undefined;
      const minInheritedImportance =
        typeof params.minInheritedImportance === "number"
          ? params.minInheritedImportance
          : undefined;

      const result =
        runtime === "acp"
          ? await spawnAcpDirect(
              {
                task,
                label: label || undefined,
                agentId: requestedAgentId,
                cwd,
                mode: mode && ACP_SPAWN_MODES.includes(mode) ? mode : undefined,
                thread,
                // ACP 也支持记忆继承参数
                parentAgentId,
                memoryInheritanceStrategy,
                minInheritedImportance,
              },
              {
                agentSessionKey: opts?.agentSessionKey,
                agentChannel: opts?.agentChannel,
                agentAccountId: opts?.agentAccountId,
                agentTo: opts?.agentTo,
                agentThreadId: opts?.agentThreadId,
              },
            )
          : await spawnSubagentDirect(
              {
                task,
                label: label || undefined,
                agentId: requestedAgentId,
                model: modelOverride,
                thinking: thinkingOverrideRaw,
                runTimeoutSeconds,
                thread,
                mode,
                cleanup,
                expectsCompletionMessage: true,
                // 记忆继承参数
                parentAgentId,
                memoryInheritanceStrategy,
                minInheritedImportance,
              },
              {
                agentSessionKey: opts?.agentSessionKey,
                agentChannel: opts?.agentChannel,
                agentAccountId: opts?.agentAccountId,
                agentTo: opts?.agentTo,
                agentThreadId: opts?.agentThreadId,
                agentGroupId: opts?.agentGroupId,
                agentGroupChannel: opts?.agentGroupChannel,
                agentGroupSpace: opts?.agentGroupSpace,
                requesterAgentIdOverride: opts?.requesterAgentIdOverride,
              },
            );

      return jsonResult(result);
    },
  };
}
