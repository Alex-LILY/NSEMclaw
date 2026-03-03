# NSEM·瑶姬✨

> 下一代AI复合智能体架构

![Banner](https://raw.githubusercontent.com/Alex-LILY/NSEMclaw/main/assets/banner.png)

![Web UI](https://raw.githubusercontent.com/Alex-LILY/NSEMclaw/main/assets/screenshot-ui.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-2026.2.27-blue.svg)](https://github.com/Alex-LILY/NSEMclaw/releases)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

## 📖 项目简介

**NSEM·瑶姬**（简称 NSEMclaw）是基于 **OpenClaw** 二次开发的多通道AI网关系统，是一个面向未来的下一代AI复合智能体架构。

该项目旨在打造一个高度模块化、可扩展的AI助手平台，具备强大的多智能体协作能力和高级记忆系统。

## ✨ 核心特性

### 🤖 智能体管理

- **多智能体并行运行**：支持同时运行多个独立的AI智能体
- **Subagent 协作模式**：主智能体可以派发子任务，实现复杂工作流程
- **认知核心 (Cognitive Core)**：内置记忆管理、任务队列、断路器、重试机制
- **人格系统**：支持多个人格切换（Alex / Alex-Lily）

### 📡 支持通道

| 通道 | 状态 |
|------|------|
| Telegram | ✅ |
| WebChat | ✅ |

### 🎯 核心能力

| 能力 | 说明 |
|------|------|
| 语音合成 (TTS) | 支持多种语音风格 |
| 浏览器控制 | 自动化网页操作 |
| 图像分析 | 多模态理解 |
| 工具编排 | 灵活的任务调度 |
| 邮件管理 | Gmail + Outlook 集成 |

## 🧠 NSEM 记忆系统

NSEMclaw 拥有强大的多层次记忆系统，是区别于其他AI助手框架的核心优势。

### 记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│                      长期记忆 (MEMORY.md)                    │
│         持久化存储重要信息、偏好、决策、学习                   │
├─────────────────────────────────────────────────────────────┤
│                    QMD 向量记忆搜索                          │
│        语义搜索 + 混合检索 + 时间衰减机制                    │
├─────────────────────────────────────────────────────────────┤
│                   每日记忆 (memory/)                        │
│            会话日志、工作记录、任务追踪                      │
├─────────────────────────────────────────────────────────────┤
│                    工作记忆 (Context)                        │
│              当前会话上下文、工具状态                        │
└─────────────────────────────────────────────────────────────┘
```

### 1. 长期记忆 (MEMORY.md)

- 持久化存储在文件系统中
- 存储重要决策、偏好设置、学习成果
- 可被语义搜索检索

```markdown
# MEMORY.md - 长期记忆

## 核心身份
- 运行框架: Nsemclaw
- 底层模型: MiniMax M2.5

## 已知工作方式
- 每次会话从空白开始
- 记忆靠写入文件 persistence
```

### 2. QMD 向量记忆

基于 QMD 的语义搜索能力，支持：

- **混合检索**：向量 + 关键词混合搜索
- **时间衰减**：智能遗忘机制，近期信息权重更高
- **语义理解**：理解自然语言查询

```bash
# 使用 qmd 进行语义搜索
qmd query "上次讨论的项目"
qmd search "关于Python代码"
```

### 3. 每日记忆 (memory/YYYY-MM-DD.md)

自动记录每日工作：

```markdown
# 2026-03-04 记忆

## 🎯 今日完成
- 配置邮件技能
- 上传项目到 GitHub

## 📝 备注
- 需要添加更多测试用例
```

### 4. 认知核心 (Cognitive Core)

内置强大的认知引擎：

| 模块 | 功能 |
|------|------|
| **Memory** | 记忆存储与检索 |
| **Queue** | 任务队列管理 |
| **Circuit Breaker** | 断路器保护 |
| **Collaboration** | 多智能体协作 |

```javascript
// 认知核心操作示例
cognitive_core({
  action: "memory_store",
  memory_content: "重要信息",
  memory_tier: "long-term"
})
```

### 记忆检索示例

```bash
# 语义搜索
qmd query "关于项目决策"

# 关键词搜索
qmd search "2026年"

# 向量相似度搜索
qmd vsearch "用户偏好"
```

## 🚀 快速开始

### 环境要求

- Node.js >= 20.x
- pnpm >= 8.x
- Linux/macOS

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/Alex-LILY/NSEMclaw.git
cd NSEMclaw

# 2. 安装依赖
pnpm install

# 3. 配置环境
cp nsemclaw.config.example.json nsemclaw.json

# 4. 启动
pnpm start
```

## 📚 文档

- [📖 完整文档](https://docs.nsemclaw.ai)
- [🧠 记忆系统详解](https://docs.nsemclaw.ai/memory)

---

<p align="center">
  <strong>NSEM·瑶姬✨ - 下一代AI复合智能体架构</strong>
</p>
