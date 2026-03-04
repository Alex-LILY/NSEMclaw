# NSEM认知核心融合方案

## 问题背景

项目中存在两个记忆系统：

| 系统 | 来源 | 特点 | 状态 |
|-----|------|------|------|
| **UnifiedNSEM2Core** | 现有系统 | 记忆进化、关系网络、长期存储 | 实际使用中 |
| **ThreeTierMemoryStore** | 新系统 | 工作记忆、短期记忆、长期记忆 | 独立实现 |

**冲突**：
1. 两者都想做主存储
2. 功能重叠但实现不同
3. 无法简单共存

**之前的方案（适配器层）**：强行拼接两个系统，没有解决根本冲突。

**现在的方案（Unified Core V2）**：根据特性选择最优存储，真正融合。

## 解决方案对比

### ❌ 适配器层（之前的方案）

```
Agent Runner ──▶ SessionAdapter ──▶ SessionManager
       │                              │
       ▼                              ▼
memory_search ◀── ApiAdapter ◀── core.retrieve()
       │                              │
       ▼                              ▼
  QMD/文件系统 ◀── StorageAdapter ◀── ThreeTierStore
```

**问题**：
- 数据流转 6+ 层，容易丢失上下文
- 两个系统互相不知道对方存在
- 数据同步困难

### ✅ Unified Core V2（现在的方案）

```
Agent Runner
    │
    ▼
UnifiedCoreV2（单一入口）
    │
    ├──▶ SessionManager（可选增强）
    │       └──▶ 8类提取
    │
    ├──▶ UnifiedNSEM2Core（长期进化）
    │
    └──▶ ThreeTierStore（快速访问）
```

**优势**：
- 单一入口，逻辑清晰
- 根据特性选择最优存储
- 两个系统协同工作

## 核心思想

> **不是二选一，而是取两者之长。**

| 记忆特性 | 推荐存储 | 原因 |
|---------|---------|------|
| 需要长期进化 | UnifiedNSEM2Core | 支持记忆进化、关系网络 |
| 需要快速访问 | ThreeTierMemoryStore | LRU 缓存、毫秒级响应 |
| 会话临时记忆 | ThreeTierMemoryStore | 工作记忆自动升降级 |
| 需要 8类分类 | 两者皆可 | 8类提取后存储到最优位置 |

## 快速开始

### 1. 安装（无需额外依赖）

Unified Core V2 使用项目中已有的组件，无需安装新依赖。

### 2. 基础使用

```typescript
import { createUnifiedCoreV2 } from "./cognitive-core/UnifiedCoreV2.js";

// 创建融合核心
const core = createUnifiedCoreV2("my-agent", {
  storage: {
    mode: "hybrid", // "unified-nsem2" | "three-tier" | "hybrid"
  },
  extraction: {
    enabled: true,  // 启用 8类记忆提取
  },
  session: {
    enabled: true,  // 启用 SessionManager
  },
});

// 初始化
await core.initialize(nsemclawConfig, memorySearchConfig);
```

### 3. 三种使用模式

#### 模式 A：渐进迁移（推荐）

```typescript
const core = createUnifiedCoreV2("my-agent", {
  storage: { mode: "hybrid" },  // 同时使用两个系统
  extraction: { enabled: true }, // 用新系统的提取
  session: { enabled: true },    // 用新系统的会话
});

// 获取兼容现有接口的适配器
const searchManager = core.createSearchManagerAdapter();
// 直接替换现有的 MemorySearchManager
```

#### 模式 B：特性选择

```typescript
// 只用新系统的提取，存储还是用现有系统
const core = createUnifiedCoreV2("my-agent", {
  storage: { mode: "unified-nsem2" }, // 只用现有系统
  extraction: { enabled: true },       // 但用新系统的提取
});
```

#### 模式 C：完全切换

```typescript
// 完全切换到新系统
const core = createUnifiedCoreV2("my-agent", {
  storage: { mode: "three-tier" }, // 只用 ThreeTierMemoryStore
});
```

## 关键 API

### 会话驱动提取

```typescript
// 开始会话
const sessionId = core.startSession("user-123");

// 记录消息
core.recordMessage(sessionId, { role: "user", content: "..." });
core.recordMessage(sessionId, { role: "assistant", content: "..." });

// 记录工具调用
core.recordToolCall(sessionId, {
  toolName: "code_review",
  input: { ... },
  output: "...",
});

// 结束会话（自动触发 8类提取）
await core.endSession(sessionId);
```

### 记忆摄入

```typescript
// 统一摄入入口
await core.ingest({
  id: "mem_001",
  content: "用户偏好 TypeScript",
  embedding: [0.1, 0.2, ...],
  category: "preferences",  // 8类记忆
  section: "user",
  metadata: {
    agentId: "my-agent",
    userId: "user-123",
    timestamp: Date.now(),
    importance: 0.8,
  },
});
// UnifiedCoreV2 内部决定存储位置
```

### 记忆检索

```typescript
// 分层检索（优先工作记忆）
const results = await core.retrieve("TypeScript 风格", {
  maxResults: 5,
  tiers: ["working", "short-term"], // 只检索工作记忆和短期记忆
});

// 统一检索（从多个系统合并）
const results = await core.retrieve("TypeScript 风格", {
  mode: "mixed",
});
```

### 兼容现有接口

```typescript
// 创建兼容 MemorySearchManager 的适配器
const searchManager = core.createSearchManagerAdapter();

// 使用现有接口
const results = await searchManager.search("查询", {
  maxResults: 10,
});

// 可以直接替换现有的 MemorySearchManager
```

## 配置选项

```typescript
interface UnifiedCoreV2Config {
  storage: {
    mode: "unified-nsem2" | "three-tier" | "hybrid";
    threeTier?: {
      workingMemoryCapacity?: number;  // 默认 15
      autoTierTransition?: boolean;     // 默认 true
    };
  };

  extraction: {
    enabled: boolean;           // 默认 true
    autoExtract: boolean;       // 默认 true
    sections: {
      user: boolean;   // 提取用户画像、偏好、实体、事件
      agent: boolean;  // 提取案例、模式
      tool: boolean;   // 提取工具、技能
    };
    thresholds: {
      minMessages: number;        // 默认 2
      minContentLength: number;   // 默认 100
    };
  };

  session: {
    enabled: boolean;      // 默认 true
    maxMessages: number;   // 默认 50
    maxDurationMs: number; // 默认 30分钟
    idleTimeoutMs: number; // 默认 5分钟
  };

  retrieval: {
    mode: "unified" | "tiered" | "mixed";  // 默认 "tiered"
    tierWeights?: {
      working: number;    // 默认 1.0
      shortTerm: number;  // 默认 0.8
      longTerm: number;   // 默认 0.6
    };
  };
}
```

## 文件结构

```
src/cognitive-core/
├── UnifiedCoreV2.ts              # 融合核心实现
├── example-usage.ts              # 使用示例
├── FUSION_SOLUTION.md            # 融合方案详解
├── WHY_THIS_IS_BETTER.md         # 与适配器层对比
├── README.md                     # 本文档
└── adapter/                      # 之前的适配器层（备用）
    ├── storage-adapter.ts
    ├── session-adapter.ts
    ├── format-converter.ts
    ├── api-adapter.ts
    └── ...
```

## 迁移路径

```
当前状态：
search-manager.ts
    └── HybridSearchManager (QMD + NSEM2)

迁移步骤：

Step 1: 引入 UnifiedCoreV2
    search-manager.ts
        └── HybridSearchManager (QMD + NSEM2) - 保持
        └── UnifiedCoreV2（并行运行，观察）

Step 2: 逐步切换
    search-manager.ts
        └── TripleHybrid (QMD + NSEM2 + UnifiedCoreV2)
        
Step 3: 完全替换
    search-manager.ts
        └── UnifiedCoreV2（包含所有功能）
```

## 常见问题

### Q: 这个方案和之前的适配器层有什么区别？

**A**: 
- **适配器层**：强行拼接两个系统，数据流转复杂
- **Unified Core V2**：统一入口，根据特性选择最优存储

详见 [WHY_THIS_IS_BETTER.md](./WHY_THIS_IS_BETTER.md)

### Q: 需要修改现有代码吗？

**A**: 看情况：
- **渐进迁移**：只需修改 `search-manager.ts`，添加 UnifiedCoreV2
- **特性选择**：可以只启用 8类提取，存储保持现有
- **完全切换**：需要替换整个存储层

### Q: 可以回滚吗？

**A**: 可以。改配置即可：
```typescript
// 从 hybrid 切换回 unified-nsem2
const core = createUnifiedCoreV2("my-agent", {
  storage: { mode: "unified-nsem2" }, // 改这里
});
```

### Q: 性能如何？

**A**: 取决于配置：
- `mode: "unified-nsem2"`：与现有系统相同
- `mode: "three-tier"`：内存操作，更快
- `mode: "hybrid"`：双写有开销，但可并行

### Q: 数据会丢失吗？

**A**: 不会：
- 现有数据保持不动
- 新数据根据配置写入
- 支持双写过渡（hybrid 模式）

## 下一步

1. **阅读详细方案**：[FUSION_SOLUTION.md](./FUSION_SOLUTION.md)
2. **查看使用示例**：[example-usage.ts](./example-usage.ts)
3. **对比方案**：[WHY_THIS_IS_BETTER.md](./WHY_THIS_IS_BETTER.md)
4. **开始集成**：修改 `search-manager.ts`，引入 UnifiedCoreV2

## 关键文档

| 文档 | 内容 |
|-----|------|
| [UnifiedCoreV2.ts](./UnifiedCoreV2.ts) | 核心实现代码 |
| [FUSION_SOLUTION.md](./FUSION_SOLUTION.md) | 融合方案详细说明 |
| [WHY_THIS_IS_BETTER.md](./WHY_THIS_IS_BETTER.md) | 与适配器层对比 |
| [example-usage.ts](./example-usage.ts) | 使用示例代码 |
| [adapter/](./adapter/) | 之前的适配器层（备用） |
