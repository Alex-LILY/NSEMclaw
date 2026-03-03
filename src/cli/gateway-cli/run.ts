import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import type { GatewayAuthMode, GatewayTailscaleMode } from "../../config/config.js";
import {
  CONFIG_PATH,
  loadConfig,
  readConfigFileSnapshot,
  resolveStateDir,
  resolveGatewayPort,
} from "../../config/config.js";
import { resolveGatewayAuth } from "../../gateway/auth.js";
import { startGatewayServer } from "../../gateway/server.js";
import type { GatewayWsLogStyle } from "../../gateway/ws-logging.js";
import { setGatewayWsLogStyle } from "../../gateway/ws-logging.js";
import { setVerbose } from "../../globals.js";
import { GatewayLockError } from "../../infra/gateway-lock.js";
import { formatPortDiagnostics, inspectPortUsage } from "../../infra/ports.js";
import { setConsoleSubsystemFilter, setConsoleTimestampPrefix } from "../../logging/console.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { defaultRuntime } from "../../runtime.js";
import { formatCliCommand } from "../command-format.js";
import { inheritOptionFromParent } from "../command-options.js";
import { forceFreePortAndWait } from "../ports.js";
import { ensureDevGatewayConfig } from "./dev.js";
import { runGatewayLoop } from "./run-loop.js";
import {
  describeUnknownError,
  extractGatewayMiskeys,
  maybeExplainGatewayServiceStop,
  parsePort,
  toOptionString,
} from "./shared.js";

type GatewayRunOpts = {
  port?: unknown;
  bind?: unknown;
  token?: unknown;
  auth?: unknown;
  password?: unknown;
  tailscale?: unknown;
  tailscaleResetOnExit?: boolean;
  allowUnconfigured?: boolean;
  force?: boolean;
  verbose?: boolean;
  claudeCliLogs?: boolean;
  wsLog?: unknown;
  compact?: boolean;
  rawStream?: boolean;
  rawStreamPath?: unknown;
  dev?: boolean;
  reset?: boolean;
};

const gatewayLog = createSubsystemLogger("gateway");

const GATEWAY_RUN_VALUE_KEYS = [
  "port",
  "bind",
  "token",
  "auth",
  "password",
  "tailscale",
  "wsLog",
  "rawStreamPath",
] as const;

const GATEWAY_RUN_BOOLEAN_KEYS = [
  "tailscaleResetOnExit",
  "allowUnconfigured",
  "dev",
  "reset",
  "force",
  "verbose",
  "claudeCliLogs",
  "compact",
  "rawStream",
] as const;

const GATEWAY_AUTH_MODES: readonly GatewayAuthMode[] = [
  "none",
  "token",
  "password",
  "trusted-proxy",
];
const GATEWAY_TAILSCALE_MODES: readonly GatewayTailscaleMode[] = ["off", "serve", "funnel"];

function parseEnumOption<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | null {
  if (!raw) {
    return null;
  }
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function formatModeChoices<T extends string>(modes: readonly T[]): string {
  return modes.map((mode) => `"${mode}"`).join("|");
}

function formatModeErrorList<T extends string>(modes: readonly T[]): string {
  const quoted = modes.map((mode) => `"${mode}"`);
  if (quoted.length === 0) {
    return "";
  }
  if (quoted.length === 1) {
    return quoted[0];
  }
  if (quoted.length === 2) {
    return `${quoted[0]} or ${quoted[1]}`;
  }
  return `${quoted.slice(0, -1).join(", ")}, or ${quoted[quoted.length - 1]}`;
}

function resolveGatewayRunOptions(opts: GatewayRunOpts, command?: Command): GatewayRunOpts {
  const resolved: GatewayRunOpts = { ...opts };

  for (const key of GATEWAY_RUN_VALUE_KEYS) {
    const inherited = inheritOptionFromParent(command, key);
    if (key === "wsLog") {
      // wsLog has a child default ("auto"), so prefer inherited parent CLI value when present.
      resolved[key] = inherited ?? resolved[key];
      continue;
    }
    resolved[key] = resolved[key] ?? inherited;
  }

  for (const key of GATEWAY_RUN_BOOLEAN_KEYS) {
    const inherited = inheritOptionFromParent<boolean>(command, key);
    resolved[key] = Boolean(resolved[key] || inherited);
  }

  return resolved;
}

async function runGatewayCommand(opts: GatewayRunOpts) {
  const isDevProfile = process.env.NSEMCLAW_PROFILE?.trim().toLowerCase() === "dev";
  const devMode = Boolean(opts.dev) || isDevProfile;
  if (opts.reset && !devMode) {
    defaultRuntime.error("请与 --dev 一起使用 --reset。");
    defaultRuntime.exit(1);
    return;
  }

  setConsoleTimestampPrefix(true);
  setVerbose(Boolean(opts.verbose));
  if (opts.claudeCliLogs) {
    setConsoleSubsystemFilter(["agent/claude-cli"]);
    process.env.NSEMCLAW_CLAUDE_CLI_LOG_OUTPUT = "1";
  }
  const wsLogRaw = (opts.compact ? "compact" : opts.wsLog) as string | undefined;
  const wsLogStyle: GatewayWsLogStyle =
    wsLogRaw === "compact" ? "compact" : wsLogRaw === "full" ? "full" : "auto";
  if (
    wsLogRaw !== undefined &&
    wsLogRaw !== "auto" &&
    wsLogRaw !== "compact" &&
    wsLogRaw !== "full"
  ) {
    defaultRuntime.error('Invalid --ws-log (use "auto", "full", "compact")');
    defaultRuntime.exit(1);
  }
  setGatewayWsLogStyle(wsLogStyle);

  if (opts.rawStream) {
    process.env.NSEMCLAW_RAW_STREAM = "1";
  }
  const rawStreamPath = toOptionString(opts.rawStreamPath);
  if (rawStreamPath) {
    process.env.NSEMCLAW_RAW_STREAM_PATH = rawStreamPath;
  }

  if (devMode) {
    await ensureDevGatewayConfig({ reset: Boolean(opts.reset) });
  }

  const cfg = loadConfig();
  const portOverride = parsePort(opts.port);
  if (opts.port !== undefined && portOverride === null) {
    defaultRuntime.error("无效的端口");
    defaultRuntime.exit(1);
  }
  const port = portOverride ?? resolveGatewayPort(cfg);
  if (!Number.isFinite(port) || port <= 0) {
    defaultRuntime.error("无效的端口");
    defaultRuntime.exit(1);
  }
  if (opts.force) {
    try {
      const { killed, waitedMs, escalatedToSigkill } = await forceFreePortAndWait(port, {
        timeoutMs: 2000,
        intervalMs: 100,
        sigtermTimeoutMs: 700,
      });
      if (killed.length === 0) {
        gatewayLog.info(`force: 端口 ${port} 无监听`);
      } else {
        for (const proc of killed) {
          gatewayLog.info(
            `force: 已终止端口 ${port} 上的进程 ${proc.pid}${proc.command ? ` (${proc.command})` : ""}`,
          );
        }
        if (escalatedToSigkill) {
          gatewayLog.info(`force: 释放端口 ${port} 时已升级到 SIGKILL`);
        }
        if (waitedMs > 0) {
          gatewayLog.info(`force: 等待 ${waitedMs}ms 以释放端口 ${port}`);
        }
      }
    } catch (err) {
      defaultRuntime.error(`强制: ${String(err)}`);
      defaultRuntime.exit(1);
      return;
    }
  }
  if (opts.token) {
    const token = toOptionString(opts.token);
    if (token) {
      process.env.NSEMCLAW_GATEWAY_TOKEN = token;
    }
  }
  const authModeRaw = toOptionString(opts.auth);
  const authMode = parseEnumOption(authModeRaw, GATEWAY_AUTH_MODES);
  if (authModeRaw && !authMode) {
    defaultRuntime.error(`无效的 --auth (使用 ${formatModeErrorList(GATEWAY_AUTH_MODES)})`);
    defaultRuntime.exit(1);
    return;
  }
  const tailscaleRaw = toOptionString(opts.tailscale);
  const tailscaleMode = parseEnumOption(tailscaleRaw, GATEWAY_TAILSCALE_MODES);
  if (tailscaleRaw && !tailscaleMode) {
    defaultRuntime.error(
      `无效的 --tailscale (使用 ${formatModeErrorList(GATEWAY_TAILSCALE_MODES)})`,
    );
    defaultRuntime.exit(1);
    return;
  }
  const passwordRaw = toOptionString(opts.password);
  const tokenRaw = toOptionString(opts.token);

  const snapshot = await readConfigFileSnapshot().catch(() => null);
  const configExists = snapshot?.exists ?? fs.existsSync(CONFIG_PATH);
  const configAuditPath = path.join(resolveStateDir(process.env), "logs", "config-audit.jsonl");
  const mode = cfg.gateway?.mode;
  if (!opts.allowUnconfigured && mode !== "local") {
    if (!configExists) {
      defaultRuntime.error(
        `缺少配置。运行 \`${formatCliCommand("nsemclaw setup")}\` 或设置 gateway.mode=local (或传入 --allow-unconfigured)。`,
      );
    } else {
      defaultRuntime.error(
        `网关启动被阻止: 设置 gateway.mode=local (当前: ${mode ?? "未设置"}) 或传入 --allow-unconfigured。`,
      );
      defaultRuntime.error(`配置写入审计: ${configAuditPath}`);
    }
    defaultRuntime.exit(1);
    return;
  }
  const bindRaw = toOptionString(opts.bind) ?? cfg.gateway?.bind ?? "loopback";
  const bind =
    bindRaw === "loopback" ||
    bindRaw === "lan" ||
    bindRaw === "auto" ||
    bindRaw === "custom" ||
    bindRaw === "tailnet"
      ? bindRaw
      : null;
  if (!bind) {
    defaultRuntime.error('无效的 --bind (使用 "loopback", "lan", "tailnet", "auto", 或 "custom")');
    defaultRuntime.exit(1);
    return;
  }

  const miskeys = extractGatewayMiskeys(snapshot?.parsed);
  const authOverride =
    authMode || passwordRaw || tokenRaw || authModeRaw
      ? {
          ...(authMode ? { mode: authMode } : {}),
          ...(tokenRaw ? { token: tokenRaw } : {}),
          ...(passwordRaw ? { password: passwordRaw } : {}),
        }
      : undefined;
  const resolvedAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    authOverride,
    env: process.env,
    tailscaleMode: tailscaleMode ?? cfg.gateway?.tailscale?.mode ?? "off",
  });
  const resolvedAuthMode = resolvedAuth.mode;
  const tokenValue = resolvedAuth.token;
  const passwordValue = resolvedAuth.password;
  const hasToken = typeof tokenValue === "string" && tokenValue.trim().length > 0;
  const hasPassword = typeof passwordValue === "string" && passwordValue.trim().length > 0;
  const hasSharedSecret =
    (resolvedAuthMode === "token" && hasToken) || (resolvedAuthMode === "password" && hasPassword);
  const canBootstrapToken = resolvedAuthMode === "token" && !hasToken;
  const authHints: string[] = [];
  if (miskeys.hasGatewayToken) {
    authHints.push('在配置中找到 "gateway.token"。请改用 "gateway.auth.token"。');
  }
  if (miskeys.hasRemoteToken) {
    authHints.push('"gateway.remote.token" 用于远程 CLI 调用; 它不会启用本地网关认证。');
  }
  if (resolvedAuthMode === "password" && !hasPassword) {
    defaultRuntime.error(
      [
        "网关认证设置为 password，但未配置密码。",
        "设置 gateway.auth.password (或 NSEMCLAW_GATEWAY_PASSWORD)，或传入 --password。",
        ...authHints,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    defaultRuntime.exit(1);
    return;
  }
  if (resolvedAuthMode === "none") {
    gatewayLog.warn("网关认证模式=none 已显式配置; 所有网关连接都未认证。");
  }
  if (
    bind !== "loopback" &&
    !hasSharedSecret &&
    !canBootstrapToken &&
    resolvedAuthMode !== "trusted-proxy"
  ) {
    defaultRuntime.error(
      [
        `拒绝在 ${bind} 上绑定网关而不进行认证。`,
        "设置 gateway.auth.token/password (或 NSEMCLAW_GATEWAY_TOKEN/NSEMCLAW_GATEWAY_PASSWORD) 或传入 --token/--password。",
        ...authHints,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    defaultRuntime.exit(1);
    return;
  }
  const tailscaleOverride =
    tailscaleMode || opts.tailscaleResetOnExit
      ? {
          ...(tailscaleMode ? { mode: tailscaleMode } : {}),
          ...(opts.tailscaleResetOnExit ? { resetOnExit: true } : {}),
        }
      : undefined;

  try {
    await runGatewayLoop({
      runtime: defaultRuntime,
      lockPort: port,
      start: async () =>
        await startGatewayServer(port, {
          bind,
          auth: authOverride,
          tailscale: tailscaleOverride,
        }),
    });
  } catch (err) {
    if (
      err instanceof GatewayLockError ||
      (err && typeof err === "object" && (err as { name?: string }).name === "GatewayLockError")
    ) {
      const errMessage = describeUnknownError(err);
      defaultRuntime.error(
        `网关启动失败: ${errMessage}\n如果网关受监管，请使用以下命令停止: ${formatCliCommand("nsemclaw gateway stop")}`,
      );
      try {
        const diagnostics = await inspectPortUsage(port);
        if (diagnostics.status === "busy") {
          for (const line of formatPortDiagnostics(diagnostics)) {
            defaultRuntime.error(line);
          }
        }
      } catch {
        // ignore diagnostics failures
      }
      await maybeExplainGatewayServiceStop();
      defaultRuntime.exit(1);
      return;
    }
    defaultRuntime.error(`网关启动失败: ${String(err)}`);
    defaultRuntime.exit(1);
  }
}

export function addGatewayRunCommand(cmd: Command): Command {
  return cmd
    .option("--port <port>", "网关 WebSocket 端口")
    .option(
      "--bind <mode>",
      '绑定模式 ("loopback"|"lan"|"tailnet"|"auto"|"custom")。默认为配置 gateway.bind (或 loopback)。',
    )
    .option(
      "--token <token>",
      "connect.params.auth.token 所需的共享令牌 (默认: 如设置则使用 NSEMCLAW_GATEWAY_TOKEN 环境变量)",
    )
    .option("--auth <mode>", `网关认证模式 (${formatModeChoices(GATEWAY_AUTH_MODES)})`)
    .option("--password <password>", "auth mode=password 的密码")
    .option(
      "--tailscale <mode>",
      `Tailscale 暴露模式 (${formatModeChoices(GATEWAY_TAILSCALE_MODES)})`,
    )
    .option("--tailscale-reset-on-exit", "关闭时重置 Tailscale serve/funnel 配置", false)
    .option("--allow-unconfigured", "允许在配置中没有 gateway.mode=local 的情况下启动网关", false)
    .option("--dev", "如果缺少则创建开发配置 + 工作区 (无 BOOTSTRAP.md)", false)
    .option("--reset", "重置开发配置 + 凭据 + 会话 + 工作区 (需要 --dev)", false)
    .option("--force", "启动前终止目标端口上的任何现有监听", false)
    .option("--verbose", "向 stdout/stderr 输出详细日志", false)
    .option("--claude-cli-logs", "仅在控制台中显示 claude-cli 日志 (包括 stdout/stderr)", false)
    .option("--ws-log <style>", 'WebSocket 日志样式 ("auto"|"full"|"compact")', "auto")
    .option("--compact", '"--ws-log compact" 的别名', false)
    .option("--raw-stream", "将原始模型流事件记录到 jsonl", false)
    .option("--raw-stream-path <path>", "原始流 jsonl 路径")
    .action(async (opts, command) => {
      await runGatewayCommand(resolveGatewayRunOptions(opts, command));
    });
}
