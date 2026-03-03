# 修复：选择性记忆继承系统错误地为主 Agent 创建

## 问题描述

日志显示：
```
13:15:46 [cognitive-core-tool] 为 Agent agent:main:main 创建选择性记忆继承系统 (持久化)
```

**选择性记忆继承系统** (`SelectiveMemoryInheritance`) 是专为 **子 Agent (Subagent)** 设计的，用于：
- 从父 Agent 继承记忆
- 三层隔离：Inherited/Shared/Personal
- 避免记忆污染

**主 Agent**（如 `agent:main:main`）应该直接使用 **NSEM2Core** 的完整记忆系统，不需要"继承"自己的记忆。

## 影响

1. **记忆永远在浅层**：主 Agent 使用继承系统时，只访问 "Personal" 层，错过了 NSEM2Core 的完整认知图谱
2. **不必要的存储开销**：为主 Agent 创建了额外的 SQLite 数据库
3. **功能冗余**：主 Agent 不需要"继承"功能

## 修复方案

### 1. 添加主 Agent 检测

```typescript
function isSubAgent(agentId: string): boolean {
  // 主 agent 模式
  const mainAgentPatterns = [
    /^agent:main:/i,
    /^main$/i,
    /^default$/i,
  ];
  
  // 如果匹配主 agent 模式，不是 subagent
  if (mainAgentPatterns.some(p => p.test(agentId))) {
    return false;
  }
  
  // 子 Agent 模式检测...
  return subAgentPatterns.some(p => p.test(agentId));
}
```

### 2. 修改 `getInheritanceSystem`

```typescript
export function getInheritanceSystem(
  agentId: string,
  parentAgentId?: string,
): SelectiveMemoryInheritance | null {  // 可能返回 null
  
  // 主 Agent 不需要继承系统
  if (!parentAgentId && !isSubAgent(agentId)) {
    log.debug(`Agent ${agentId} 是主 Agent，跳过创建选择性记忆继承系统`);
    return null;
  }
  
  // ... 创建继承系统
}
```

### 3. 处理 null 返回值

所有调用处都添加了 null 检查：

```typescript
const inheritance = getInheritanceSystem(agentId);
if (!inheritance) {
  return jsonResult({ 
    status: "error", 
    error: `Agent ${agentId} 是主 Agent，请直接使用 NSEM2Core` 
  });
}
```

## 修复后的行为

| Agent 类型 | ID 示例 | 继承系统 | 记忆访问方式 |
|-----------|--------|---------|-------------|
| **主 Agent** | `agent:main:main`, `main` | ❌ 不创建 | 直接访问 NSEM2Core |
| **子 Agent** | `subagent-xxx`, `task-yyy` | ✅ 创建 | 三层隔离 (Inherited/Shared/Personal) |

## 日志对比

### 修复前
```
[cognitive-core-tool] 为 Agent agent:main:main 创建选择性记忆继承系统 (持久化)
```

### 修复后
```
[cognitive-core-tool] Agent agent:main:main 是主 Agent，跳过创建选择性记忆继承系统
[nsem-fusion] 融合搜索: "xxx" (NSEM 61原子 + QMD/Builtin)
```

## 相关文件

- `src/agents/tools/cognitive-core-tool.ts` - 核心修复
- `src/agents/subagent-spawn.ts` - 子 Agent 创建时的处理
