import type { Command } from "commander";
import { inheritOptionFromParent } from "../command-options.js";
import {
  runDaemonInstall,
  runDaemonRestart,
  runDaemonStart,
  runDaemonStatus,
  runDaemonStop,
  runDaemonUninstall,
} from "./runners.js";
import type { DaemonInstallOptions, GatewayRpcOpts } from "./types.js";

function resolveInstallOptions(
  cmdOpts: DaemonInstallOptions,
  command?: Command,
): DaemonInstallOptions {
  const parentForce = inheritOptionFromParent<boolean>(command, "force");
  const parentPort = inheritOptionFromParent<string>(command, "port");
  const parentToken = inheritOptionFromParent<string>(command, "token");
  return {
    ...cmdOpts,
    force: Boolean(cmdOpts.force || parentForce),
    port: cmdOpts.port ?? parentPort,
    token: cmdOpts.token ?? parentToken,
  };
}

function resolveRpcOptions(cmdOpts: GatewayRpcOpts, command?: Command): GatewayRpcOpts {
  const parentToken = inheritOptionFromParent<string>(command, "token");
  const parentPassword = inheritOptionFromParent<string>(command, "password");
  return {
    ...cmdOpts,
    token: cmdOpts.token ?? parentToken,
    password: cmdOpts.password ?? parentPassword,
  };
}

export function addGatewayServiceCommands(parent: Command, opts?: { statusDescription?: string }) {
  parent
    .command("status")
    .description(opts?.statusDescription ?? "显示网关服务状态 + 探测网关")
    .option("--url <url>", "网关 WebSocket URL (默认为 config/remote/local)")
    .option("--token <token>", "网关令牌 (如需要)")
    .option("--password <password>", "网关密码 (密码认证)")
    .option("--timeout <ms>", "超时时间 (毫秒)", "10000")
    .option("--no-probe", "跳过 RPC 探测")
    .option("--deep", "扫描系统级服务", false)
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts, command) => {
      await runDaemonStatus({
        rpc: resolveRpcOptions(cmdOpts, command),
        probe: Boolean(cmdOpts.probe),
        deep: Boolean(cmdOpts.deep),
        json: Boolean(cmdOpts.json),
      });
    });

  parent
    .command("install")
    .description("安装网关服务 (launchd/systemd/schtasks)")
    .option("--port <port>", "网关端口")
    .option("--runtime <runtime>", "守护进程运行时 (node|bun)。默认: node")
    .option("--token <token>", "Gateway token (token auth)")
    .option("--force", "如果已安装则重新安装/覆盖", false)
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts, command) => {
      await runDaemonInstall(resolveInstallOptions(cmdOpts, command));
    });

  parent
    .command("uninstall")
    .description("卸载网关服务 (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts) => {
      await runDaemonUninstall(cmdOpts);
    });

  parent
    .command("start")
    .description("启动网关服务 (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts) => {
      await runDaemonStart(cmdOpts);
    });

  parent
    .command("stop")
    .description("停止网关服务 (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts) => {
      await runDaemonStop(cmdOpts);
    });

  parent
    .command("restart")
    .description("重启网关服务 (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts) => {
      await runDaemonRestart(cmdOpts);
    });
}
