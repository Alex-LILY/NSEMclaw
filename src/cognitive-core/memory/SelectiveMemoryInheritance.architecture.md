# 选择性记忆继承系统 - 架构设计

## 🎯 核心思想

**既享受共享记忆的好处，又规避其坏处**

```
传统共享记忆的问题:
  ❌ 数据污染    → 我们的方案: 写入隔离，继承的记忆只读
  ❌ 并发冲突    → 我们的方案: 每个 Agent 写自己的空间
  ❌ 隐私泄露    → 我们的方案: 选择性继承，可控可见性
  ❌ 上下文混淆  → 我们的方案: 清晰的来源追踪和权重衰减
```

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        父 Agent (Parent)                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     个人记忆空间 (Personal)                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                            │   │
│  │  │ 记忆 A   │ │ 记忆 B   │ │ 记忆 C   │  ← 父 Agent 的私有知识      │   │
│  │  │ 标签:x   │ │ 标签:y   │ │ 标签:z   │                            │   │
│  │  └──────────┘ └──────────┘ └──────────┘                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      │ 选择性继承 (Inheritance)             │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     共享记忆空间 (Shared)                            │   │
│  │  ┌──────────┐ ┌──────────┐                                         │   │
│  │  │ 记忆 B   │ │ 记忆 C   │  ← 筛选后的可共享知识                    │   │
│  │  │ (标签:y) │ │ (标签:z) │                                         │   │
│  │  └──────────┘ └──────────┘                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ 继承 (带衰减因子和过滤)
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       子 Agent (Child)                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     继承记忆空间 (Inherited) - 只读                   │   │
│  │  ┌──────────┐ ┌──────────┐                                         │   │
│  │  │ 记忆 B'  │ │ 记忆 C'  │  ← 来自父 Agent，权重衰减 0.9            │   │
│  │  │ 只读     │ │ 只读     │  ← 可添加注释，但不可修改                 │   │
│  │  └──────────┘ └──────────┘                                         │   │
│  │                                                                     │   │
│  │  特性:                                                              │   │
│  │  • 继承权重: strength × 0.9^(层级)                                 │   │
│  │  • 可见性: 只读 (readonly)                                          │   │
│  │  • 来源追踪: 知道来自哪个父 Agent                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     共享记忆空间 (Shared) - 可读写                    │   │
│  │  ┌──────────┐ ┌──────────┐                                         │   │
│  │  │ 记忆 D   │ │ 记忆 E   │  ← 工作组共享的知识                      │   │
│  │  │ (协作产生)│ │ (协作产生)│  ← 可读写，其他 Agent 可见              │   │
│  │  └──────────┘ └──────────┘                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     个人记忆空间 (Personal) - 完全隔离                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                            │   │
│  │  │ 记忆 F   │ │ 记忆 G   │ │ 注释 B'' │  ← 完全私有                │   │
│  │  │ (私有)   │ │ (私有)   │ │ (对B的注释)│  ← 其他 Agent 不可见      │   │
│  │  └──────────┘ └──────────┘ └──────────┘                            │   │
│  │                                                                     │   │
│  │  特性:                                                              │   │
│  │  • 完全隔离写入                                                     │   │
│  │  • 零并发冲突                                                       │   │
│  │  • 可添加对继承记忆的注释                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🔄 数据流

### 读取流程 (透明跨层检索)

```
用户查询
    │
    ▼
┌─────────────────┐
│ 检索请求        │
│ retrieve()      │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│继承记忆│ │共享记忆│ │私有记忆│ │计算相关│
│(只读)  │ │(可读写)│ │(可读写)│ │性分数  │
└────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘
     │          │          │          │
     └──────────┴──────────┴──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │ 合并结果 + 加权排序  │
         │ (继承记忆 × 衰减权重)│
         └──────────┬──────────┘
                    │
                    ▼
              返回检索结果
```

### 写入流程 (完全隔离)

```
写入请求
    │
    ▼
┌─────────────────────────────┐
│ 确定作用域 (scope)           │
│ - personal: 私有             │
│ - shared: 工作组共享         │
└──────────────┬──────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│ 作用域检查   │  │ 作用域检查   │
│ personal?   │  │ shared?     │
└──────┬──────┘  └──────┬──────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│ 写入私有空间 │  │ 写入共享空间 │
│ (完全隔离)   │  │ (通知订阅者) │
└─────────────┘  └─────────────┘
       │                │
       └────────────────┘
               │
               ▼
        通知订阅者
        (push 模式)
```

## 🛡️ 如何规避共享记忆的问题

| 问题           | 传统共享记忆              | 我们的方案              | 规避原理                           |
| -------------- | ------------------------- | ----------------------- | ---------------------------------- |
| **数据污染**   | 所有 Agent 写入同一空间   | 继承记忆只读 + 写入隔离 | 子 Agent 无法修改父 Agent 的记忆   |
| **并发冲突**   | 多 Agent 竞争写入         | 每个 Agent 写自己的空间 | 写操作完全隔离，无锁竞争           |
| **隐私泄露**   | 所有信息对所有 Agent 可见 | 选择性继承 + 过滤器     | 只有符合过滤条件的记忆才会被继承   |
| **上下文混淆** | 分不清记忆来源            | 来源追踪 + 权重衰减     | 每条继承记忆都有来源标记和权重     |
| **性能瓶颈**   | 单一存储热点              | 读取时合并，写入时分散  | 读性能通过缓存优化，写性能天然分散 |

## 📦 三层记忆空间详解

### 1. Inherited (继承层) - 只读

```typescript
// 来自父 Agent 的记忆
{
  atom: MemAtom;                    // 原始记忆
  source: {
    agentId: "parent-agent",       // 来源 Agent
    level: 1,                       // 继承层级
    originalTimestamp: 1234567890  // 原始时间
  },
  inheritanceWeight: 0.9,           // 继承权重 (衰减后)
  visibility: "readonly",           // 只读
  scope: "inherited"
}
```

**特性**:

- 只能读取，不能直接修改
- 可以添加注释（创建新的 personal 记忆关联）
- 继承权重随层级衰减: `weight = original × decay^level`

### 2. Shared (共享层) - 可读写

```typescript
// 工作组共享的记忆
{
  id: "mem-xxx",
  content: "项目使用 React 18",
  scope: "shared",
  // 可读写
}
```

**特性**:

- 当前 Agent 可以读写
- 其他 Agent 可以读取
- 写入时通知订阅者

### 3. Personal (私有层) - 完全隔离

```typescript
// 完全私有的记忆
{
  id: "mem-yyy",
  content: "我的实验性想法...",
  scope: "personal",
  // 完全隔离
}
```

**特性**:

- 只有当前 Agent 可见
- 零并发冲突
- 包含对继承记忆的注释

## 🔧 与现有系统集成

### 与 NSEM2Core 集成

```typescript
// 在 IntegratedNSEM2Core 中使用
class IntegratedNSEM2Core {
  private inheritance: SelectiveMemoryInheritance;

  async inheritFromParent(parentAgentId: string) {
    const parentMemories = await getParentMemories(parentAgentId);
    await this.inheritance.inheritFromParent(parentAgentId, parentMemories);
  }

  async ingest(content: string, options: { scope?: MemoryScope } = {}) {
    // 存储到指定作用域
    return this.inheritance.store(content, {
      scope: options.scope || "personal",
      ...
    });
  }

  async activate(query: MemoryQuery) {
    // 跨层检索
    const results = await this.inheritance.retrieve(query.intent, {
      scopes: ["inherited", "shared", "personal"],
      includeInherited: true
    });
    return results;
  }
}
```

### 与 ResilientSubagentOrchestrator 集成

```typescript
// 在创建子 Agent 时自动继承
class ResilientSubagentOrchestrator {
  async spawnChildAgent(
    parentId: string,
    childId: string,
    config: {
      inheritanceStrategy: InheritanceStrategy;
      filter?: MemoryFilter;
    },
  ) {
    // 创建子 Agent 的协调器
    const childOrchestrator = createResilientSubagentOrchestrator(childId);

    // 获取父 Agent 的记忆继承系统
    const parentInheritance = this.getInheritanceSystem(parentId);

    // 子 Agent 继承父 Agent 的记忆
    const childInheritance = createSelectiveMemoryInheritance(childId, {
      strategy: config.inheritanceStrategy,
      parentChain: [parentId, ...this.getParentChain(parentId)],
      filter: config.filter,
    });

    // 执行继承
    const parentMemories = await parentInheritance.getAllMemories();
    await childInheritance.inheritFromParent(parentId, parentMemories);

    // 存储子 Agent 的继承系统
    this.inheritanceSystems.set(childId, childInheritance);

    return childOrchestrator;
  }
}
```

## 🎮 使用示例

### 场景 1: Agent 链式继承

```typescript
// 1. 创建父 Agent
const parent = createSelectiveMemoryInheritance("parent-agent");
await parent.store("用户偏好使用 TypeScript", { type: "preference", tags: ["language"] });
await parent.store("项目使用 React", { type: "config", tags: ["framework"] });
await parent.store("我的临时想法...", { type: "thought", tags: ["private"] });

// 2. 父 Agent 创建子 Agent，并配置继承规则
const child = createSelectiveMemoryInheritance("child-agent", {
  strategy: "filtered",
  parentChain: ["parent-agent"],
  filter: {
    includeTags: ["language", "framework"], // 只继承语言和框架相关
    excludeTags: ["private"], // 不继承私有标签
    minImportance: 0.6,
  },
  maxInheritedMemories: 100,
  inheritanceDecay: 0.9,
});

// 3. 执行继承
const parentMemories = await getAllMemories(parent);
await child.inheritFromParent("parent-agent", parentMemories);

// 结果:
// child 继承了:
//   - "用户偏好使用 TypeScript" (标签: language)
//   - "项目使用 React" (标签: framework)
// child 没有继承:
//   - "我的临时想法..." (标签: private)

// 4. 子 Agent 检索
const results = await child.retrieve("技术栈", {
  scopes: ["inherited", "personal"], // 搜索继承 + 私有
});
// 结果包含继承的记忆，但标注为 inherited
```

### 场景 2: 添加注释

```typescript
// 子 Agent 对继承的记忆有异议
const inheritedMemory = child.getInheritedMemory("mem-xxx");
// 内容: "项目使用 React"

// 子 Agent 可以添加注释，但不能修改原文
await child.annotateInherited("mem-xxx", "备注: 实际上我们正在迁移到 Vue");

// 注释存储在 child 的 personal 空间
// 原文仍然保持 "项目使用 React"
// 但检索时会同时显示注释
```

### 场景 3: 记忆订阅

```typescript
// 子 Agent 订阅特定主题
const subscription = child.subscribe(["api-change", "breaking-change"], {
  mode: "push",
  callback: (memories) => {
    console.log("收到 API 变更通知:", memories);
  },
});

// 父 Agent 更新 API 相关记忆
await parent.store("API v2 已发布", {
  type: "announcement",
  tags: ["api-change"],
  scope: "shared", // 写入共享空间
});

// 子 Agent 自动收到推送
```

### 场景 4: 快照和回滚

```typescript
// 创建快照
const snapshot = child.createSnapshot("项目启动时", {
  description: "初始继承的记忆状态",
  tags: ["milestone", "initial"],
});

// 子 Agent 继续工作，添加新记忆...
await child.store("发现新的 Bug...", { type: "finding" });

// 如果需要回滚到初始状态
await child.restoreSnapshot(snapshot.id);
```

## 📊 性能特点

| 操作     | 时间复杂度 | 空间复杂度 | 说明                       |
| -------- | ---------- | ---------- | -------------------------- |
| 继承     | O(n)       | O(k)       | n=父记忆数, k=过滤后数量   |
| 检索     | O(n log n) | O(1)       | n=总记忆数, 使用索引可优化 |
| 写入     | O(1)       | O(1)       | 直接写入自己的空间         |
| 订阅通知 | O(m)       | O(1)       | m=订阅者数量               |

## ✅ 优势总结

1. **零数据污染**: 继承的记忆只读，写入完全隔离
2. **零并发冲突**: 每个 Agent 写自己的空间
3. **可控隐私**: 选择性继承 + 过滤器
4. **来源可追溯**: 每条继承记忆都有来源标记
5. **与现有系统兼容**: 基于 NSEM2Core 类型设计
6. **渐进式采用**: 可以从隔离开始，按需启用继承
