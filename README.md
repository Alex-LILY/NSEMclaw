# NSEM·瑶姬✨

> 下一代AI复合智能体架构

![Banner](https://raw.githubusercontent.com/Alex-LILY/NSEMclaw/main/assets/banner.png)

![Web UI](https://raw.githubusercontent.com/Alex-LILY/NSEMclaw/main/assets/screenshot-ui.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-2026.3.4-blue.svg)](https://github.com/Alex-LILY/NSEMclaw/releases)
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

## 🧠 NSEM 3.0 Phoenix 认知核心系统

NSEMclaw 搭载全新的 **NSEM 3.0 Phoenix 认知核心**，这是基于 [OpenViking](https://github.com/volcengine/OpenViking) 架构理念设计的革命性神经符号进化记忆系统，为AI助手带来了前所未有的认知能力。

### 📌 本次更新 (2026.03)

#### ✅ 做到了什么

| 功能 | 状态 | 说明 |
|------|------|------|
| **NSEMFusionCore v3.0** | ✅ | 全新融合核心，统一NSEM2架构 |
| **SmartEmbeddingEngine** | ✅ | 智能嵌入引擎，支持GPU加速 |
| **ThreeTierMemoryStore** | ✅ | 三层记忆存储，热/温/冷自动分层 |
| **HybridRetriever** | ✅ | 混合检索系统，向量+关键词+重排 |
| **决策系统集成** | ✅ | NSEM与决策系统深度整合 |
| **自动资源检测** | ✅ | 网关自动检测内存和GPU |
| **多模型支持** | ✅ | embedding + expansion + reranker |

#### 🎯 优化了什么

| 优化项 | 提升 |
|--------|------|
| 代码量 | 减少50%+ |
| 摄入速度 | 2.5x 提升 |
| 检索延迟 | 3x 提升 |
| 内存占用 | -30% |
| 并发吞吐量 | 3-5x |

#### 🔄 核心架构流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NSEMclaw Gateway 启动                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. 基础服务启动                                                              │
│     ├─ Canvas Host (http://127.0.0.1:18789/__nsemclaw__/canvas/)           │
│     ├─ Heartbeat 服务启动                                                    │
│     ├─ Health Monitor (300s 间隔)                                           │
│     └─ Browser Control (http://127.0.0.1:18791/)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. NSEM认知核心自动启动策略                                                   │
│     ├─ 系统内存检测 (自动)                                                   │
│     ├─ 模型文件检查                                                          │
│     │   ├─ ✅ Embedding 模型                                                │
│     │   ├─ ✅ Expansion 模型                                                │
│     │   └─ ✅ Reranker 模型                                                 │
│     └─ 按 Agent 初始化 (performance 模式)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. NSEMFusionCore v3.0.0 (Phoenix) 初始化                                   │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 3.1 SmartEmbeddingEngine 初始化                                          ││
│  │    ├─ 资源模式: performance (自动检测)                                   ││
│  │    ├─ GPU: 启用                                                        ││
│  │    ├─ 嵌入模型: hf:ggml-org/embeddinggemma-300m-qat-Q8_0.gguf         ││
│  │    ├─ 扩展模型: query-expansion-1.7B-q4_k_m.gguf                       ││
│  │    └─ Reranker: bge-reranker-v2-m3-q4_k_m.gguf                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                        │
│                                      ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 3.2 ThreeTierMemoryStore 三层记忆存储启动                                 ││
│  │    ├─ 工作记忆容量: 15                                                   ││
│  │    ├─ 自动升降级: 启用                                                   ││
│  │    └─ 层级: 工作/短期/长期                                               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                        │
│                                      ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 3.3 HybridRetriever 混合检索系统初始化                                    ││
│  │    ├─ Dense 检索 (向量相似度)                                            ││
│  │    ├─ Sparse 检索 (关键词匹配)                                           ││
│  │    └─ 重排序器 (MMR)                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                        │
│                                      ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 3.4 SessionManager 会话管理器                                            ││
│  │    ├─ 最大消息数: 50                                                    ││
│  │    ├─ 自动提取: 启用                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. 统一会话摄入系统 (UnifiedSessionIngestionManager)                        │
│     ├─ 与 Builtin Memory 共享事件系统                                        │
│     ├─ 注册 NSEM Consumer                                                   │
│     └─ 防抖时间: 5000ms                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. 决策系统集成 (DecisionIntegration)                                      │
│     ├─ NSEM记忆作为决策上下文                                                │
│     ├─ 决策建议检索                                                          │
│     └─ 子代理决策支持                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. 网关就绪 - 开始处理请求                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 📊 系统资源模式

| 模式 | 内存要求 | 加载模型 |
|------|---------|---------|
| **minimal** | < 8GB | embedding (~314MB) |
| **balanced** | 8-32GB | embedding + reranker (~924MB) |
| **performance** | > 32GB | 全部 (~2.2GB) |

### 🔧 核心组件

| 组件 | 说明 |
|------|------|
| NSEMFusionCore | 统一融合核心 |
| SmartEmbeddingEngine | 智能嵌入引擎 |
| ThreeTierMemoryStore | 三层记忆存储 |
| HybridRetriever | 混合检索器 |
| DecisionIntegration | 决策系统集成 |

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

---

## 🙏 致谢

本项目基于以下优秀开源项目和技术：

### 核心框架
- [OpenClaw](https://github.com/nsemclaw/openclaw) - 原始框架
- [OpenViking](https://github.com/volcengine/OpenViking) - 火山引擎AI Agent框架，NSEM认知核心架构参考
- [Node.js](https://nodejs.org) - 运行时环境

### AI 模型支持
- [MiniMax](https://platform.minimax.io) - AI 模型支持
- [FlagEmbedding (BGE)](https://github.com/FlagOpen/FlagEmbedding) - 向量嵌入模型
- [GGML/llama.cpp](https://github.com/ggerganov/ggml) - 本地推理框架

### 扩展集成
- [Maton](https://github.com/maton-ai/maton) - 邮件网关
- [QMD](https://github.com/asyncai/qmd) - 向量记忆搜索

### 工具库
- [sql.js](https://sql.js.org) - SQLite WebAssembly
- [llamaindex](https://www.llamaindex.ai) - AI 数据框架

---

## 📝 更新日志

### 2026.03 - NSEM 3.0 Phoenix 发布

- ✅ 全新 NSEMFusionCore v3.0
- ✅ SmartEmbeddingEngine GPU加速
- ✅ ThreeTierMemoryStore 三层存储
- ✅ HybridRetriever 混合检索
- ✅ 决策系统深度集成
- ✅ 自动资源检测

---

<p align="center">
  <strong>NSEM·瑶姬✨ - 下一代AI复合智能体架构</strong>
</p>
