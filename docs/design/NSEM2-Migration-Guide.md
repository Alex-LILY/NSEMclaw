# NSEM2 统一核心迁移指南

## 概述

本文档描述从旧版分散组件迁移到 `UnifiedNSEM2Core` 的步骤。

## 组件对照表

| 旧组件                                 | 新组件                      | 迁移难度 | 说明          |
| -------------------------------------- | --------------------------- | -------- | ------------- |
| `NSEM2Core`                            | `UnifiedNSEM2Core`          | 低       | API基本兼容   |
| `IntegratedNSEM2Core`                  | `UnifiedNSEM2Core`          | 低       | 功能已合并    |
| `ThreeTierMemoryStore`                 | `UnifiedNSEM2Core` 内置     | 中       | 配置方式变化  |
| `PersistentSelectiveMemoryInheritance` | `UnifiedNSEM2Core` + scope  | 中       | 使用scope参数 |
| `cognitive-core-tool.ts`               | `unified-cognitive-tool.ts` | 低       | action简化    |

## 迁移步骤

### 1. 替换核心创建代码

**旧代码:**

```typescript
import { NSEM2Core } from "./mind/nsem/NSEM2Core.js";
// 或
import { IntegratedNSEM2Core } from "./integration/IntegratedNSEM2Core.js";

const core = await NSEM2Core.create(cfg, agentId, memoryConfig);
// 或
const core = await IntegratedNSEM2Core.create(cfg, agentId, memoryConfig, {
  enableThreeTierStorage: true,
  enableEnhancedScoring: true,
});
```

**新代码:**

```typescript
import { createUnifiedNSEM2Core } from "./mind/nsem/UnifiedNSEM2Core.js";

const core = await createUnifiedNSEM2Core(cfg, agentId, memoryConfig, {
  // 所有功能默认启用，无需额外配置
  tieredStorage: {
    workingCapacity: 15,
    shortTermCapacity: 1000,
    autoTierTransition: true,
  },
  enhancedRetrieval: {
    enabled: true,
    contentWeight: 0.5,
    temporalWeight: 0.2,
    importanceWeight: 0.2,
  },
  // 新增功能
  batchLoading: { enabled: true, batchSize: 100 },
  asyncWrite: { enabled: true, maxQueueSize: 1000 },
  modelLoading: { strategy: "load-all" }, // 配置允许时全部加载
});
```

### 2. 更新工具注册

**旧代码:**

```typescript
import { createCognitiveCoreTool } from "./tools/cognitive-core-tool.js";

const tools = [createCognitiveCoreTool({ agentSessionKey })];
```

**新代码:**

```typescript
import {
  createUnifiedCognitiveTool,
  registerCoreInstance,
} from "./tools/unified-cognitive-tool.js";

// 先注册核心实例
registerCoreInstance(agentId, core);

const tools = [createUnifiedCognitiveTool({ agentId })];
```

### 3. 更新 Action 调用

**旧代码 (20+ actions):**

```typescript
// 选择性记忆继承
action: "inherit_memory",
parent_agent_id: "parent-1",
inheritance_strategy: "filtered",

// 记忆操作
action: "memory_store",
memory_scope: "personal",
memory_content: "...",

action: "memory_retrieve",
query: "...",
memory_scope: "shared",

// 三层存储
action: "memory_retrieve",
memory_tier: "working",

// 协作和弹性
action: "collaboration_start",
strategy: "parallel-fast",

action: "resilient_execute",
task_name: "...",
```

**新代码 (6 actions):**

```typescript
// 存储记忆 (自动处理作用域)
action: "memory.store",
scope: "personal", // 或 "shared", "inherited"
content: "...",
type: "fact",
tags: ["important"],
importance: 0.8,

// 检索记忆 (自动搜索所有层级)
action: "memory.retrieve",
query: "...",
scope: "all", // 或指定 "personal", "shared", "inherited"
maxResults: 10,
strategy: "focused", // "focused" | "exploratory" | "associative"

// 遗忘记忆
action: "memory.forget",
memoryId: "...",

// 获取统计
action: "memory.stats",

// 触发进化
action: "memory.evolve",

// 动态配置
action: "memory.configure",
config: {
  tieredStorage: { workingCapacity: 20 },
},
```

### 4. 三层存储使用方式变化

**旧代码 (使用 ThreeTierMemoryStore):**

```typescript
import { ThreeTierMemoryStore } from "./memory/ThreeTierMemoryStore.js";

const store = new ThreeTierMemoryStore({
  workingMemoryCapacity: 15,
  autoTierTransition: true,
});

await store.ingest(atom);
const results = await store.retrieve(query);
```

**新代码 (UnifiedNSEM2Core 内置):**

```typescript
// 无需额外创建，核心已集成三层存储
// 通过配置启用
const core = await createUnifiedNSEM2Core(cfg, agentId, memoryConfig, {
  tieredStorage: {
    workingCapacity: 15,
    shortTermCapacity: 1000,
    autoTierTransition: true, // 自动升降级
  },
});

// 使用方式不变
await core.ingest(content, { scope: "personal" });
const result = await core.activate(query);

// 获取三层统计
const stats = core.getStats();
console.log(stats.memory.working); // 工作记忆数量
console.log(stats.memory.shortTerm); // 短期记忆数量
```

### 5. 选择性记忆继承迁移

**旧代码 (PersistentSelectiveMemoryInheritance):**

```typescript
import { createPersistentSelectiveMemoryInheritance } from "./memory/PersistentSelectiveMemoryInheritance.js";

const inheritance = createPersistentSelectiveMemoryInheritance(agentId, {
  strategy: "filtered",
  parentChain: [parentAgentId],
});

// 继承记忆
await inheritance.inheritFromParent(parentAgentId, parentMemories);

// 按作用域检索
const results = await inheritance.retrieve(query, {
  scopes: ["inherited", "personal"],
});
```

**新代码 (使用 scope 参数):**

```typescript
// 创建时指定作用域
const core = await createUnifiedNSEM2Core(cfg, agentId, memoryConfig);

// 存储到特定作用域
await core.ingest(content, { scope: "inherited" });

// 按作用域检索
const result = await core.retrieveByScope(query, ["inherited", "personal"]);

// 获取继承统计
const stats = core.getStats();
// stats 中包含各作用域的分布
```

### 6. 批量操作使用

**新增功能 - 批量摄入:**

```typescript
const result = await core.ingestBatch(
  [
    { content: "记忆1", type: "fact", scope: "personal" },
    { content: "记忆2", type: "insight", scope: "shared" },
    // ... 更多
  ],
  {
    onProgress: (completed, total) => {
      console.log(`Progress: ${completed}/${total}`);
    },
  },
);

console.log(`成功: ${result.succeeded}, 失败: ${result.failed}`);
console.log(`耗时: ${result.durationMs}ms`);
```

**新增功能 - 批量检索:**

```typescript
const results = await core.retrieveBatch(
  [{ intent: "查询1" }, { intent: "查询2" }, { intent: "查询3" }],
  {
    maxResultsPerQuery: 5,
  },
);
```

## 配置对比

### 完整配置对比

```typescript
// 旧版 IntegratedNSEM2Config
interface IntegratedNSEM2Config {
  enableThreeTierStorage: boolean;
  threeTierConfig?: Partial<ThreeTierMemoryConfig>;
  enableEnhancedScoring: boolean;
  scoringConfig?: Partial<ScoringConfig>;
  enableDecisionIntegration: boolean;
  syncIntervalMs: number;
}

// 新版 UnifiedNSEM2Config
interface UnifiedNSEM2Config {
  // 原有配置
  rootDir: string;
  agentId: string;
  maxAtoms: number;
  evolutionInterval: number;

  // 三层存储 (替代 ThreeTierMemoryStore)
  tieredStorage: {
    workingCapacity: number;
    shortTermCapacity: number;
    autoTierTransition: boolean;
    tierCheckIntervalMs: number;
  };

  // 增强检索 (替代 EnhancedRetrievalScorer)
  enhancedRetrieval: {
    enabled: boolean;
    contentWeight: number;
    temporalWeight: number;
    importanceWeight: number;
    frequencyWeight: number;
  };

  // 批量加载 (新增)
  batchLoading: {
    enabled: boolean;
    batchSize: number;
    maxConcurrent: number;
  };

  // 异步写入 (新增)
  asyncWrite: {
    enabled: boolean;
    maxQueueSize: number;
    flushIntervalMs: number;
  };

  // 动态模型加载 (P1)
  modelLoading: {
    strategy: "load-all" | "on-demand" | "adaptive";
    fallbackStrategy: "on-demand" | "minimal";
    priorityOrder: string[];
  };

  // 系统资源检测 (P1)
  systemResource: {
    monitoringIntervalMs: number;
    memoryWarningPercent: number;
    autoAdjust: boolean;
  };
}
```

## 废弃功能说明

| 功能                            | 状态 | 替代方案                  |
| ------------------------------- | ---- | ------------------------- |
| `inherit_memory` action         | 废弃 | 使用 `scope: "inherited"` |
| `memory_snapshot` action        | 废弃 | 使用外部备份              |
| `memory_restore` action         | 废弃 | 使用外部恢复              |
| `collaboration_*` actions       | 废弃 | 使用独立协作系统          |
| `resilient_execute` action      | 废弃 | 使用独立弹性系统          |
| `circuit_breaker_status` action | 废弃 | 使用独立监控系统          |
| `dead_letter_*` actions         | 废弃 | 使用独立队列系统          |
| `monitor_status` action         | 废弃 | 使用 `memory.stats`       |

## 调试和监控

### 获取详细统计

```typescript
const stats = core.getStats();

// 内存分布
console.log("Working memory:", stats.memory.working);
console.log("Short-term memory:", stats.memory.shortTerm);

// 缓存性能
console.log("Cache hit rate:", stats.cache.hitRate);

// 异步队列状态
console.log("Pending writes:", stats.queue.pendingCount);

// 系统资源
console.log("Available memory:", stats.resources.memory.available);
console.log("CPU usage:", stats.resources.cpu.usagePercent);
```

### 日志输出

统一核心使用 `createSubsystemLogger("nsem2-unified")`，可通过环境变量控制日志级别：

```bash
DEBUG=nsem2-unified node app.js  # 查看详细日志
```

## 回滚计划

如需回滚到旧版，保留以下备份：

1. **代码备份**: 保留旧组件文件副本
2. **数据备份**: VectorStorage 数据格式不变，可直接回滚
3. **配置备份**: 记录旧版配置参数

回滚步骤：

1. 恢复旧代码文件
2. 更新导入路径
3. 恢复旧配置
4. 重启服务

## 性能对比预期

| 指标            | 旧版   | 新版  | 预期提升 |
| --------------- | ------ | ----- | -------- |
| 单条摄入        | ~50ms  | ~20ms | 2.5x     |
| 批量摄入(100条) | ~5s    | ~1s   | 5x       |
| 检索延迟        | ~100ms | ~30ms | 3x       |
| 内存占用        | 基准   | -30%  | 30%      |
| 代码行数        | ~4000  | ~2000 | 50%      |

## 问题排查

### 常见问题

**Q: 迁移后记忆丢失？**
A: 数据存储格式不变，检查 `rootDir` 配置是否一致。

**Q: 批量操作失败？**
A: 检查 `batchLoading.batchSize` 和 `asyncWrite.maxQueueSize` 配置。

**Q: 检索结果不一致？**
A: 新版使用增强评分算法，调整 `enhancedRetrieval` 权重配置。

**Q: 内存使用异常？**
A: 检查 `tieredStorage` 容量配置，启用 `systemResource.autoAdjust`。

## 迁移检查清单

- [ ] 替换核心创建代码
- [ ] 更新工具注册
- [ ] 更新 action 调用
- [ ] 调整三层存储配置
- [ ] 迁移选择性继承逻辑
- [ ] 测试批量操作
- [ ] 验证统计信息
- [ ] 性能基准测试
- [ ] 更新文档
- [ ] 部署到生产环境
