---
title: Nsemclaw 中文文档
description: 个人 AI 助手的完整中文文档
---

# Nsemclaw 中文文档

欢迎来到 Nsemclaw 中文文档！

## 什么是 Nsemclaw？

**Nsemclaw** 是一个个人 AI 助手平台，你可以在自己的设备上运行它。它连接你已经在使用的各种通信渠道（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、Microsoft Teams、WebChat），并可以通过扩展支持 BlueBubbles、Matrix、Zalo 等。

如果你想要一个个人专属、单用户、本地化、快速且始终在线的 AI 助手，这就是它。

## 主要特性

### 🌐 本地优先网关

- 单一控制平面，管理会话、频道、工具和事件
- 支持 WebSocket 连接
- 内置 Web 控制面板

### 📱 多频道收件箱

- WhatsApp、Telegram、Slack、Discord
- Google Chat、Signal、iMessage
- Microsoft Teams、Matrix、Zalo
- WebChat、BlueBubbles

### 🤖 多代理路由

- 将入站频道/账户/对等方路由到隔离的代理
- 每个代理拥有独立的工作区和会话
- 支持工作区隔离

### 🎙️ 语音唤醒 + 对话模式

- macOS/iOS/Android 上的始终在线语音功能
- 集成 ElevenLabs 语音合成

### 🎨 实时画布

- 由代理驱动的可视化工作区
- 支持 A2UI 交互

### 🛠️ 一流工具

- 浏览器自动化
- Canvas 可视化
- 节点操作
- 定时任务 (Cron)
- 会话管理
- Discord/Slack 操作

## 快速开始

### 安装

```bash
npm install -g nsemclaw@latest
# 或: pnpm add -g nsemclaw@latest

nsemclaw onboard --install-daemon
```

向导将安装网关守护进程（launchd/systemd 用户服务），使其保持运行。

### 启动网关

```bash
nsemclaw gateway --port 18789 --verbose
```

### 发送消息

```bash
# 直接发送消息
nsemclaw message send --to +1234567890 --message "Hello from Nsemclaw"

# 与助手对话
nsemclaw agent --message "Ship checklist" --thinking high
```

## 核心概念

### 网关 (Gateway)

网关是控制平面，负责：

- 管理 WebSocket 连接
- 处理会话和在线状态
- 协调频道和工具
- 提供 Web UI 和 API

### 代理 (Agent)

代理是 AI 运行时实例：

- 每个代理有独立的工作区
- 支持多个模型配置
- 可以隔离会话
- 拥有独立的工具集

### 会话 (Session)

会话管理对话上下文：

- `main` 用于直接对话
- 支持群组隔离
- 多种激活模式
- 队列模式和回复模式

### 频道 (Channel)

频道连接外部通信平台：

- 支持 13+ 种消息平台
- 自动消息路由
- DM 配对安全机制

## 命令参考

### 核心命令

| 命令                | 描述           |
| ------------------- | -------------- |
| `nsemclaw agent`    | 与 AI 代理对话 |
| `nsemclaw gateway`  | 启动网关服务器 |
| `nsemclaw agents`   | 管理代理       |
| `nsemclaw channels` | 管理频道       |
| `nsemclaw config`   | 管理配置       |
| `nsemclaw sessions` | 管理会话       |
| `nsemclaw skills`   | 管理技能       |
| `nsemclaw cron`     | 管理定时任务   |

### 工具命令

| 命令                 | 描述              |
| -------------------- | ----------------- |
| `nsemclaw onboard`   | 运行引导向导      |
| `nsemclaw dashboard` | 打开 Web 控制面板 |
| `nsemclaw doctor`    | 诊断和修复问题    |
| `nsemclaw message`   | 发送消息          |
| `nsemclaw nodes`     | 管理节点          |
| `nsemclaw update`    | 更新 Nsemclaw     |

## 配置指南

### 配置文件位置

- **全局配置**: `~/.nsemclaw/nsemclaw.json`
- **代理配置**: `~/.nsemclaw/agents/<agent-id>/`
- **工作区**: `~/.nsemclaw/workspace/`

### 环境变量

| 变量                     | 描述         |
| ------------------------ | ------------ |
| `NSEMCLAW_CONFIG`        | 配置文件路径 |
| `NSEMCLAW_GATEWAY_TOKEN` | 网关令牌     |
| `NSEMCLAW_LOG_LEVEL`     | 日志级别     |

## 安全注意事项

Nsemclaw 连接到真实的消息平台。将入站 DM 视为**不受信任的输入**。

默认安全行为：

- **DM 配对** (`dmPolicy="pairing"`): 未知发送者收到配对码，机器人不处理其消息
- 使用 `nsemclaw pairing approve <channel> <code>` 批准配对
- 公共入站 DM 需要显式选择加入

运行 `nsemclaw doctor` 检查有风险的 DM 策略配置。

## 获取帮助

- [Discord 社区](https://discord.gg/clawd)
- [GitHub Issues](https://github.com/nsemclaw/nsemclaw/issues)
- [官方文档](https://docs.nsemclaw.ai)
- [FAQ](https://docs.nsemclaw.ai/help/faq)

## 开发频道

- **stable**: 稳定版本，推荐用于生产环境
- **beta**: 测试版本，包含新功能
- **dev**: 开发版本，最新但不稳定

切换频道: `nsemclaw update --channel stable|beta|dev`

## 许可证

MIT License - 详见 [LICENSE](https://github.com/nsemclaw/nsemclaw/blob/main/LICENSE)
