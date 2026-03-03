// 命令帮助信息国际化
// 为所有 CLI 命令提供中文帮助信息

export interface CommandHelp {
  description: string;
  usage: string;
  examples: string[];
  options: Record<string, string>;
}

const commandHelp: Record<string, CommandHelp> = {
  // 核心命令
  agent: {
    description: "与 AI 代理对话",
    usage: "nsemclaw agent [选项]",
    examples: [
      'nsemclaw agent --message "你好"',
      "nsemclaw agent --thinking high",
      "nsemclaw agent --agent ops",
    ],
    options: {
      "--message, -m": "要发送的消息",
      "--thinking": "思考级别 (low/medium/high)",
      "--agent, -a": "指定代理 ID",
      "--session, -s": "指定会话密钥",
      "--deliver": "消息投递方式",
    },
  },

  gateway: {
    description: "启动网关服务器",
    usage: "nsemclaw gateway [子命令] [选项]",
    examples: [
      "nsemclaw gateway run",
      "nsemclaw gateway run --port 18789",
      "nsemclaw gateway status",
    ],
    options: {
      run: "运行网关服务器",
      status: "查看网关状态",
      "--port, -p": "监听端口",
      "--verbose": "详细输出",
    },
  },

  agents: {
    description: "管理代理",
    usage: "nsemclaw agents [子命令] [选项]",
    examples: [
      "nsemclaw agents list",
      "nsemclaw agents add my-agent",
      "nsemclaw agents delete old-agent",
    ],
    options: {
      list: "列出所有代理",
      add: "添加新代理",
      delete: "删除代理",
      "--model": "指定默认模型",
    },
  },

  channels: {
    description: "管理通信频道",
    usage: "nsemclaw channels [子命令] [选项]",
    examples: [
      "nsemclaw channels status",
      "nsemclaw channels link telegram",
      "nsemclaw channels unlink whatsapp",
    ],
    options: {
      status: "查看频道状态",
      link: "链接频道",
      unlink: "断开频道链接",
      "--probe": "探测频道连接",
    },
  },

  配置: {
    description: "管理配置",
    usage: "nsemclaw config [子命令] [选项]",
    examples: ["nsemclaw config get", "nsemclaw config set key value", "nsemclaw config edit"],
    options: {
      get: "获取配置值",
      set: "设置配置值",
      edit: "编辑配置文件",
      "--global, -g": "使用全局配置",
    },
  },

  sessions: {
    description: "管理会话",
    usage: "nsemclaw sessions [子命令] [选项]",
    examples: [
      "nsemclaw sessions list",
      "nsemclaw sessions delete old-session",
      "nsemclaw sessions reset",
    ],
    options: {
      list: "列出所有会话",
      delete: "删除会话",
      reset: "重置当前会话",
      "--all": "操作所有会话",
    },
  },

  skills: {
    description: "管理技能",
    usage: "nsemclaw skills [子命令] [选项]",
    examples: [
      "nsemclaw skills list",
      "nsemclaw skills install skill-name",
      "nsemclaw skills enable skill-name",
    ],
    options: {
      list: "列出所有技能",
      install: "安装技能",
      enable: "启用技能",
      disable: "禁用技能",
    },
  },

  cron: {
    description: "管理定时任务",
    usage: "nsemclaw cron [子命令] [选项]",
    examples: [
      "nsemclaw cron list",
      'nsemclaw cron add --name "每日简报" --schedule "0 9 * * *"',
      "nsemclaw cron delete job-id",
    ],
    options: {
      list: "列出所有定时任务",
      add: "添加定时任务",
      delete: "删除定时任务",
      "--name": "任务名称",
      "--schedule": "Cron 表达式",
      "--agent": "执行代理",
    },
  },

  onboard: {
    description: "运行引导向导",
    usage: "nsemclaw onboard [选项]",
    examples: [
      "nsemclaw onboard",
      "nsemclaw onboard --install-daemon",
      "nsemclaw onboard --flow advanced",
    ],
    options: {
      "--install-daemon": "安装守护进程",
      "--flow": "引导流程 (quickstart/manual/advanced)",
      "--skip-ui": "跳过 UI 构建",
    },
  },

  dashboard: {
    description: "打开 Web 控制面板",
    usage: "nsemclaw dashboard [选项]",
    examples: [
      "nsemclaw dashboard",
      "nsemclaw dashboard --no-open",
      "nsemclaw dashboard --port 18789",
    ],
    options: {
      "--no-open": "不自动打开浏览器",
      "--port": "指定端口",
    },
  },

  doctor: {
    description: "诊断和修复问题",
    usage: "nsemclaw doctor [选项]",
    examples: [
      "nsemclaw doctor",
      "nsemclaw doctor --fix",
      "nsemclaw doctor --generate-gateway-token",
    ],
    options: {
      "--fix": "自动修复问题",
      "--generate-gateway-token": "生成网关令牌",
      "--deep": "深度检查",
    },
  },

  message: {
    description: "发送消息",
    usage: "nsemclaw message send [选项]",
    examples: [
      'nsemclaw message send --to "+1234567890" --message "你好"',
      'nsemclaw message send --channel telegram --to username --message "测试"',
    ],
    options: {
      "--to": "接收者",
      "--message, -m": "消息内容",
      "--channel": "指定频道",
    },
  },

  nodes: {
    description: "管理节点",
    usage: "nsemclaw nodes [子命令] [选项]",
    examples: [
      "nsemclaw nodes list",
      "nsemclaw nodes approve request-id",
      "nsemclaw nodes revoke device-id",
    ],
    options: {
      list: "列出所有节点",
      approve: "批准配对请求",
      revoke: "撤销设备授权",
    },
  },

  update: {
    description: "更新 Nsemclaw",
    usage: "nsemclaw update [选项]",
    examples: ["nsemclaw update", "nsemclaw update --channel beta", "nsemclaw update --force"],
    options: {
      "--channel": "更新通道 (stable/beta/dev)",
      "--force": "强制更新",
    },
  },
};

// 通用选项说明
const globalOptions: Record<string, string> = {
  "--help, -h": "显示帮助信息",
  "--version, -v": "显示版本号",
  "--verbose": "详细输出模式",
  "--quiet, -q": "静默模式",
  "--config": "指定配置文件路径",
};

// 获取命令帮助
export function getCommandHelp(command: string): CommandHelp | undefined {
  return commandHelp[command];
}

// 列出所有可用命令
export function listCommands(): string[] {
  return Object.keys(commandHelp);
}

// 获取全局选项
export function getGlobalOptions(): Record<string, string> {
  return globalOptions;
}

// 格式化帮助文本
export function formatHelp(command: string): string {
  const help = getCommandHelp(command);
  if (!help) {
    return `未找到命令: ${command}`;
  }

  const lines: string[] = [`\n${help.description}\n`, `用法:\n  ${help.usage}\n`, "选项:"];

  Object.entries(help.options).forEach(([opt, desc]) => {
    lines.push(`  ${opt.padEnd(20)} ${desc}`);
  });

  if (help.examples.length > 0) {
    lines.push("\n示例:");
    help.examples.forEach((ex) => {
      lines.push(`  $ ${ex}`);
    });
  }

  return lines.join("\n");
}

export default commandHelp;
