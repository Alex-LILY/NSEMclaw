import type { Command } from "commander";
import { getPrimaryCommand, hasHelpOrVersion } from "../argv.js";
import { reparseProgramFromActionArgs } from "./action-reparse.js";
import { removeCommandByName } from "./command-tree.js";
import type { ProgramContext } from "./context.js";
import { registerSubCliCommands } from "./register.subclis.js";

type CommandRegisterParams = {
  program: Command;
  ctx: ProgramContext;
  argv: string[];
};

export type CommandRegistration = {
  id: string;
  register: (params: CommandRegisterParams) => void;
};

type CoreCliCommandDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
};

type CoreCliEntry = {
  commands: CoreCliCommandDescriptor[];
  register: (params: CommandRegisterParams) => Promise<void> | void;
};

const shouldRegisterCorePrimaryOnly = (argv: string[]) => {
  if (hasHelpOrVersion(argv)) {
    return false;
  }
  return true;
};

// Note for humans and agents:
// If you update the list of commands, also check whether they have subcommands
// and set the flag accordingly.
const coreEntries: CoreCliEntry[] = [
  {
    commands: [
      {
        name: "setup",
        description: "初始化本地配置和智能体工作区",
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.setup.js");
      mod.registerSetupCommand(program);
    },
  },
  {
    commands: [
      {
        name: "onboard",
        description: "网关、工作区和技能的交互式引导向导",
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.onboard.js");
      mod.registerOnboardCommand(program);
    },
  },
  {
    commands: [
      {
        name: "configure",
        description: "凭证、频道、网关和智能体默认值的交互式设置向导",
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.configure.js");
      mod.registerConfigureCommand(program);
    },
  },
  {
    commands: [
      {
        name: "config",
        description: "非交互式配置助手（获取/设置/取消设置）。默认：启动设置向导。",
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("../config-cli.js");
      mod.registerConfigCli(program);
    },
  },
  {
    commands: [
      {
        name: "doctor",
        description: "网关和频道的健康检查 + 快速修复",
        hasSubcommands: false,
      },
      {
        name: "dashboard",
        description: "使用当前令牌打开控制界面",
        hasSubcommands: false,
      },
      {
        name: "reset",
        description: "重置本地配置/状态（保留 CLI 安装）",
        hasSubcommands: false,
      },
      {
        name: "uninstall",
        description: "卸载网关服务 + 本地数据（保留 CLI）",
        hasSubcommands: false,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.maintenance.js");
      mod.registerMaintenanceCommands(program);
    },
  },
  {
    commands: [
      {
        name: "message",
        description: "发送、读取和管理消息",
        hasSubcommands: true,
      },
    ],
    register: async ({ program, ctx }) => {
      const mod = await import("./register.message.js");
      mod.registerMessageCommands(program, ctx);
    },
  },
  {
    commands: [
      {
        name: "memory",
        description: "搜索和重新索引记忆文件",
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("../memory-cli.js");
      mod.registerMemoryCli(program);
    },
  },
  {
    commands: [
      {
        name: "agent",
        description: "通过网关运行单次智能体",
        hasSubcommands: false,
      },
      {
        name: "agents",
        description: "管理隔离智能体（工作区、认证、路由）",
        hasSubcommands: true,
      },
    ],
    register: async ({ program, ctx }) => {
      const mod = await import("./register.agent.js");
      mod.registerAgentCommands(program, {
        agentChannelOptions: ctx.agentChannelOptions,
      });
    },
  },
  {
    commands: [
      {
        name: "status",
        description: "显示频道健康状态和最近会话接收者",
        hasSubcommands: false,
      },
      {
        name: "health",
        description: "从运行中的网关获取健康状态",
        hasSubcommands: false,
      },
      {
        name: "sessions",
        description: "列出存储的对话会话",
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("./register.status-health-sessions.js");
      mod.registerStatusHealthSessionsCommands(program);
    },
  },
  {
    commands: [
      {
        name: "browser",
        description: "管理 Nsemclaw 的专用浏览器（Chrome/Chromium）",
        hasSubcommands: true,
      },
    ],
    register: async ({ program }) => {
      const mod = await import("../browser-cli.js");
      mod.registerBrowserCli(program);
    },
  },
];

function collectCoreCliCommandNames(predicate?: (command: CoreCliCommandDescriptor) => boolean) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of coreEntries) {
    for (const command of entry.commands) {
      if (predicate && !predicate(command)) {
        continue;
      }
      if (seen.has(command.name)) {
        continue;
      }
      seen.add(command.name);
      names.push(command.name);
    }
  }
  return names;
}

export function getCoreCliCommandNames(): string[] {
  return collectCoreCliCommandNames();
}

export function getCoreCliCommandsWithSubcommands(): string[] {
  return collectCoreCliCommandNames((command) => command.hasSubcommands);
}

function removeEntryCommands(program: Command, entry: CoreCliEntry) {
  // Some registrars install multiple top-level commands (e.g. status/health/sessions).
  // Remove placeholders/old registrations for all names in the entry before re-registering.
  for (const cmd of entry.commands) {
    removeCommandByName(program, cmd.name);
  }
}

function registerLazyCoreCommand(
  program: Command,
  ctx: ProgramContext,
  entry: CoreCliEntry,
  command: CoreCliCommandDescriptor,
) {
  const placeholder = program.command(command.name).description(command.description);
  placeholder.allowUnknownOption(true);
  placeholder.allowExcessArguments(true);
  placeholder.action(async (...actionArgs) => {
    removeEntryCommands(program, entry);
    await entry.register({ program, ctx, argv: process.argv });
    await reparseProgramFromActionArgs(program, actionArgs);
  });
}

export async function registerCoreCliByName(
  program: Command,
  ctx: ProgramContext,
  name: string,
  argv: string[] = process.argv,
): Promise<boolean> {
  const entry = coreEntries.find((candidate) =>
    candidate.commands.some((cmd) => cmd.name === name),
  );
  if (!entry) {
    return false;
  }

  removeEntryCommands(program, entry);
  await entry.register({ program, ctx, argv });
  return true;
}

export function registerCoreCliCommands(program: Command, ctx: ProgramContext, argv: string[]) {
  const primary = getPrimaryCommand(argv);
  if (primary && shouldRegisterCorePrimaryOnly(argv)) {
    const entry = coreEntries.find((candidate) =>
      candidate.commands.some((cmd) => cmd.name === primary),
    );
    if (entry) {
      const cmd = entry.commands.find((c) => c.name === primary);
      if (cmd) {
        registerLazyCoreCommand(program, ctx, entry, cmd);
      }
      return;
    }
  }

  for (const entry of coreEntries) {
    for (const cmd of entry.commands) {
      registerLazyCoreCommand(program, ctx, entry, cmd);
    }
  }
}

export function registerProgramCommands(
  program: Command,
  ctx: ProgramContext,
  argv: string[] = process.argv,
) {
  registerCoreCliCommands(program, ctx, argv);
  registerSubCliCommands(program, argv);
}
