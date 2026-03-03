# NSEM·瑶姬 🧚‍♀️

> 下一代AI复合智能体架构 - 基于 OpenClaw 二次开发

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-2026.2.27-blue.svg)](https://github.com/Alex-LILY/NSEMclaw/releases)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

## 📖 项目简介

**NSEM·瑶姬**（简称 NSEMclaw）是基于 **OpenClaw** 二次开发的多通道AI网关系统，是一个面向未来的下一代AI复合智能体架构。

该项目旨在打造一个高度模块化、可扩展的AI助手平台，支持多种通讯渠道的集成，并具备强大的多智能体协作能力和高级记忆系统。

## ✨ 核心特性

### 🤖 智能体管理

- **多智能体并行运行**：支持同时运行多个独立的AI智能体
- **Subagent 协作模式**：主智能体可以派发子任务，实现复杂工作流程
- **认知核心 (Cognitive Core)**：内置记忆管理、任务队列、断路器、重试机制
- **人格系统**：支持多个人格切换（Alex / Alex-Lily）

### 📡 多通道集成

| 通道 | 状态 | 说明 |
|------|------|------|
| Telegram | ✅ | 支持群组、私聊、机器人 |
| Discord | ✅ | 服务器、频道、线程 |
| Slack | ✅ | 工作区、频道 |
| WhatsApp | ✅ | 个人、群组 |
| Signal | ✅ | 加密消息 |
| 飞书 | ✅ | 企业通讯 |
| Matrix | ✅ | 去中心化通讯 |

### 🧠 高级记忆系统

- **QMD 向量记忆**：基于 QMD 的语义搜索能力
- **混合检索**：向量 + 关键词混合搜索
- **长期记忆**：持久化存储重要信息
- **短期记忆**：会话级上下文管理
- **时间衰减**：智能遗忘机制

### 🔧 扩展架构

- **Plugin SDK**：完整的插件开发套件
- **16+ 官方扩展**：开箱即用的功能扩展
- **自定义技能**：灵活的技能系统
- **MCP 协议**：支持 Model Context Protocol

### 🎯 核心能力

| 能力 | 说明 |
|------|------|
| 语音合成 (TTS) | 支持多种语音风格 |
| 浏览器控制 | 自动化网页操作 |
| 图像分析 | 多模态理解 |
| 工具编排 | 灵活的任务调度 |
| 邮件管理 | Gmail + Outlook 集成 |

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        NSEM·瑶姬                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   Agent 1   │  │   Agent 2   │  │   Agent N   │       │
│  │   (Alex)    │  │   (Ops)     │  │  (Custom)   │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
├─────────────────────────────────────────────────────────────┤
│                     Cognitive Core                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │  Memory  │ │  Queue   │ │ Circuit  │ │ Collab   │     │
│  │          │ │          │ │ Breaker │ │          │     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
├─────────────────────────────────────────────────────────────┤
│                        Gateway                               │
│  ┌──────────────────────────────────────────────────┐     │
│  │  Channel Adapters (Telegram/Discord/Slack/...)   │     │
│  └──────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                        Skills                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │ Gmail │ │ GitHub│ │Notion│ │ Web  │ │ ...  │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 环境要求

- Node.js >= 20.x
- pnpm >= 8.x
- Linux/macOS (Windows WSL2 已测试)

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/Alex-LILY/NSEMclaw.git
cd NSEMclaw

# 2. 安装依赖
pnpm install

# 3. 配置环境
cp nsemclaw.config.example.json nsemclaw.json
# 编辑 nsemclaw.json 配置你的 API keys

# 4. 启动
pnpm start
```

### 配置说明

主要配置文件 `nsemclaw.json`：

```json5
{
  // 模型配置
  models: {
    mode: "merge",
    providers: {
      minimax: {
        // 你的 API 配置
      }
    }
  },
  
  // 智能体配置
  agents: {
    defaults: {
      workspace: "~/.nsemclaw/workspace",
      model: { primary: "minimax/MiniMax-M2.5" }
    }
  },
  
  // 通道配置
  channels: {
    telegram: {
      enabled: true,
      botToken: "YOUR_BOT_TOKEN"
    }
  },
  
  // 记忆系统
  memory: {
    backend: "qmd",
    qmd: {
      paths: [{ path: "~/.nsemclaw/workspace", name: "workspace" }]
    }
  }
}
```

## 📚 文档

- [📖 完整文档](https://docs.nsemclaw.ai)
- [🔧 安装指南](https://docs.nsemclaw.ai/getting-started)
- [💬 通道配置](https://docs.nsemclaw.ai/channels)
- [🧠 记忆系统](https://docs.nsemclaw.ai/memory)
- [🔌 插件开发](https://docs.nsemclaw.ai/plugins)

## 🗂️ 项目结构

```
NSEMclaw/
├── src/                    # 核心源代码
│   ├── gateway/           # 网关实现
│   ├── agents/            # 智能体核心
│   ├── cognitive-core/    # 认知引擎
│   └── ...
├── extensions/            # 官方扩展
│   ├── telegram/
│   ├── discord/
│   ├── slack/
│   ├── whatsapp/
│   └── ...
├── skills/               # 技能模块
├── docs/                 # 项目文档
├── ui/                   # Web UI
├── packages/             # 子包
│   ├── clawdbot/
│   └── moltbot/
└── test/                 # 测试文件
```

## 🔌 可用技能

| 技能 | 说明 |
|------|------|
| Gmail | 邮件读取/发送 |
| GitHub | 仓库/Issue/PR 管理 |
| Notion | 笔记数据库操作 |
| 数据库 | SQL 操作支持 |
| 文件搜索 | 快速定位文件 |
| 漏洞扫描 | 安全检测工具 |

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

```bash
# 开发模式
pnpm dev

# 运行测试
pnpm test

# 构建
pnpm build
```

## 📄 许可证

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 致谢

- [OpenClaw](https://github.com/nsemclaw/openclaw) - 原始项目
- [MiniMax](https://minimax.io) - AI 模型支持
- [Maton](https://maton.ai) - 邮件网关

---

<p align="center">
  <strong>NSEM·瑶姬 🧚‍♀️ - 让AI成为你的灵魂伴侣</strong>
</p>
