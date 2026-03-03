import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { isRich, theme } from "../../terminal/theme.js";
import { escapeRegExp } from "../../utils.js";
import { hasFlag, hasRootVersionAlias } from "../argv.js";
import { formatCliBannerLine, hasEmittedCliBanner } from "../banner.js";
import { replaceCliName, resolveCliName } from "../cli-name.js";
import { CLI_ZH_CN } from "../i18n-cli.js";
import { CLI_LOG_LEVEL_VALUES, parseCliLogLevelOption } from "../log-level-option.js";
import { getCoreCliCommandsWithSubcommands } from "./command-registry.js";
import type { ProgramContext } from "./context.js";
import { getSubCliCommandsWithSubcommands } from "./register.subclis.js";

const CLI_NAME = resolveCliName();
const CLI_NAME_PATTERN = escapeRegExp(CLI_NAME);
const ROOT_COMMANDS_WITH_SUBCOMMANDS = new Set([
  ...getCoreCliCommandsWithSubcommands(),
  ...getSubCliCommandsWithSubcommands(),
]);
const ROOT_COMMANDS_HINT = CLI_ZH_CN.helpFooter.hint;

const EXAMPLES = [
  ["nsemclaw models --help", CLI_ZH_CN.examples.modelsHelp],
  ["nsemclaw channels login --verbose", CLI_ZH_CN.examples.channelsLogin],
  [
    'nsemclaw message send --target +15555550123 --message "Hi" --json',
    CLI_ZH_CN.examples.messageSend,
  ],
  ["nsemclaw gateway --port 18789", CLI_ZH_CN.examples.gatewayRun],
  ["nsemclaw --dev gateway", CLI_ZH_CN.examples.gatewayDev],
  ["nsemclaw gateway --force", "强制终止占用默认网关端口的进程，然后启动。"],
  ["nsemclaw gateway ...", "通过 WebSocket 控制网关。"],
  [
    'nsemclaw agent --to +15555550123 --message "Run summary" --deliver',
    CLI_ZH_CN.examples.agentTalk,
  ],
  [
    'nsemclaw message send --channel telegram --target @mychat --message "Hi"',
    "通过 Telegram 机器人发送消息。",
  ],
] as const;

export function configureProgramHelp(program: Command, ctx: ProgramContext) {
  program
    .name(CLI_NAME)
    .description("")
    .version(ctx.programVersion)
    .option("--dev", CLI_ZH_CN.options.dev)
    .option("--profile <name>", CLI_ZH_CN.options.profile)
    .option(
      "--log-level <level>",
      `${CLI_ZH_CN.options.logLevel} (${CLI_LOG_LEVEL_VALUES})`,
      parseCliLogLevelOption,
    );

  program.option("--no-color", CLI_ZH_CN.options.noColor, false);
  program.helpOption("-h, --help", CLI_ZH_CN.options.help);
  program.helpCommand("help [command]", CLI_ZH_CN.options.help);

  program.configureHelp({
    // sort options and subcommands alphabetically
    sortSubcommands: true,
    sortOptions: true,
    optionTerm: (option) => theme.option(option.flags),
    subcommandTerm: (cmd) => {
      const isRootCommand = cmd.parent === program;
      const hasSubcommands = isRootCommand && ROOT_COMMANDS_WITH_SUBCOMMANDS.has(cmd.name());
      return theme.command(hasSubcommands ? `${cmd.name()} *` : cmd.name());
    },
  });

  const formatHelpOutput = (str: string) => {
    let output = str;
    const isRootHelp = new RegExp(
      `^Usage:\\s+${CLI_NAME_PATTERN}\\s+\\[options\\]\\s+\\[command\\]\\s*$`,
      "m",
    ).test(output);
    if (isRootHelp && /^Commands:/m.test(output)) {
      output = output.replace(/^Commands:/m, `Commands:\n  ${theme.muted(ROOT_COMMANDS_HINT)}`);
    }

    return output
      .replace(/^Usage:/gm, theme.heading("用法:"))
      .replace(/^Options:/gm, theme.heading("选项:"))
      .replace(/^Commands:/gm, theme.heading("命令:"));
  };

  program.configureOutput({
    writeOut: (str) => {
      process.stdout.write(formatHelpOutput(str));
    },
    writeErr: (str) => {
      process.stderr.write(formatHelpOutput(str));
    },
    outputError: (str, write) => write(theme.error(str)),
  });

  if (
    hasFlag(process.argv, "-V") ||
    hasFlag(process.argv, "--version") ||
    hasRootVersionAlias(process.argv)
  ) {
    console.log(ctx.programVersion);
    process.exit(0);
  }

  program.addHelpText("beforeAll", () => {
    if (hasEmittedCliBanner()) {
      return "";
    }
    const rich = isRich();
    const line = formatCliBannerLine(ctx.programVersion, { richTty: rich });
    return `\n${line}\n`;
  });

  const fmtExamples = EXAMPLES.map(
    ([cmd, desc]) => `  ${theme.command(replaceCliName(cmd, CLI_NAME))}\n    ${theme.muted(desc)}`,
  ).join("\n");

  program.addHelpText("afterAll", ({ command }) => {
    if (command !== program) {
      return "";
    }
    const docs = formatDocsLink("/cli", "docs.nsemclaw.ai/cli");
    return `\n${theme.heading("示例:")}\n${fmtExamples}\n\n${theme.muted("文档:")} ${docs}\n`;
  });
}
