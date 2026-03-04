import type { Command } from "commander";
import {
  githubCopilotLoginCommand,
  modelsAliasesAddCommand,
  modelsAliasesListCommand,
  modelsAliasesRemoveCommand,
  modelsAuthAddCommand,
  modelsAuthLoginCommand,
  modelsAuthOrderClearCommand,
  modelsAuthOrderGetCommand,
  modelsAuthOrderSetCommand,
  modelsAuthPasteTokenCommand,
  modelsAuthSetupTokenCommand,
  modelsFallbacksAddCommand,
  modelsFallbacksClearCommand,
  modelsFallbacksListCommand,
  modelsFallbacksRemoveCommand,
  modelsImageFallbacksAddCommand,
  modelsImageFallbacksClearCommand,
  modelsImageFallbacksListCommand,
  modelsImageFallbacksRemoveCommand,
  modelsListCommand,
  modelsScanCommand,
  modelsSetCommand,
  modelsSetImageCommand,
  modelsStatusCommand,
} from "../commands/models.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { resolveOptionFromCommand, runCommandWithRuntime } from "./cli-utils.js";

function runModelsCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}

export function registerModelsCli(program: Command) {
  const models = program
    .command("models")
    .description("模型发现、扫描和配置")
    .option("--status-json", "输出 JSON (`models status --json` 的别名)", false)
    .option("--status-plain", "纯文本输出 (`models status --plain` 的别名)", false)
    .option("--agent <id>", "要检查的智能体 ID (覆盖 NSEMCLAW_AGENT_DIR/PI_CODING_AGENT_DIR)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/models", "docs.openclaw.ai/cli/models")}\n`,
    );

  models
    .command("list")
    .description("列出模型 (默认显示已配置的)")
    .option("--all", "显示完整模型目录", false)
    .option("--local", "仅显示本地模型", false)
    .option("--provider <name>", "按提供商筛选")
    .option("--json", "输出 JSON", false)
    .option("--plain", "纯文本行输出", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsListCommand(opts, defaultRuntime);
      });
    });

  models
    .command("status")
    .description("显示已配置的模型状态")
    .option("--json", "Output JSON", false)
    .option("--plain", "Plain output", false)
    .option("--check", "如果认证即将过期/已过期则以非零退出 (1=已过期/缺失, 2=即将过期)", false)
    .option("--probe", "探测已配置的提供商认证 (实时)", false)
    .option("--probe-provider <name>", "仅探测单个提供商")
    .option(
      "--probe-profile <id>",
      "仅探测特定认证档案 ID (可重复或逗号分隔)",
      (value, previous) => {
        const next = Array.isArray(previous) ? previous : previous ? [previous] : [];
        next.push(value);
        return next;
      },
    )
    .option("--probe-timeout <ms>", "每次探测超时时间 (毫秒)")
    .option("--probe-concurrency <n>", "并发探测数")
    .option("--probe-max-tokens <n>", "探测最大令牌数 (尽力而为)")
    .option(
      "--agent <id>",
      "Agent id to inspect (overrides NSEMCLAW_AGENT_DIR/PI_CODING_AGENT_DIR)",
    )
    .action(async (opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsStatusCommand(
          {
            json: Boolean(opts.json),
            plain: Boolean(opts.plain),
            check: Boolean(opts.check),
            probe: Boolean(opts.probe),
            probeProvider: opts.probeProvider as string | undefined,
            probeProfile: opts.probeProfile as string | string[] | undefined,
            probeTimeout: opts.probeTimeout as string | undefined,
            probeConcurrency: opts.probeConcurrency as string | undefined,
            probeMaxTokens: opts.probeMaxTokens as string | undefined,
            agent,
          },
          defaultRuntime,
        );
      });
    });

  models
    .command("set")
    .description("设置默认模型")
    .argument("<model>", "模型 ID 或别名")
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsSetCommand(model, defaultRuntime);
      });
    });

  models
    .command("set-image")
    .description("设置图像模型")
    .argument("<model>", "Model id or alias")
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsSetImageCommand(model, defaultRuntime);
      });
    });

  const aliases = models.command("aliases").description("管理模型别名");

  aliases
    .command("list")
    .description("列出模型别名")
    .option("--json", "Output JSON", false)
    .option("--plain", "Plain output", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAliasesListCommand(opts, defaultRuntime);
      });
    });

  aliases
    .command("add")
    .description("添加或更新模型别名")
    .argument("<alias>", "别名")
    .argument("<model>", "Model id or alias")
    .action(async (alias: string, model: string) => {
      await runModelsCommand(async () => {
        await modelsAliasesAddCommand(alias, model, defaultRuntime);
      });
    });

  aliases
    .command("remove")
    .description("删除模型别名")
    .argument("<alias>", "Alias name")
    .action(async (alias: string) => {
      await runModelsCommand(async () => {
        await modelsAliasesRemoveCommand(alias, defaultRuntime);
      });
    });

  const fallbacks = models.command("fallbacks").description("管理模型回退列表");

  fallbacks
    .command("list")
    .description("列出回退模型")
    .option("--json", "Output JSON", false)
    .option("--plain", "Plain output", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsFallbacksListCommand(opts, defaultRuntime);
      });
    });

  fallbacks
    .command("add")
    .description("添加回退模型")
    .argument("<model>", "Model id or alias")
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsFallbacksAddCommand(model, defaultRuntime);
      });
    });

  fallbacks
    .command("remove")
    .description("删除回退模型")
    .argument("<model>", "Model id or alias")
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsFallbacksRemoveCommand(model, defaultRuntime);
      });
    });

  fallbacks
    .command("clear")
    .description("清除所有回退模型")
    .action(async () => {
      await runModelsCommand(async () => {
        await modelsFallbacksClearCommand(defaultRuntime);
      });
    });

  const imageFallbacks = models.command("image-fallbacks").description("管理图像模型回退列表");

  imageFallbacks
    .command("list")
    .description("列出图像回退模型")
    .option("--json", "Output JSON", false)
    .option("--plain", "Plain output", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksListCommand(opts, defaultRuntime);
      });
    });

  imageFallbacks
    .command("add")
    .description("添加图像回退模型")
    .argument("<model>", "Model id or alias")
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksAddCommand(model, defaultRuntime);
      });
    });

  imageFallbacks
    .command("remove")
    .description("删除图像回退模型")
    .argument("<model>", "Model id or alias")
    .action(async (model: string) => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksRemoveCommand(model, defaultRuntime);
      });
    });

  imageFallbacks
    .command("clear")
    .description("清除所有图像回退模型")
    .action(async () => {
      await runModelsCommand(async () => {
        await modelsImageFallbacksClearCommand(defaultRuntime);
      });
    });

  models
    .command("scan")
    .description("扫描 OpenRouter 免费模型以获取工具和图像")
    .option("--min-params <b>", "最小参数规模 (十亿)")
    .option("--max-age-days <days>", "跳过超过 N 天的旧模型")
    .option("--provider <name>", "按提供商前缀筛选")
    .option("--max-candidates <n>", "最大回退候选数", "6")
    .option("--timeout <ms>", "每次探测超时时间 (毫秒)")
    .option("--concurrency <n>", "探测并发数")
    .option("--no-probe", "跳过实时探测; 仅列出免费候选")
    .option("--yes", "无需提示接受默认值", false)
    .option("--no-input", "禁用提示 (使用默认值)")
    .option("--set-default", "将 agents.defaults.model 设置为第一个选择", false)
    .option("--set-image", "将 agents.defaults.imageModel 设置为第一个图像选择", false)
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsScanCommand(opts, defaultRuntime);
      });
    });

  models.action(async (opts) => {
    await runModelsCommand(async () => {
      await modelsStatusCommand(
        {
          json: Boolean(opts?.statusJson),
          plain: Boolean(opts?.statusPlain),
          agent: opts?.agent as string | undefined,
        },
        defaultRuntime,
      );
    });
  });

  const auth = models.command("auth").description("管理模型认证档案");
  auth.option("--agent <id>", "用于认证顺序 get/set/clear 的智能体 ID");
  auth.action(() => {
    auth.help();
  });

  auth
    .command("add")
    .description("交互式认证助手 (setup-token 或 paste token)")
    .action(async () => {
      await runModelsCommand(async () => {
        await modelsAuthAddCommand({}, defaultRuntime);
      });
    });

  auth
    .command("login")
    .description("运行提供商插件认证流程 (OAuth/API 密钥)")
    .option("--provider <id>", "插件注册的提供商 ID")
    .option("--method <id>", "提供商认证方法 ID")
    .option("--set-default", "应用提供商的默认模型推荐", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAuthLoginCommand(
          {
            provider: opts.provider as string | undefined,
            method: opts.method as string | undefined,
            setDefault: Boolean(opts.setDefault),
          },
          defaultRuntime,
        );
      });
    });

  auth
    .command("setup-token")
    .description("运行提供商 CLI 创建/同步令牌 (需要 TTY)")
    .option("--provider <name>", "提供商 ID (默认: anthropic)")
    .option("--yes", "跳过确认", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAuthSetupTokenCommand(
          {
            provider: opts.provider as string | undefined,
            yes: Boolean(opts.yes),
          },
          defaultRuntime,
        );
      });
    });

  auth
    .command("paste-token")
    .description("将令牌粘贴到 auth-profiles.json 并更新配置")
    .requiredOption("--provider <name>", "提供商 ID (例如 anthropic)")
    .option("--profile-id <id>", "认证档案 ID (默认: <provider>:manual)")
    .option("--expires-in <duration>", "可选过期时长 (例如 365d, 12h)。存储为绝对 expiresAt。")
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await modelsAuthPasteTokenCommand(
          {
            provider: opts.provider as string | undefined,
            profileId: opts.profileId as string | undefined,
            expiresIn: opts.expiresIn as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  auth
    .command("login-github-copilot")
    .description("通过 GitHub 设备流登录 GitHub Copilot (需要 TTY)")
    .option("--profile-id <id>", "认证档案 ID (默认: github-copilot:github)")
    .option("--yes", "无需提示覆盖现有档案", false)
    .action(async (opts) => {
      await runModelsCommand(async () => {
        await githubCopilotLoginCommand(
          {
            profileId: opts.profileId as string | undefined,
            yes: Boolean(opts.yes),
          },
          defaultRuntime,
        );
      });
    });

  const order = auth.command("order").description("管理每个智能体的认证档案顺序覆盖");

  order
    .command("get")
    .description("显示每个智能体的认证顺序覆盖 (来自 auth-profiles.json)")
    .requiredOption("--provider <name>", "提供商 ID (例如 anthropic)")
    .option("--agent <id>", "智能体 ID (默认: 配置的默认智能体)")
    .option("--json", "Output JSON", false)
    .action(async (opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsAuthOrderGetCommand(
          {
            provider: opts.provider as string,
            agent,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  order
    .command("set")
    .description("设置每个智能体的认证顺序覆盖 (锁定轮询到此列表)")
    .requiredOption("--provider <name>", "Provider id (e.g. anthropic)")
    .option("--agent <id>", "Agent id (default: configured default agent)")
    .argument("<profileIds...>", "认证档案 ID (例如 anthropic:default)")
    .action(async (profileIds: string[], opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsAuthOrderSetCommand(
          {
            provider: opts.provider as string,
            agent,
            order: profileIds,
          },
          defaultRuntime,
        );
      });
    });

  order
    .command("clear")
    .description("清除每个智能体的认证顺序覆盖 (回退到配置/轮询)")
    .requiredOption("--provider <name>", "Provider id (e.g. anthropic)")
    .option("--agent <id>", "Agent id (default: configured default agent)")
    .action(async (opts, command) => {
      const agent =
        resolveOptionFromCommand<string>(command, "agent") ?? (opts.agent as string | undefined);
      await runModelsCommand(async () => {
        await modelsAuthOrderClearCommand(
          {
            provider: opts.provider as string,
            agent,
          },
          defaultRuntime,
        );
      });
    });
}
