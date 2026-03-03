import type { Command } from "commander";
import { gatewayStatusCommand } from "../../commands/gateway-status.js";
import { formatHealthChannelLines, type HealthSummary } from "../../commands/health.js";
import { loadConfig } from "../../config/config.js";
import { discoverGatewayBeacons } from "../../infra/bonjour-discovery.js";
import type { CostUsageSummary } from "../../infra/session-cost-usage.js";
import { resolveWideAreaDiscoveryDomain } from "../../infra/widearea-dns.js";
import { defaultRuntime } from "../../runtime.js";
import { styleHealthChannelLine } from "../../terminal/health-style.js";
import { formatDocsLink } from "../../terminal/links.js";
import { colorize, isRich, theme } from "../../terminal/theme.js";
import { formatTokenCount, formatUsd } from "../../utils/usage-format.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { inheritOptionFromParent } from "../command-options.js";
import { addGatewayServiceCommands } from "../daemon-cli.js";
import { formatHelpExamples } from "../help-format.js";
import { withProgress } from "../progress.js";
import { callGatewayCli, gatewayCallOpts } from "./call.js";
import type { GatewayDiscoverOpts } from "./discover.js";
import {
  dedupeBeacons,
  parseDiscoverTimeoutMs,
  pickBeaconHost,
  pickGatewayPort,
  renderBeaconLines,
} from "./discover.js";
import { addGatewayRunCommand } from "./run.js";

function runGatewayCommand(action: () => Promise<void>, label?: string) {
  return runCommandWithRuntime(defaultRuntime, action, (err) => {
    const message = String(err);
    defaultRuntime.error(label ? `${label}: ${message}` : message);
    defaultRuntime.exit(1);
  });
}

function parseDaysOption(raw: unknown, fallback = 30): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return fallback;
}

function resolveGatewayRpcOptions<T extends { token?: string; password?: string }>(
  opts: T,
  command?: Command,
): T {
  const parentToken = inheritOptionFromParent<string>(command, "token");
  const parentPassword = inheritOptionFromParent<string>(command, "password");
  return {
    ...opts,
    token: opts.token ?? parentToken,
    password: opts.password ?? parentPassword,
  };
}

function renderCostUsageSummary(summary: CostUsageSummary, days: number, rich: boolean): string[] {
  const totalCost = formatUsd(summary.totals.totalCost) ?? "$0.00";
  const totalTokens = formatTokenCount(summary.totals.totalTokens) ?? "0";
  const lines = [
    colorize(rich, theme.heading, `使用成本 (${days} 天)`),
    `${colorize(rich, theme.muted, "总计:")} ${totalCost} · ${totalTokens} 令牌`,
  ];

  if (summary.totals.missingCostEntries > 0) {
    lines.push(`${colorize(rich, theme.muted, "缺失条目:")} ${summary.totals.missingCostEntries}`);
  }

  const latest = summary.daily.at(-1);
  if (latest) {
    const latestCost = formatUsd(latest.totalCost) ?? "$0.00";
    const latestTokens = formatTokenCount(latest.totalTokens) ?? "0";
    lines.push(
      `${colorize(rich, theme.muted, "最新一天:")} ${latest.date} · ${latestCost} · ${latestTokens} 令牌`,
    );
  }

  return lines;
}

export function registerGatewayCli(program: Command) {
  const gateway = addGatewayRunCommand(
    program
      .command("gateway")
      .description("运行、检查和查询 WebSocket 网关")
      .addHelpText(
        "after",
        () =>
          `\n${theme.heading("Examples:")}\n${formatHelpExamples([
            ["nsemclaw gateway run", "在前台运行网关。"],
            ["nsemclaw gateway status", "显示服务状态和探测可达性。"],
            ["nsemclaw gateway discover", "查找本地和广域网关信标。"],
            ["nsemclaw gateway call health", "直接调用网关 RPC 方法。"],
          ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.nsemclaw.ai/cli/gateway")}\n`,
      ),
  );

  addGatewayRunCommand(gateway.command("run").description("运行 WebSocket 网关 (前台)"));

  addGatewayServiceCommands(gateway, {
    statusDescription: "显示网关服务状态 + 探测网关",
  });

  gatewayCallOpts(
    gateway
      .command("call")
      .description("调用网关方法")
      .argument("<method>", "方法名称 (health/status/system-presence/cron.*)")
      .option("--params <json>", "参数的 JSON 对象字符串", "{}")
      .action(async (method, opts, command) => {
        await runGatewayCommand(async () => {
          const rpcOpts = resolveGatewayRpcOptions(opts, command);
          const params = JSON.parse(String(opts.params ?? "{}"));
          const result = await callGatewayCli(method, rpcOpts, params);
          if (rpcOpts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          const rich = isRich();
          defaultRuntime.log(
            `${colorize(rich, theme.heading, "Gateway call")}: ${colorize(rich, theme.muted, String(method))}`,
          );
          defaultRuntime.log(JSON.stringify(result, null, 2));
        }, "网关调用失败");
      }),
  );

  gatewayCallOpts(
    gateway
      .command("usage-cost")
      .description("从会话日志获取使用成本摘要")
      .option("--days <days>", "包含的天数", "30")
      .action(async (opts, command) => {
        await runGatewayCommand(async () => {
          const rpcOpts = resolveGatewayRpcOptions(opts, command);
          const days = parseDaysOption(opts.days);
          const result = await callGatewayCli("usage.cost", rpcOpts, { days });
          if (rpcOpts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          const rich = isRich();
          const summary = result as CostUsageSummary;
          for (const line of renderCostUsageSummary(summary, days, rich)) {
            defaultRuntime.log(line);
          }
        }, "网关使用成本获取失败");
      }),
  );

  gatewayCallOpts(
    gateway
      .command("health")
      .description("获取网关健康状态")
      .action(async (opts, command) => {
        await runGatewayCommand(async () => {
          const rpcOpts = resolveGatewayRpcOptions(opts, command);
          const result = await callGatewayCli("health", rpcOpts);
          if (rpcOpts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          const rich = isRich();
          const obj: Record<string, unknown> = result && typeof result === "object" ? result : {};
          const durationMs = typeof obj.durationMs === "number" ? obj.durationMs : null;
          defaultRuntime.log(colorize(rich, theme.heading, "网关健康"));
          defaultRuntime.log(
            `${colorize(rich, theme.success, "正常")}${durationMs != null ? ` (${durationMs}ms)` : ""}`,
          );
          if (obj.channels && typeof obj.channels === "object") {
            for (const line of formatHealthChannelLines(obj as HealthSummary)) {
              defaultRuntime.log(styleHealthChannelLine(line, rich));
            }
          }
        });
      }),
  );

  gateway
    .command("probe")
    .description("显示网关可达性 + 发现 + 健康 + 状态摘要 (本地 + 远程)")
    .option("--url <url>", "显式网关 WebSocket URL (仍会探测 localhost)")
    .option("--ssh <target>", "远程网关隧道的 SSH 目标 (user@host 或 user@host:port)")
    .option("--ssh-identity <path>", "SSH 身份文件路径")
    .option("--ssh-auto", "尝试从 Bonjour 发现派生 SSH 目标", false)
    .option("--token <token>", "网关令牌 (应用于所有探测)")
    .option("--password <password>", "网关密码 (应用于所有探测)")
    .option("--timeout <ms>", "总探测预算 (毫秒)", "3000")
    .option("--json", "Output JSON", false)
    .action(async (opts, command) => {
      await runGatewayCommand(async () => {
        const rpcOpts = resolveGatewayRpcOptions(opts, command);
        await gatewayStatusCommand(rpcOpts, defaultRuntime);
      });
    });

  gateway
    .command("discover")
    .description("通过 Bonjour 发现网关 (如果配置则为本地 + 广域)")
    .option("--timeout <ms>", "每命令超时 (毫秒)", "2000")
    .option("--json", "Output JSON", false)
    .action(async (opts: GatewayDiscoverOpts) => {
      await runGatewayCommand(async () => {
        const cfg = loadConfig();
        const wideAreaDomain = resolveWideAreaDiscoveryDomain({
          configDomain: cfg.discovery?.wideArea?.domain,
        });
        const timeoutMs = parseDiscoverTimeoutMs(opts.timeout, 2000);
        const domains = ["local.", ...(wideAreaDomain ? [wideAreaDomain] : [])];
        const beacons = await withProgress(
          {
            label: "正在扫描网关…",
            indeterminate: true,
            enabled: opts.json !== true,
            delayMs: 0,
          },
          async () => await discoverGatewayBeacons({ timeoutMs, wideAreaDomain }),
        );

        const deduped = dedupeBeacons(beacons).toSorted((a, b) =>
          String(a.displayName || a.instanceName).localeCompare(
            String(b.displayName || b.instanceName),
          ),
        );

        if (opts.json) {
          const enriched = deduped.map((b) => {
            const host = pickBeaconHost(b);
            const port = pickGatewayPort(b);
            return { ...b, wsUrl: host ? `ws://${host}:${port}` : null };
          });
          defaultRuntime.log(
            JSON.stringify(
              {
                timeoutMs,
                domains,
                count: enriched.length,
                beacons: enriched,
              },
              null,
              2,
            ),
          );
          return;
        }

        const rich = isRich();
        defaultRuntime.log(colorize(rich, theme.heading, "网关发现"));
        defaultRuntime.log(
          colorize(rich, theme.muted, `找到 ${deduped.length} 个网关 · 域: ${domains.join(", ")}`),
        );
        if (deduped.length === 0) {
          return;
        }

        for (const beacon of deduped) {
          for (const line of renderBeaconLines(beacon, rich)) {
            defaultRuntime.log(line);
          }
        }
      }, "网关发现失败");
    });
}
