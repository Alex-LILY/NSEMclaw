# NSEM·瑶姬✨

> 下一代AI复合智能体架构

![Banner](https://raw.githubusercontent.com/Alex-LILY/NSEMclaw/main/assets/banner.png)

![Web UI](https://raw.githubusercontent.com/Alex-LILY/NSEMclaw/main/assets/screenshot-ui.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-2026.3.5-blue.svg)](https://github.com/Alex-LILY/NSEMclaw/releases)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

## 📖 项目简介

**NSEM·瑶姬**（简称 NSEMclaw）是基于 **OpenClaw** 二次开发的多通道AI网关系统，是一个面向未来的下一代AI复合智能体架构。

该项目旨在打造一个高度模块化、可扩展的AI助手平台，具备强大的多智能体协作能力和高级记忆系统。

## ✨ 核心特性

### 🤖 智能体管理

- **多智能体并行运行**：支持同时运行多个独立的AI智能体
- **Subagent 协作模式**：主智能体可以派发子任务，实现复杂工作流程
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

---

## 🧠 NSEM 2.0 NSEM认知核心系统

NSEMclaw 搭载全新的 **NSEM 2.0 NSEM认知核心 (Cognitive Core)**，这是一个革命性的神经符号进化记忆系统，为AI助手带来了前所未有的认知能力。

### 1. 系统概述

**NSEM** (Neural-Symbolic Episodic Memory) 融合了神经网络和符号记忆架构，为 AI Agent 提供强大的长期记忆能力。

| 核心特性 | 说明 |
|----------|------|
| **统一核心** | 单一代替分散组件，代码减少50% |
| **三层存储** | 热/温/冷自动分层，LRU管理 |
| **混合搜索** | 向量+关键词+时间衰减+MMR重排 |
| **简化接口** | 6个核心操作（原为20+） |
| **作用域系统** | personal/shared/inherited 灵活控制 |
| **自动维护** | 衰减、合并、清理、优化自动化 |

### 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NSEM 认知记忆系统总览                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐      │
│  │   外部接口层     │──────│   NSEM认知核心层     │──────│   持久化层       │      │
│  │  (Tools/API)    │      │  (NSEM2Core)    │      │  (VectorStorage)│      │
│  └─────────────────┘      └────────┬────────┘      └─────────────────┘      │
│                                     │                                        │
│                              ┌──────┴──────┐                                 │
│                              │  记忆分层系统  │                                │
│                              │  热/温/冷存储  │                                │
│                              └─────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. 核心组件

#### 3.1 摄入管线 (Ingestion Pipeline)

```
输入文本 → 文本分块(~400 tokens) → 向量化 → 重要性评分(0-1) → 元数据提取 → 存储
```

- **文本分块**：~400 tokens/块，80 tokens 重叠
- **向量化**：SmartEmbeddingEngine
- **重要性评分**：ImportanceScorer (0-1分数)

#### 3.2 激活引擎 (Activation Engine)

```
查询输入 → 向量化 → 向量搜索 + BM25关键词 + 时间衰减 → 加权合并 → MMR重排 → Top-K结果
```

**混合搜索权重：**
- 内容相似度：50%
- 时间衰减：20%
- 重要性：20%
- 访问频率：10%

#### 3.3 进化引擎 (Evolution Engine)

定期执行的记忆维护任务：

| 任务 | 频率 | 说明 |
|------|------|------|
| `decay` | 每小时 | 记忆强度衰减 |
| `prune` | 每日 | 删除低于阈值的记忆 |
| `merge-fields` | 每日 | 合并相似记忆场 |
| `optimize-storage` | 每周 | 存储优化 |
| `rebuild-index` | 每月 | 重建索引 |

### 4. 三层记忆存储

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         三层记忆存储架构                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    判断存储层级 (基于访问频率和重要性)                                        │
│           │                                                                  │
│     ┌─────┴─────┬─────────────┬─────────────┐                               │
│     ▼           ▼             ▼             ▼                               │
│  ┌──────┐   ┌──────┐     ┌──────┐     ┌──────────┐                        │
│  │工作记 │   │短期记 │     │长期记 │     │ 作用域分配  │                    │
│  │忆(Hot)│   │忆(Warm)│    │忆(Cold)│    │            │                    │
│  │15条  │   │1000条 │     │磁盘   │     │ personal   │                    │
│  │LRU   │   │      │     │存储   │     │ shared     │                    │
│  └──────┘   └──────┘     └──────┘     │ inherited  │                    │
│                                        └──────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

| 记忆层 | 容量 | 特点 |
|--------|------|------|
| **工作记忆 (Hot)** | 15条 | LRU管理，快速访问 |
| **短期记忆 (Warm)** | 1000条 | 可配置TTL，语义检索 |
| **长期记忆 (Cold)** | 磁盘 | 永久存储，跨会话 |

**层级迁移规则：**
- Working → ShortTerm：10分钟未访问
- ShortTerm → Working：5分钟内访问5次
- ShortTerm → LongTerm：24小时且强度>0.6

### 5. 作用域系统 (Scope)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐
│  personal   │    │   shared    │    │     inherited       │
│   个人记忆   │    │   共享记忆   │    │      继承记忆        │
│  (默认)     │    │  (跨Agent)  │    │  (从父Agent继承)     │
└─────────────┘    └─────────────┘    └─────────────────────┘
```

### 6. 存储架构

基于 SQLite + sqlite-vec 的向量存储：

```
SQLite: ~/.nsemclaw/memory/<agentId>.sqlite
├── vectors 表         - 向量数据
├── vector_metadata表 - 元数据
└── vec0 虚拟表       - 向量索引
```

**缓存层级：**
- Hot LRU (内存) → Warm (SQLite) → Cold (磁盘/批量加载)

### 7. 资源模式

| 模式 | 内存占用 | 加载模型 |
|------|---------|---------|
| **minimal** (极简) | ~314MB | embedding |
| **balanced** (平衡) | ~924MB | embedding + reranker |
| **performance** (性能) | ~2.2GB | 全部 |

### 8. 重要性评分 (ImportanceScorer)

10个默认评分维度：

1. **明确标记** - "重要"、"关键"、"必须"
2. **个人信息** - 姓名、身份、联系方式
3. **偏好设置** - 喜好、习惯、配置
4. **目标计划** - 目标、计划、待办
5. **机密凭证** - 密码、密钥、Token
6. **情感内容** - 情绪、感受、态度
7. **学习洞察** - 知识点、经验、教训
8. **关系信息** - 人际、组织、角色
9. **时间敏感** - 截止日期、日程
10. **疑问关注** - 问题、关注点

### 9. 核心操作接口

6个统一核心操作：

| 操作 | 说明 |
|------|------|
| `memory.store` | 统一存储 |
| `memory.retrieve` | 统一检索 |
| `memory.forget` | 遗忘/删除 |
| `memory.stats` | 统计信息 |
| `memory.evolve` | 触发进化 |
| `memory.configure` | 动态配置 |

### 10. 性能指标

| 指标 | 提升 |
|------|------|
| 单条摄入 | 2.5x (~50ms → ~20ms) |
| 批量摄入(100条) | 5x (~5s → ~1s) |
| 检索延迟(1万条) | 3x (~100ms → ~30ms) |
| 内存占用 | -30% |
| 并发读取吞吐量 | 3-5x |

---

## 🤖 多智能体协作系统

### 协作策略

| 策略 | 适用场景 | 特点 |
|------|----------|------|
| **parallel-fast** | 并行任务 | 最大5个并行，超时60秒 |
| **sequential-quality** | 质量优先 | 顺序执行，超时120秒 |
| **hierarchical-adaptive** | 复杂任务 | 分层管理，自适应分配 |

### 弹性子代理编排

| 功能 | 说明 |
|------|------|
| **断路器** | 失败自动熔断，防止级联故障 |
| **重试机制** | 可配置重试次数和策略 |
| **死信队列** | 失败任务存储与重放 |
| **超时控制** | 精确的任务超时管理 |

---

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

## 🙏 致谢与参考

本项目基于以下优秀开源项目和技术：

- [OpenClaw](https://github.com/nsemclaw/openclaw) - 原始框架
- [MiniMax](https://platform.minimax.io) - AI 模型支持
- [Maton](https://github.com/maton-ai/maton) - 邮件网关
- [QMD](https://github.com/asyncai/qmd) - 向量记忆搜索
- [FlagEmbedding (BGE)](https://github.com/FlagOpen/FlagEmbedding) - 向量嵌入模型
- [GGML/llama.cpp](https://github.com/ggerganov/ggml) - 本地推理框架

---

<p align="center">
  <strong>NSEM·瑶姬✨ - 下一代AI复合智能体架构</strong>
</p>
