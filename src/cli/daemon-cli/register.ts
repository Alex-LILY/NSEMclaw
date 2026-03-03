import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { addGatewayServiceCommands } from "./register-service-commands.js";

export function registerDaemonCli(program: Command) {
  const daemon = program
    .command("daemon")
    .description("管理网关服务 (launchd/systemd/schtasks)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.nsemclaw.ai/cli/gateway")}\n`,
    );

  addGatewayServiceCommands(daemon, {
    statusDescription: "显示服务安装状态 + 探测网关",
  });
}
