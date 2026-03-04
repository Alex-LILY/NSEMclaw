import type { Command } from "commander";
import {
  CONFIGURE_WIZARD_SECTIONS,
  configureCommandFromSectionsArg,
} from "../../commands/configure.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerConfigureCommand(program: Command) {
  program
    .command("configure")
    .description("交互式设置向导，用于配置凭据、频道、网关和智能体默认值")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/configure", "docs.openclaw.ai/cli/configure")}\n`,
    )
    .option(
      "--section <section>",
      `配置章节 (可重复)。选项: ${CONFIGURE_WIZARD_SECTIONS.join(", ")}`,
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await configureCommandFromSectionsArg(opts.section, defaultRuntime);
      });
    });
}
