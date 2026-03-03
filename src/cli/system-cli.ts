import type { Command } from "commander";
import { danger } from "../globals.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import type { GatewayRpcOpts } from "./gateway-rpc.js";
import { addGatewayClientOptions, callGatewayFromCli } from "./gateway-rpc.js";

type SystemEventOpts = GatewayRpcOpts & { text?: string; mode?: string; json?: boolean };
type SystemGatewayOpts = GatewayRpcOpts & { json?: boolean };

const normalizeWakeMode = (raw: unknown) => {
  const mode = typeof raw === "string" ? raw.trim() : "";
  if (!mode) {
    return "next-heartbeat" as const;
  }
  if (mode === "now" || mode === "next-heartbeat") {
    return mode;
  }
  throw new Error("--mode 必须是 now 或 next-heartbeat");
};

async function runSystemGatewayCommand(
  opts: SystemGatewayOpts,
  action: () => Promise<unknown>,
  successText?: string,
): Promise<void> {
  try {
    const result = await action();
    if (opts.json || successText === undefined) {
      defaultRuntime.log(JSON.stringify(result, null, 2));
    } else {
      defaultRuntime.log(successText);
    }
  } catch (err) {
    defaultRuntime.error(danger(String(err)));
    defaultRuntime.exit(1);
  }
}

export function registerSystemCli(program: Command) {
  const system = program
    .command("system")
    .description("系统工具 (事件、心跳、在线状态)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/system", "docs.nsemclaw.ai/cli/system")}\n`,
    );

  addGatewayClientOptions(
    system
      .command("event")
      .description("将系统事件加入队列并可选择触发心跳")
      .requiredOption("--text <text>", "系统事件文本")
      .option("--mode <mode>", "唤醒模式 (now|next-heartbeat)", "next-heartbeat")
      .option("--json", "输出 JSON", false),
  ).action(async (opts: SystemEventOpts) => {
    await runSystemGatewayCommand(
      opts,
      async () => {
        const text = typeof opts.text === "string" ? opts.text.trim() : "";
        if (!text) {
          throw new Error("--text 是必需的");
        }
        const mode = normalizeWakeMode(opts.mode);
        return await callGatewayFromCli("wake", opts, { mode, text }, { expectFinal: false });
      },
      "ok",
    );
  });

  const heartbeat = system.command("heartbeat").description("心跳控制");

  addGatewayClientOptions(
    heartbeat
      .command("last")
      .description("显示上次心跳事件")
      .option("--json", "Output JSON", false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli("last-heartbeat", opts, undefined, {
        expectFinal: false,
      });
    });
  });

  addGatewayClientOptions(
    heartbeat.command("enable").description("启用心跳").option("--json", "Output JSON", false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli(
        "set-heartbeats",
        opts,
        { enabled: true },
        { expectFinal: false },
      );
    });
  });

  addGatewayClientOptions(
    heartbeat
      .command("disable")
      .description("Disable heartbeats")
      .option("--json", "Output JSON", false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli(
        "set-heartbeats",
        opts,
        { enabled: false },
        { expectFinal: false },
      );
    });
  });

  addGatewayClientOptions(
    system
      .command("presence")
      .description("列出系统在线状态条目")
      .option("--json", "Output JSON", false),
  ).action(async (opts: SystemGatewayOpts) => {
    await runSystemGatewayCommand(opts, async () => {
      return await callGatewayFromCli("system-presence", opts, undefined, {
        expectFinal: false,
      });
    });
  });
}
