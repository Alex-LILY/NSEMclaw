---
title: 快速入门
description: 5 分钟快速上手 Nsemclaw
---

# 快速入门指南

本指南将帮助你在 5 分钟内开始使用 Nsemclaw。

## 前提条件

- **Node.js**: 版本 22 或更高
- **操作系统**: macOS、Linux 或 Windows (WSL2)
- **包管理器**: npm、pnpm 或 bun

## 步骤 1: 安装

使用 npm 全局安装 Nsemclaw：

```bash
npm install -g nsemclaw@latest
```

或使用 pnpm：

```bash
pnpm add -g nsemclaw@latest
```

## 步骤 2: 运行引导向导

```bash
nsemclaw onboard --install-daemon
```

向导将指导你完成：

1. 网关配置
2. 工作区设置
3. 频道连接（WhatsApp、Telegram 等）
4. 技能安装

`--install-daemon` 选项会安装系统服务，让网关保持运行。

## 步骤 3: 启动网关

如果你选择了手动启动，运行：

```bash
nsemclaw gateway run --port 18789
```

检查状态：

```bash
nsemclaw gateway status
```

## 步骤 4: 与 AI 对话

### 方式 1: 命令行

```bash
nsemclaw agent --message "你好，Nsemclaw！"
```

### 方式 2: Web 界面

```bash
nsemclaw dashboard
```

浏览器将自动打开控制面板。

### 方式 3: 消息应用

如果你在引导中连接了消息频道（如 Telegram），直接在你的消息应用中发送消息即可。

## 常用命令

### 查看代理列表

```bash
nsemclaw agents list
```

### 创建新代理

```bash
nsemclaw agents add my-agent --model anthropic/claude-4
```

### 查看频道状态

```bash
nsemclaw channels status
```

### 运行诊断

```bash
nsemclaw doctor
```

## 下一步

- [配置模型](concepts/models.md)
- [设置频道](channels/README.md)
- [安装技能](tools/skills.md)
- [了解会话](concepts/session.md)

## 故障排除

### 网关无法启动

检查端口是否被占用：

```bash
lsof -i :18789
```

### 无法连接到频道

检查配置：

```bash
nsemclaw doctor --deep
```

### 重置配置

```bash
rm -rf ~/.nsemclaw/config.json
nsemclaw onboard
```

## 获取帮助

遇到问题？

1. 运行 `nsemclaw doctor` 自动诊断
2. 查看 [FAQ](help/faq.md)
3. 加入 [Discord](https://discord.gg/clawd)
4. 提交 [GitHub Issue](https://github.com/nsemclaw/nsemclaw/issues)
