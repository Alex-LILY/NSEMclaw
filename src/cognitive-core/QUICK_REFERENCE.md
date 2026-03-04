# 清理后架构快速参考

## 📋 一句话总结

```
清理前：60+ 文件，4 个入口，多层 Adapter 转换
清理后：30 文件，1 个入口，直达核心
```

## 🎯 核心架构（简化版）

```
┌─────────────────────────────────────────────────────────────┐
│                      应用层                                  │
│         memory-tool / Agent Runner / Session                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              UnifiedCoreV2.ts（单一入口）                     │
│                     融合核心                                  │
└────────┬────────────────┬────────────────┬───────────────────┘
         │                │                │
         ▼                ▼                ▼
    ┌─────────┐     ┌──────────┐    ┌──────────┐
    │  存储   │     │  提取    │    │  检索    │
    │ 模块   │     │  模块    │    │  模块    │
    ├─────────┤     ├──────────┤    ├──────────┤
    │•Working │     │•Session │    │•Hybrid  │
    │•Short   │     │•Extract │    │•Intent  │
    │•Long    │     │•8类分类  │    │•Rerank  │
    └─────────┘     └──────────┘    └──────────┘
```

## 🔄 三大核心流程

### 1️⃣ 记忆存储流程

```
[Agent 调用]
    │
    ├─► UnifiedCoreV2.ingest(content, embedding)
    │           │
    │           ▼
    │   ┌───────────────┐
    │   │  重要性评估    │
    │   │  内容分类     │
    │   └───────┬───────┘
    │           │
    │           ▼
    │   ┌───────┴───────┐
    │   │   存储路由     │
    │   └─┬─────┬─────┬─┘
    │     │     │     │
    │     ▼     ▼     ▼
    │  Working Short  Long
    │  Memory  Term   Term
    │
[存储完成]
```

### 2️⃣ 记忆检索流程

```
[用户查询]
    │
    ├─► UnifiedCoreV2.retrieve(query)
    │           │
    │           ▼
    │   ┌───────────────┐
    │   │   意图分析     │
    │   │   查询扩展     │
    │   └───────┬───────┘
    │           │
    │           ▼
    │   ┌───────┴───────┐
    │   │   三路并行检索 │
    │   ├─► Dense      │
    │   ├─► Sparse     │
    │   └─► Tiered     │
    │           │
    │           ▼
    │   ┌───────────────┐
    │   │  融合 + 重排序 │
    │   └───────┬───────┘
    │           │
    │           ▼
    │   [返回 Top-K 结果]
    │
[检索完成]
```

### 3️⃣ 会话提取流程

```
[对话开始]
    │
    ├─► startSession(userId)
    │       │
    │       ▼
    │   [对话进行中]
    │       │
    │       ├─► recordMessage(role, content)
    │       ├─► recordToolCall(tool, input, output)
    │       │
    │       ▼
    │   [对话结束]
    │       │
    │       ├─► endSession(sessionId)
    │               │
    │               ▼
    │       ┌───────────────┐
    │       │  MemoryExtractor
    │       │  • 内容分析    │
    │       │  • 8类分类    │
    │       │  • 去重合并    │
    │       └───────┬───────┘
    │               │
    │               ▼
    │       ┌───────┴───────┐
    │       │   存储记忆     │
    │       │  User/Agent/Tool
    │       └───────────────┘
    │
[提取完成]
```

## 📂 文件清单（清理后）

```
src/cognitive-core/
│
├── 核心（3个）
│   ├── index.ts                    ⭐ 主入口
│   ├── config.ts                   ⚙️ 配置
│   └── UnifiedCoreV2.ts            🆕 融合核心
│
├── 类型（1个）
│   └── types/index.ts              📐 类型定义
│
├── 记忆存储（2个）
│   └── memory/
│       ├── ThreeTierMemoryStore.ts 💾 三层存储
│       └── index.ts
│
├── 记忆提取（4个）
│   └── memory-extraction/
│       ├── SessionManager.ts       💬 会话管理
│       ├── MemoryExtractor.ts      🔧 提取器
│       ├── types.ts                📋 类型
│       └── index.ts
│
├── 检索（5个）
│   └── retrieval/
│       ├── HybridRetriever.ts      🔍 混合检索
│       ├── IntentAnalyzer.ts       🎯 意图分析
│       ├── SparseIndex.ts          📄 稀疏索引
│       ├── Reranker.ts             📊 重排序
│       └── index.ts
│
├── 上下文（4个）
│   └── context/
│       ├── UnifiedContext.ts       🌐 统一上下文
│       ├── ContextLevel.ts         📶 层级
│       ├── RetrievalTracer.ts      🔎 追踪
│       └── index.ts
│
├── 嵌入（3个）
│   └── mind/perception/
│       ├── SmartEmbeddingEngine.ts 🧠 智能嵌入
│       ├── UnifiedEmbeddingEngine.ts 🔗 统一嵌入
│       └── index.ts
│
├── 存储（2个）
│   └── storage/
│       ├── VectorStorage.ts        💽 向量存储
│       └── index.ts
│
└── 工具（2个）
    └── utils/
        ├── common.ts               🛠️ 通用工具
        └── index.ts

总计：30 个文件（原 60+ 个）
```

## 🗑️ 已删除/清理的内容

```
❌ adapter/ 目录（12个文件）
   - 旧适配器层，被 UnifiedCoreV2 替代

❌ mind/nsem/NSEM2Core.ts
❌ mind/nsem/UnifiedNSEM2Core.ts
   - 被 UnifiedCoreV2 替代

❌ NSEM21Core.ts
❌ NSEM21CoreWithExtraction.ts
   - 功能合并到 UnifiedCoreV2

❌ 决策系统（decision/）
   - 可选功能，如不用可移除

❌ 进化系统（evolution/）
   - 可选功能，如不用可移除

❌ 元认知（meta-cognition/）
   - 可选功能，如不用可移除

❌ 多代理（multi-agent/）
   - 可选功能，如不用可移除

❌ 20+ 个文档文件
   - 归档到 docs/ 目录
```

## 🚀 使用示例

### 初始化
```typescript
import { createUnifiedCoreV2 } from "./cognitive-core";

const core = createUnifiedCoreV2("my-agent", {
  storage: { mode: "three-tier" },
  extraction: { enabled: true },
});

await core.initialize();
```

### 存储记忆
```typescript
await core.ingest({
  id: "mem_001",
  content: "用户喜欢 TypeScript",
  embedding: await embed("用户喜欢 TypeScript"),
  category: "preferences",
  metadata: { agentId: "my-agent", userId: "u1" },
});
```

### 检索记忆
```typescript
const results = await core.retrieve("代码风格偏好", {
  maxResults: 5,
  tiers: ["working", "short-term"],
});
```

### 会话提取
```typescript
const sessionId = core.startSession("user-123");
core.recordMessage(sessionId, { role: "user", content: "..." });
core.recordMessage(sessionId, { role: "assistant", content: "..." });
await core.endSession(sessionId); // 自动提取记忆
```

## 📊 对比总结

| 维度 | 清理前 | 清理后 | 改进 |
|-----|-------|-------|------|
| 文件数 | 60+ | 30 | -50% |
| 入口数 | 4+ | 1 | -75% |
| 核心类 | 5+ (NSEM2/21/Unified) | 1 (UnifiedCoreV2) | -80% |
| 配置复杂度 | 高 | 低 | 易维护 |
| 学习成本 | 高 | 低 | 易上手 |
| 调试难度 | 高 | 低 | 易排查 |

## ✅ 清理清单

- [x] UnifiedCoreV2.ts 创建
- [x] search-manager.ts 集成
- [ ] 删除 adapter/ 目录
- [ ] 归档旧文档到 docs/
- [ ] 更新 index.ts 导出
- [ ] 测试验证
