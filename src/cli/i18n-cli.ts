/**
 * CLI 中文本地化模块
 * 为瑶姬提供完整的中文界面
 */

export const CLI_ZH_CN = {
  // 品牌与 Banner
  brand: {
    name: "NSEM·瑶姬",
    tagline: "巫山云雨，皆入记忆长存",
    subtitle: "神经符号情景记忆系统",
  },

  // 全局选项
  options: {
    dev: "开发模式：在 ~/.nsemclaw-dev 下隔离状态，默认网关端口 19001，并偏移派生端口（浏览器/画布）",
    help: "显示命令帮助",
    logLevel: "全局日志级别覆盖（文件 + 控制台）",
    noColor: "禁用 ANSI 颜色",
    profile:
      "使用命名配置（将 NSEMCLAW_STATE_DIR/NSEMCLAW_CONFIG_PATH 隔离在 ~/.nsemclaw-<name> 下）",
    version: "输出版本号",
  },

  // 命令分类
  categories: {
    core: "核心命令",
    gateway: "网关管理",
    channels: "频道管理",
    agents: "智能体管理",
    system: "系统管理",
    tools: "工具与调试",
  },

  // 具体命令
  commands: {
    // 核心
    acp: {
      name: "acp",
      desc: "智能体控制协议工具",
    },
    agent: {
      name: "agent",
      desc: "通过网关运行单次智能体",
    },
    agents: {
      name: "agents",
      desc: "管理隔离智能体（工作区、认证、路由）",
    },

    // 网关
    gateway: {
      name: "gateway",
      desc: "运行、检查和查询 WebSocket 网关",
      subcommands: {
        run: "在前台运行 WebSocket 网关",
        start: "启动网关服务（launchd/systemd/schtasks）",
        stop: "停止网关服务",
        restart: "重启网关服务",
        status: "显示网关服务状态并探测",
        install: "安装网关服务",
        uninstall: "卸载网关服务",
        probe: "显示网关可达性 + 发现 + 健康 + 状态摘要",
        health: "获取网关健康状态",
        call: "直接调用网关 RPC 方法",
        discover: "通过 Bonjour 发现网关（本地 + 广域）",
        usageCost: "从会话日志获取使用成本摘要",
      },
    },

    // 频道
    channels: {
      name: "channels",
      desc: "管理连接的聊天频道（Telegram、Discord 等）",
      subcommands: {
        list: "列出已配置的频道和账户",
        login: "通过二维码或 OAuth 登录频道",
        logout: "注销频道账户",
        status: "显示频道健康状态",
      },
    },

    // 配置
    config: {
      name: "配置",
      desc: "非交互式配置助手（获取/设置/取消设置）。默认：启动设置向导",
    },
    configure: {
      name: "configure",
      desc: "凭证、频道、网关和智能体默认值的交互式设置向导",
    },

    // 系统
    doctor: {
      name: "doctor",
      desc: "网关和频道的健康检查 + 快速修复",
    },
    status: {
      name: "status",
      desc: "显示频道健康状态和最近会话接收者",
    },
    logs: {
      name: "logs",
      desc: "通过 RPC 追踪网关文件日志",
    },

    // 智能体工具
    tui: {
      name: "tui",
      desc: "打开连接到网关的终端 UI",
    },
    message: {
      name: "message",
      desc: "发送、读取和管理消息",
    },

    // 其他
    skills: {
      name: "skills",
      desc: "列出和检查可用技能",
    },
    models: {
      name: "models",
      desc: "发现、扫描和配置模型",
    },
    plugins: {
      name: "plugins",
      desc: "管理 Nsemclaw 插件和扩展",
    },
    sandbox: {
      name: "sandbox",
      desc: "管理用于智能体隔离的沙盒容器",
    },
    cron: {
      name: "cron",
      desc: "通过网关调度器管理定时任务",
    },
    browser: {
      name: "browser",
      desc: "管理 Nsemclaw 的专用浏览器（Chrome/Chromium）",
    },
    completion: {
      name: "completion",
      desc: "生成 shell 补全脚本",
    },
  },

  // 使用示例
  examples: {
    title: "示例",
    modelsHelp: "显示 models 命令的详细帮助",
    channelsLogin: "链接个人 WhatsApp Web 并显示二维码 + 连接日志",
    messageSend: "通过 Web 会话发送消息并打印 JSON 结果",
    gatewayRun: "在 ws://127.0.0.1:18789 本地运行网关",
    gatewayDev: "在 ws://127.0.0.1:19001 运行开发网关（隔离状态/配置）",
    agentTalk: "直接使用网关与智能体对话；可选发送 WhatsApp 回复",
  },

  // 文档链接
  docs: {
    cli: "文档：https://docs.openclaw.ai/cli",
  },

  // Doctor 警告
  doctor: {
    warnings: "瑶姬警示",
    stateDirMigration: "状态目录迁移已跳过：目标已存在 ({path}）。请手动移除或合并。",
    telegramGroupPolicy:
      'channels.telegram.groupPolicy 为 "allowlist"，但 groupAllowFrom（和 allowFrom）为空 —— 所有群组消息将被静默丢弃。请添加发送者 ID 到 channels.telegram.groupAllowFrom 或 channels.telegram.allowFrom，或将 groupPolicy 设为 "open"。',
  },

  // 帮助页脚
  helpFooter: {
    hint: "提示：带有 * 后缀的命令有子命令。运行 <command> --help 查看详情。",
  },
} as const;

export type CLI_ZH_CN_Type = typeof CLI_ZH_CN;
