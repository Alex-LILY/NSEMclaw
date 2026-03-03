# SelectiveMemoryInheritance 使用指南

## 概述

选择性记忆继承系统提供了三层记忆架构，允许子 Agent 安全地从父 Agent 继承记忆，同时保持写入隔离。

## 三层记忆架构

- **Inherited (继承层)**: 从父 Agent 继承的只读记忆
- **Shared (共享层)**: 可与其他 Agent 协作读写的记忆
- **Personal (个人层)**: 完全隔离的私有记忆空间

## 核心优势

1. **零数据污染**: 子 Agent 无法修改父 Agent 的记忆
2. **零并发冲突**: 写入隔离消除了并发问题
3. **可控隐私**: 只有标记为 inheritable 的记忆才会被继承
4. **可追溯来源**: 继承的记忆带有来源追踪

## 使用示例

### 1. 父 Agent 存储可继承记忆

```typescript
const tool = createCognitiveCoreTool({ agentSessionKey: "parent-agent" });

// 存储到 shared 范围，可以被继承
await tool.execute("call-1", {
  action: "memory_store",
  agent_id: "parent-agent",
  memory_content: "重要的项目背景信息...",
  memory_scope: "shared", // shared 范围可被继承
  memory_type: "fact",
  memory_tags: ["project", "inheritable"],
  importance: 0.9,
});
```

### 2. 创建子 Agent 并继承记忆

```typescript
// 子 Agent 继承父 Agent 的记忆
await tool.execute("call-2", {
  action: "inherit_memory",
  agent_id: "child-agent",
  parent_agent_id: "parent-agent",
  inheritance_strategy: "filtered", // 使用过滤策略
  min_importance: 0.5, // 只继承重要性 >= 0.5 的记忆
  include_tags: ["inheritable"], // 只继承带有特定标签的记忆
});
```

### 3. 子 Agent 检索记忆（跨三层）

```typescript
// 检索所有层的记忆
const result = await tool.execute("call-3", {
  action: "memory_retrieve",
  agent_id: "child-agent",
  query: "项目背景",
  max_results: 10,
  // 不指定 scope，会检索 inherited + shared + personal
});

// 结果包含来源追踪
console.log(result.results);
// [
//   { id: "...", content: "...", scope: "inherited", source: "parent-agent", score: 0.95 },
//   { id: "...", content: "...", scope: "personal", score: 0.87 },
// ]
```

### 4. 子 Agent 存储自己的记忆

```typescript
// 存储到 personal 范围（默认）
await tool.execute("call-4", {
  action: "memory_store",
  agent_id: "child-agent",
  memory_content: "我的分析结果...",
  memory_scope: "personal", // 仅自己可见
  memory_type: "insight",
});

// 存储到 shared 范围（其他子 Agent 也可以访问）
await tool.execute("call-5", {
  action: "memory_store",
  agent_id: "child-agent",
  memory_content: "需要共享的发现...",
  memory_scope: "shared",
  memory_type: "insight",
});
```

### 5. 对继承记忆添加注释

```typescript
// 子 Agent 可以对继承的记忆添加自己的注释
await tool.execute("call-6", {
  action: "memory_annotate",
  agent_id: "child-agent",
  memory_id: "inherited-memory-id",
  annotation: "这条信息在我的任务中很有用，需要注意...",
});
```

### 6. 创建和恢复快照

```typescript
// 创建记忆快照（用于后续继承）
await tool.execute("call-7", {
  action: "memory_snapshot",
  agent_id: "parent-agent",
  snapshot_name: "project-context-v1",
});

// 在另一个 Agent 中恢复快照
await tool.execute("call-8", {
  action: "memory_restore",
  agent_id: "new-agent",
  snapshot_name: "project-context-v1",
});
```

### 7. 查看记忆统计

```typescript
const stats = await tool.execute("call-9", {
  action: "memory_stats",
  agent_id: "child-agent",
});

console.log(stats.stats);
// {
//   inherited: 15,  // 从父 Agent 继承的
//   shared: 8,      // 共享的
//   personal: 23,   // 私有的
//   total: 46
// }
```

## 继承策略

- **full**: 继承所有符合条件的记忆
- **filtered**: 根据标签和重要性过滤
- **summarized**: 继承时生成摘要
- **referenced**: 仅创建引用链接
- **none**: 不继承

## 最佳实践

1. **父 Agent**: 将可继承的知识存储在 `shared` 范围
2. **子 Agent**: 将个人分析和结果存储在 `personal` 范围
3. **跨协作**: 需要团队协作的知识存储在 `shared` 范围
4. **快照**: 在项目里程碑时创建快照，便于后续 Agent 继承

## 工具参数参考

| 参数                   | 类型     | 描述                                                          |
| ---------------------- | -------- | ------------------------------------------------------------- |
| `action`               | string   | 操作类型                                                      |
| `agent_id`             | string   | Agent 标识                                                    |
| `parent_agent_id`      | string   | 父 Agent 标识（用于继承）                                     |
| `memory_scope`         | string   | 记忆范围: inherited/shared/personal                           |
| `memory_content`       | string   | 记忆内容                                                      |
| `memory_type`          | string   | 记忆类型: fact/experience/insight/pattern/narrative/intuition |
| `query`                | string   | 检索查询                                                      |
| `inheritance_strategy` | string   | 继承策略: full/filtered/summarized/referenced/none            |
| `include_tags`         | string[] | 继承时包含的标签                                              |
| `exclude_tags`         | string[] | 继承时排除的标签                                              |
| `min_importance`       | number   | 最小重要性 (0-1)                                              |
| `snapshot_name`        | string   | 快照名称                                                      |
| `annotation`           | string   | 注释内容                                                      |
