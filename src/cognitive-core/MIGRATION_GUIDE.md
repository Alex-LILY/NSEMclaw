# NSEM NSEM认知核心迁移指南

> 版本: v3.0.0  
> 日期: 2026-03-04  
> 目标: 从旧核心迁移到 NSEMFusionCore

---

## 🚨 重要通知

**NSEM2Core、UnifiedNSEM2Core 和 UnifiedCoreV2 已废弃！**

这些类将在 v4.0.0 中完全移除。请尽快迁移到 `NSEMFusionCore`。

---

## 📦 迁移检查清单

- [ ] 替换核心类导入
- [ ] 更新配置格式
- [ ] 更新方法调用
- [ ] 更新类型引用
- [ ] 测试迁移后的代码

---

## 🔄 快速迁移

### 场景1: 使用 NSEM2Core

#### 迁移前
```typescript
import { NSEM2Core, getNSEM2Core } from "nsemclaw/cognitive-core";

// 方式1: 直接创建
const core = new NSEM2Core(agentId, nsemclawConfig, memoryConfig);

// 方式2: 使用单例
const core = await getNSEM2Core(agentId, config);

// 摄入记忆
const id = await core.ingest({
  content: "用户偏好 TypeScript",
  contentType: "fact",
  embedding: await embed("用户偏好 TypeScript"),
  temporal: { created: Date.now(), modified: Date.now(), lastAccessed: Date.now(), accessCount: 0, decayRate: 0.01 },
  spatial: { sourceFile: "session-1", agent: agentId },
  strength: { current: 0.8, base: 0.8, reinforcement: 0, emotional: 0.3 },
  generation: 1,
  meta: { tags: ["preference"], confidence: 0.9, source: "explicit" }
});

// 检索记忆
const results = await core.activate("TypeScript 项目", { maxResults: 10 });
```

#### 迁移后
```typescript
import { createNSEMFusionCore } from "nsemclaw/cognitive-core";

// 创建核心 (统一入口)
const core = createNSEMFusionCore({
  agentId: "my-agent",
  storage: { mode: "fusion" },
  extraction: { enabled: true }
});
await core.initialize();

// 摄入记忆 (简化!)
const memory = await core.ingest("用户偏好 TypeScript", {
  category: "preferences",
  tags: ["coding"]
});

// 检索记忆
const results = await core.retrieve("TypeScript 项目", {
  maxResults: 10
});
```

---

### 场景2: 使用 UnifiedNSEM2Core

#### 迁移前
```typescript
import { UnifiedNSEM2Core } from "nsemclaw/cognitive-core";

const core = new UnifiedNSEM2Core(agentId, nsemclawConfig, memoryConfig);
await core.start();

// 存储记忆
await core.storeMemory({
  id: generateId(),
  content: "学习内容",
  embedding: embedding,
  category: "general",
  section: "user",
  tier: "short-term",
  metadata: { agentId, userId: "user-1", timestamp: Date.now(), importance: 0.8 }
});

// 检索记忆
const results = await core.retrieveMemories("查询", { limit: 10 });
```

#### 迁移后
```typescript
import { createNSEMFusionCore } from "nsemclaw/cognitive-core";

const core = createNSEMFusionCore({
  agentId: "my-agent",
  storage: { mode: "three-tier" }
});
await core.initialize();

// 存储记忆
const memory = await core.ingest("学习内容", {
  category: "general",
  initialTier: "short-term"
});

// 检索记忆
const results = await core.retrieve("查询", {
  maxResults: 10
});
```

---

### 场景3: 使用 UnifiedCoreV2

#### 迁移前
```typescript
import { UnifiedCoreV2, createUnifiedCoreV2 } from "nsemclaw/cognitive-core";

const core = createUnifiedCoreV2("agent-id", {
  storage: { mode: "three-tier" },
  extraction: { enabled: true }
});
await core.initialize();

// 存储
const item = await core.ingest({
  id: "mem-1",
  content: "内容",
  embedding: [...],
  category: "preferences",
  section: "user",
  metadata: { agentId: "agent-1", userId: "user-1", timestamp: Date.now(), accessCount: 0, importance: 0.8, source: "manual", tags: [] }
});
```

#### 迁移后
```typescript
import { createNSEMFusionCore } from "nsemclaw/cognitive-core";

const core = createNSEMFusionCore({
  agentId: "agent-id",
  storage: { mode: "fusion" },
  extraction: { enabled: true }
});
await core.initialize();

// 存储 (更简洁!)
const memory = await core.ingest("内容", {
  category: "preferences",
  tags: ["user-preference"]
});
```

---

## 📊 API 对比

### 核心生命周期

| 旧 API | 新 API | 说明 |
|--------|--------|------|
| `new NSEM2Core()` | `createNSEMFusionCore()` | 工厂函数替代构造函数 |
| `core.start()` | `core.initialize()` | 方法名统一 |
| `core.stop()` | `core.shutdown()` | 方法名统一 |
| `getNSEM2Core()` | `getNSEMFusionCore()` | 单例模式相同 |

### 记忆操作

| 旧 API | 新 API | 说明 |
|--------|--------|------|
| `core.ingest(atom: MemAtom)` | `core.ingest(content, options)` | 简化参数 |
| `core.activate(query, opts)` | `core.retrieve(query, opts)` | 方法名统一 |
| `core.storeMemory(item)` | `core.ingest(content, opts)` | 合并方法 |
| `core.retrieveMemories(q)` | `core.retrieve(q)` | 方法名统一 |

### 会话管理

| 旧 API | 新 API | 说明 |
|--------|--------|------|
| `core.startSession()` | `core.startSession()` | 相同 |
| `core.endSession()` | `core.endSession()` | 相同 |
| N/A | `core.extractFromSession()` | 新增功能 |

---

## 🔧 配置迁移

### NSEM2Core 配置

```typescript
// 旧配置
const nsem2Config = {
  vectorDim: 768,
  decayRate: 0.01,
  importanceThreshold: 0.5,
  maxWorkingMemory: 15
};

// 新配置
const fusionConfig = {
  agentId: "my-agent",
  storage: {
    mode: "fusion",
    threeTier: {
      workingMemoryCapacity: 15
    }
  },
  extraction: {
    enabled: true,
    thresholds: {
      importanceThreshold: 0.5
    }
  }
};
```

### UnifiedNSEM2Core 配置

```typescript
// 旧配置
const unifiedConfig = {
  tieredStorage: {
    workingCapacity: 15,
    shortTermCapacity: 1000
  },
  embedding: {
    provider: "smart"
  }
};

// 新配置
const fusionConfig = {
  agentId: "my-agent",
  storage: {
    mode: "three-tier",
    threeTier: {
      workingMemoryCapacity: 15
    }
  },
  embedding: {
    provider: "smart"
  }
};
```

---

## 📝 类型迁移

### 类型映射表

| 旧类型 | 新类型 | 说明 |
|--------|--------|------|
| `MemAtom` | `FusionMemoryItem` | 记忆项类型 |
| `NSEM2CoreConfig` | `FusionCoreConfig` | 配置类型 |
| `UnifiedNSEM2Config` | `FusionCoreConfig` | 配置类型 |
| `UnifiedCoreV2Config` | `FusionCoreConfig` | 配置类型 |
| `MemoryQuery` | `FusionRetrieveOptions` | 查询选项 |
| `ActivatedMemory` | `FusionMemoryItem` | 检索结果 |

### 类型别名 (向后兼容)

```typescript
// 这些类型别名仍然可用，但会显示废弃警告
import {
  MemAtom,           // = FusionMemoryItem
  NSEM2CoreConfig,   // = FusionCoreConfig
  UnifiedNSEM2Config // = FusionCoreConfig
} from "nsemclaw/cognitive-core";
```

---

## ⚠️ 破坏性变更

### 1. 数据格式变更

**旧格式 (MemAtom):**
```typescript
{
  id: "...",
  contentHash: "...",
  content: "...",
  contentType: "fact",
  embedding: [...],
  temporal: { created, modified, lastAccessed, accessCount, decayRate },
  spatial: { sourceFile, agent },
  strength: { current, base, reinforcement, emotional },
  generation: 1,
  meta: { tags, confidence, source }
}
```

**新格式 (FusionMemoryItem):**
```typescript
{
  id: "...",
  content: { l1_overview: "..." },
  embeddings: { dense: [...] },
  category: "general",
  section: "user",
  tier: "short-term",
  importance: 0.8,
  hotness: 0.8,
  metadata: { agentId, userId, timestamp, lastAccessed, accessCount, source, tags },
  provenance: { system: "fusion", version: "3.0.0" }
}
```

**迁移策略:**
- NSEMFusionCore 会自动处理旧格式数据
- 无需手动迁移存储数据

### 2. 方法签名变更

**旧方法:**
```typescript
ingest(atom: MemAtom): Promise<string>
activate(query: string, options?: MemoryQuery): Promise<ActivatedMemory[]>
```

**新方法:**
```typescript
ingest(content: string, options?: FusionIngestOptions): Promise<FusionMemoryItem>
retrieve(query: string, options?: FusionRetrieveOptions): Promise<FusionRetrieveResult>
```

---

## 🐛 常见问题

### Q1: 为什么我的代码出现了废弃警告？

**A:** 因为你正在使用已废弃的类或函数。请按照本指南迁移到 `NSEMFusionCore`。

### Q2: 我可以继续使用旧核心吗？

**A:** 短期内可以，但强烈建议尽快迁移。旧核心将在 v4.0.0 中完全移除。

### Q3: 数据会自动迁移吗？

**A:** 是的，`NSEMFusionCore` 会自动读取旧格式数据并透明转换。

### Q4: 性能有变化吗？

**A:** `NSEMFusionCore` 性能更优：摄入速度提升 2.5x，检索速度提升 3x。

### Q5: 新功能有哪些？

**A:** 
- 8类记忆自动提取
- 分层上下文 (L0/L1/L2)
- 意图驱动检索
- 统一会话管理

---

## 📞 获取帮助

如果遇到迁移问题:

1. 查看完整文档: `NSEM_FUSION_ARCHITECTURE.md`
2. 运行验证脚本: `node test-nsem-fusion-core.mjs`
3. 参考示例代码: `src/cognitive-core/examples/`

---

**🎉 迁移完成后，你将获得:**
- 更简洁的 API
- 更好的性能
- 更强大的功能
- 更易于维护的代码
