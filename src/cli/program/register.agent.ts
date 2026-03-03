import type { Command } from "commander";
import { agentCliCommand } from "../../commands/agent-via-gateway.js";
import {
  agentsAddCommand,
  agentsBindingsCommand,
  agentsBindCommand,
  agentsDeleteCommand,
  agentsListCommand,
  agentsSetIdentityCommand,
  agentsUnbindCommand,
} from "../../commands/agents.js";
import { setVerbose } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { hasExplicitOptions } from "../command-options.js";
import { createDefaultDeps } from "../deps.js";
import { formatHelpExamples } from "../help-format.js";
import { collectOption } from "./helpers.js";

export function registerAgentCommands(program: Command, args: { agentChannelOptions: string }) {
  program
    .command("agent")
    .description("通过网关运行智能体回合 (使用 --local 用于嵌入式)")
    .requiredOption("-m, --message <text>", "智能体的消息内容")
    .option("-t, --to <number>", "用于派生会话密钥的 E.164 收件人号码")
    .option("--session-id <id>", "使用显式会话 ID")
    .option("--agent <id>", "智能体 ID (覆盖路由绑定)")
    .option("--thinking <level>", "思考级别: off | minimal | low | medium | high")
    .option("--verbose <on|off>", "会话中保持智能体详细级别")
    .option("--channel <channel>", `投递频道: ${args.agentChannelOptions} (省略以使用主会话频道)`)
    .option("--reply-to <target>", "投递目标覆盖 (与会话路由分开)")
    .option("--reply-channel <channel>", "投递频道覆盖 (与路由分开)")
    .option("--reply-account <id>", "投递账户 ID 覆盖")
    .option("--local", "在本地运行嵌入式智能体 (需要在 shell 中设置模型提供商 API 密钥)", false)
    .option("--deliver", "将智能体的回复发送回选定频道", false)
    .option("--json", "以 JSON 格式输出结果", false)
    .option("--timeout <seconds>", "覆盖智能体命令超时 (秒，默认 600 或配置值)")
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ['nsemclaw agent --to +15555550123 --message "status update"', "开始新会话。"],
  ['nsemclaw agent --agent ops --message "Summarize logs"', "使用特定智能体。"],
  [
    'nsemclaw agent --session-id 1234 --message "Summarize inbox" --thinking medium',
    "Target a session with explicit thinking level.",
  ],
  [
    'nsemclaw agent --to +15555550123 --message "Trace logs" --verbose on --json',
    "Enable verbose logging and JSON output.",
  ],
  ['nsemclaw agent --to +15555550123 --message "Summon reply" --deliver', "投递回复。"],
  [
    'nsemclaw agent --agent ops --message "Generate report" --deliver --reply-channel slack --reply-to "#reports"',
    "Send reply to a different channel/target.",
  ],
])}

${theme.muted("Docs:")} ${formatDocsLink("/cli/agent", "docs.nsemclaw.ai/cli/agent")}`,
    )
    .action(async (opts) => {
      const verboseLevel = typeof opts.verbose === "string" ? opts.verbose.toLowerCase() : "";
      setVerbose(verboseLevel === "on");
      // Build default deps (keeps parity with other commands; future-proofing).
      const deps = createDefaultDeps();
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentCliCommand(opts, defaultRuntime, deps);
      });
    });

  const agents = program
    .command("agents")
    .description("管理隔离智能体（工作区 + 认证 + 路由）")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/agents", "docs.nsemclaw.ai/cli/agents")}\n`,
    );

  agents
    .command("list")
    .description("列出已配置的智能体")
    .option("--json", "输出 JSON 而非文本", false)
    .option("--bindings", "包含路由绑定", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsListCommand(
          { json: Boolean(opts.json), bindings: Boolean(opts.bindings) },
          defaultRuntime,
        );
      });
    });

  agents
    .command("bindings")
    .description("列出路由绑定")
    .option("--agent <id>", "按智能体 ID 筛选")
    .option("--json", "Output JSON instead of text", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsBindingsCommand(
          {
            agent: opts.agent as string | undefined,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents
    .command("bind")
    .description("为智能体添加路由绑定")
    .option("--agent <id>", "智能体 ID (默认为当前默认智能体)")
    .option(
      "--bind <channel[:accountId]>",
      "要添加的绑定 (可重复)。如果省略，accountId 由频道默认值/钩子解析。",
      collectOption,
      [],
    )
    .option("--json", "输出 JSON 摘要", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsBindCommand(
          {
            agent: opts.agent as string | undefined,
            bind: Array.isArray(opts.bind) ? (opts.bind as string[]) : undefined,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents
    .command("unbind")
    .description("移除智能体的路由绑定")
    .option("--agent <id>", "Agent id (defaults to current default agent)")
    .option("--bind <channel[:accountId]>", "要移除的绑定 (可重复)", collectOption, [])
    .option("--all", "移除此智能体的所有绑定", false)
    .option("--json", "Output JSON summary", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsUnbindCommand(
          {
            agent: opts.agent as string | undefined,
            bind: Array.isArray(opts.bind) ? (opts.bind as string[]) : undefined,
            all: Boolean(opts.all),
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents
    .command("add [name]")
    .description("添加新的隔离智能体")
    .option("--workspace <dir>", "新智能体的工作区目录")
    .option("--model <id>", "此智能体的模型 ID")
    .option("--agent-dir <dir>", "此智能体的智能体状态目录")
    .option("--bind <channel[:accountId]>", "路由频道绑定 (可重复)", collectOption, [])
    .option("--non-interactive", "禁用提示; 需要 --workspace", false)
    .option("--json", "Output JSON summary", false)
    .action(async (name, opts, command) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const hasFlags = hasExplicitOptions(command, [
          "workspace",
          "model",
          "agentDir",
          "bind",
          "nonInteractive",
        ]);
        await agentsAddCommand(
          {
            name: typeof name === "string" ? name : undefined,
            workspace: opts.workspace as string | undefined,
            model: opts.model as string | undefined,
            agentDir: opts.agentDir as string | undefined,
            bind: Array.isArray(opts.bind) ? (opts.bind as string[]) : undefined,
            nonInteractive: Boolean(opts.nonInteractive),
            json: Boolean(opts.json),
          },
          defaultRuntime,
          { hasFlags },
        );
      });
    });

  agents
    .command("set-identity")
    .description("更新智能体身份 (名称/主题/表情/头像)")
    .option("--agent <id>", "要更新的智能体 ID")
    .option("--workspace <dir>", "用于定位智能体 + IDENTITY.md 的工作区目录")
    .option("--identity-file <path>", "要读取的显式 IDENTITY.md 路径")
    .option("--from-identity", "从 IDENTITY.md 读取值", false)
    .option("--name <name>", "身份名称")
    .option("--theme <theme>", "身份主题")
    .option("--emoji <emoji>", "身份表情")
    .option("--avatar <value>", "身份头像 (工作区路径、http(s) URL 或 data URI)")
    .option("--json", "Output JSON summary", false)
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ['nsemclaw agents set-identity --agent main --name "Nsemclaw" --emoji "🦞"', "设置名称 + 表情。"],
  ["nsemclaw agents set-identity --agent main --avatar avatars/nsemclaw.png", "设置头像路径。"],
  [
    "nsemclaw agents set-identity --workspace ~/.nsemclaw/workspace --from-identity",
    "Load from IDENTITY.md.",
  ],
  [
    "nsemclaw agents set-identity --identity-file ~/.nsemclaw/workspace/IDENTITY.md --agent main",
    "Use a specific IDENTITY.md.",
  ],
])}
`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsSetIdentityCommand(
          {
            agent: opts.agent as string | undefined,
            workspace: opts.workspace as string | undefined,
            identityFile: opts.identityFile as string | undefined,
            fromIdentity: Boolean(opts.fromIdentity),
            name: opts.name as string | undefined,
            theme: opts.theme as string | undefined,
            emoji: opts.emoji as string | undefined,
            avatar: opts.avatar as string | undefined,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents
    .command("delete <id>")
    .description("删除智能体并清理工作区/状态")
    .option("--force", "跳过确认", false)
    .option("--json", "Output JSON summary", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsDeleteCommand(
          {
            id: String(id),
            force: Boolean(opts.force),
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents.action(async () => {
    await runCommandWithRuntime(defaultRuntime, async () => {
      await agentsListCommand({}, defaultRuntime);
    });
  });
}
