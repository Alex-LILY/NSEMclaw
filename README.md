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

## 🧠 NSEM 2.0 认知核心系统

NSEMclaw 搭载全新的 **NSEM 2.0 认知核心 (Cognitive Core)**，这是一个革命性的神经符号进化记忆系统，为AI助手带来了前所未有的认知能力。

### 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NSEM 2.0 认知核心                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│  │   心灵 (Mind)   │  │   灵魂 (Soul)   │  │  本能 (Instinct)│       │
│  │  - NSEM2Core   │  │  - 人格系统     │  │  - 模式固化     │       │
│  │  - 智能嵌入    │  │  - 情感计算     │  │  - 直觉决策     │       │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘       │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                      记忆系统 (Memory)                           │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │  │
│  │  │  工作记忆    │ │  短期记忆    │ │  长期记忆    │           │  │
│  │  │ (Working)   │ │(Short-Term)  │ │(Long-Term)   │           │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘           │  │
│  │         ↑              ↑               ↑                         │  │
│  │         └──────────────┼───────────────┘                         │  │
│  │                        ↓                                          │  │
│  │              NSEM2 向量嵌入引擎                                    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    多智能体协作层 (Multi-Agent)                   │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │  │
│  │  │弹性子代理   │ │协作系统     │ │ 断路器     │ │ 死信队  │ │  │
│  │  │Orchestrator │ │Collaboration│ │CircuitBreaker│ │列(DLQ)  │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    元认知监控 (Meta-Cognition)                    │  │
│  │         健康监测 | 性能追踪 | 趋势分析 | 错误率统计              │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 核心模块详解

#### 1. NSEM2 记忆引擎 (Mind)

**神经符号进化记忆系统**，支持三层记忆架构：

| 记忆层 | 说明 | 特点 |
|--------|------|------|
| **工作记忆 (Working)** | 当前会话上下文 | 快速访问，会话结束时清除 |
| **短期记忆 (Short-Term)** | 近期重要信息 | 可配置 TTL，支持语义检索 |
| **长期记忆 (Long-Term)** | 持久化知识 | 永久存储，跨会话共享 |

**智能特性：**
- 智能嵌入：自动选择合适的向量模型
- 涌现关联：主动发现潜在知识联系
- 渐进加载：根据设备资源自动调整

#### 2. 选择性记忆继承 (Selective Memory Inheritance)

专为子代理设计的安全记忆共享机制：

```typescript
// 父 Agent 选择性继承记忆给子 Agent
cognitive_core({
  action: "inherit_memory",
  parent_agent_id: "agent:main:main",
  inheritance_strategy: "filtered", // full/filtered/summarized/referenced/none
  include_tags: ["project", "task"],
  exclude_tags: ["private"],
  min_importance: 0.5
})
```

**继承策略：**
- `full`: 完整继承
- `filtered`: 按标签过滤
- `summarized`: 摘要继承
- `referenced`: 仅引用
- `none`: 不继承

#### 3. 多智能体协作系统 (Multi-Agent Collaboration)

支持三种协作策略：

| 策略 | 适用场景 | 特点 |
|------|----------|------|
| **parallel-fast** | 并行任务 | 最大5个并行，超时60秒 |
| **sequential-quality** | 质量优先 | 顺序执行，超时120秒 |
| **hierarchical-adaptive** | 复杂任务 | 分层管理，自适应分配 |

**协作功能：**
- 任务派发与追踪
- 结果聚合与合并
- 依赖管理
- 优先级调度

#### 4. 弹性子代理编排 (Resilient Subagent Orchestrator)

企业级任务执行框架，提供：

| 功能 | 说明 |
|------|------|
| **断路器 (Circuit Breaker)** | 失败自动熔断，防止级联故障 |
| **重试机制** | 可配置重试次数和策略 |
| **死信队列 (DLQ)** | 失败任务存储与重放 |
| **超时控制** | 精确的任务超时管理 |

#### 5. 工作队列与 Pipeline

强大的任务流水线系统：

```typescript
// 创建 Pipeline
cognitive_core({
  action: "pipeline_create",
  pipeline_name: "数据处理流程",
  pipeline_stages: [
    { name: "抓取", subagent_id: "scraper", timeout_seconds: 300 },
    { name: "清洗", subagent_id: "cleaner", timeout_seconds: 180 },
    { name: "分析", subagent_id: "analyzer", timeout_seconds: 240 }
  ]
})
```

#### 6. 元认知监控 (Meta-Cognition Monitor)

实时系统健康监控：

```json
{
  "health": 1.0,
  "load": 0.15,
  "performance_trend": "stable",
  "error_rate": 0.02,
  "active_operations": 3,
  "stats": {
    "total_operations": 1250,
    "success_rate": 0.98,
    "avg_quality": 0.92
  }
}
```

### 记忆操作示例

```typescript
// 存储记忆
cognitive_core({
  action: "memory_store",
  memory_tier: "long-term",
  memory_content: "用户偏好深色模式",
  memory_type: "fact",
  memory_tags: ["preference", "ui"]
})

// 检索记忆
cognitive_core({
  action: "memory_retrieve",
  query: "用户界面相关偏好",
  memory_scope: "personal",
  max_results: 10
})

// 记忆统计
cognitive_core({
  action: "memory_stats"
})
```

### 子代理生命周期管理

完整的子代理管理接口：

| 操作 | 说明 |
|------|------|
| `subagent_create` | 创建子代理 |
| `subagent_send` | 发送消息 |
| `subagent_close` | 优雅关闭 |
| `subagent_delete` | 完全删除 |
| `subagent_list` | 列出所有子代理 |
| `subagent_a2a` | 子代理间通信 |

### 与原版 NSEM 的差异

| 特性 | 原版 NSEM | NSEM 2.0 |
|------|-----------|-----------|
| 嵌入引擎 | 简化实现 (384维) | **复用本地模型** |
| 模型管理 | 独立管理 | **渐进加载，资源自适应** |
| 内存占用 | 固定 ~100MB | **自动选择: 80MB-500MB** |
| 重排序 | 无 | **智能加载，用完即释** |
| 配置 | 独立配置 | **复用 memorySearch 配置** |

### 轻量模型推荐

| 模式 | 设备 | 模型 | 大小 | 维度 |
|------|------|------|------|------|
| 极简 | 8GB | all-MiniLM-L6-v2 | ~80MB | 384 |
| 平衡 | 16GB | embeddinggemma-300m | ~300MB | 1536 |
| 高性能 | 24GB+ | bge-reranker | ~500MB | 1024 |

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
- [QMD](https://github.com/tobilu/qmd) - 向量记忆搜索
- [BGE Embeddings](https://github.com/bgerp/bge-m3) - 向量嵌入模型

---

<p align="center">
  <strong>NSEM·瑶姬✨ - 下一代AI复合智能体架构</p>
