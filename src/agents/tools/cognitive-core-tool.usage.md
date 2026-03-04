# Cognitive Core Tool 使用指南

## 概述

Cognitive Core Tool 让主 Agents 能够使用 NSEM2 NSEM认知核心的高级功能，包括：

- **三层记忆存储**: 工作记忆、短期记忆、长期记忆
- **弹性子代理协调**: 断路器、智能重试、超时控制、死信队列
- **多智能体协作**: 任务分配、协作策略、结果聚合
- **系统监控**: 健康度、负载、性能趋势

## 可用 Actions

### 1. memory_store - 存储记忆

```json
{
  "action": "memory_store",
  "memory_content": "用户喜欢深色模式界面",
  "memory_type": "fact",
  "memory_tags": ["preference", "ui"]
}
```

### 2. memory_retrieve - 检索记忆

```json
{
  "action": "memory_retrieve",
  "query": "用户偏好",
  "memory_tier": "working"
}
```

### 3. memory_stats - 记忆统计

```json
{
  "action": "memory_stats"
}
```

### 4. collaboration_start - 启动协作会话

```json
{
  "action": "collaboration_start",
  "strategy": "parallel-fast"
}
```

策略选项:

- `parallel-fast`: 并行快速执行
- `sequential-quality`: 顺序高质量执行
- `hierarchical-adaptive`: 分层自适应执行

### 5. collaboration_task - 添加协作任务

```json
{
  "action": "collaboration_task",
  "session_id": "collab-xxx",
  "task_description": "分析代码质量",
  "task_content": "请分析 src/index.ts 的代码质量",
  "task_type": "analysis",
  "priority": 8
}
```

### 6. collaboration_status - 获取协作状态

```json
{
  "action": "collaboration_status",
  "session_id": "collab-xxx"
}
```

### 7. resilient_execute - 配置弹性任务

```json
{
  "action": "resilient_execute",
  "task_name": "api-call",
  "timeout": 30000,
  "use_circuit_breaker": true,
  "use_retry": true,
  "max_retries": 3
}
```

### 8. circuit_breaker_status - 断路器状态

```json
{
  "action": "circuit_breaker_status",
  "task_name": "api-call"
}
```

### 9. dead_letter_queue - 死信队列状态

```json
{
  "action": "dead_letter_queue"
}
```

### 10. dead_letter_replay - 重放死信

```json
{
  "action": "dead_letter_replay",
  "entry_id": "dlq-xxx"
}
```

或批量重放:

```json
{
  "action": "dead_letter_replay",
  "replay_filter": "retryable"
}
```

过滤器选项: `all`, `retryable`, `transient`, `permanent`

### 11. monitor_status - 系统监控

```json
{
  "action": "monitor_status"
}
```

## 使用示例

### 场景 1: 存储用户偏好并检索

1. 存储偏好:

```json
{
  "action": "memory_store",
  "memory_content": "用户偏好使用 TypeScript 而不是 JavaScript",
  "memory_type": "preference",
  "memory_tags": ["language", "typescript"]
}
```

2. 检索相关记忆:

```json
{
  "action": "memory_retrieve",
  "query": "编程语言偏好"
}
```

### 场景 2: 协调多个子代理完成任务

1. 启动协作会话:

```json
{
  "action": "collaboration_start",
  "strategy": "hierarchical-adaptive"
}
```

2. 添加多个任务:

```json
{
  "action": "collaboration_task",
  "session_id": "collab-abc123",
  "task_description": "需求分析",
  "task_content": "分析项目需求文档",
  "task_type": "analysis",
  "priority": 9
}
```

```json
{
  "action": "collaboration_task",
  "session_id": "collab-abc123",
  "task_description": "架构设计",
  "task_content": "基于需求设计系统架构",
  "task_type": "generation",
  "priority": 8
}
```

3. 监控进度:

```json
{
  "action": "collaboration_status",
  "session_id": "collab-abc123"
}
```

### 场景 3: 使用弹性执行保护外部 API 调用

1. 配置弹性任务:

```json
{
  "action": "resilient_execute",
  "task_name": "github-api",
  "timeout": 10000,
  "use_circuit_breaker": true,
  "use_retry": true,
  "max_retries": 3
}
```

2. 检查断路器状态:

```json
{
  "action": "circuit_breaker_status",
  "task_name": "github-api"
}
```

### 场景 4: 处理失败任务

1. 查看死信队列:

```json
{
  "action": "dead_letter_queue"
}
```

2. 重放特定失败任务:

```json
{
  "action": "dead_letter_replay",
  "entry_id": "dlq-xxx"
}
```

3. 批量重放所有可重试任务:

```json
{
  "action": "dead_letter_replay",
  "replay_filter": "retryable"
}
```

### 场景 5: 监控系统健康

```json
{
  "action": "monitor_status"
}
```

返回示例:

```json
{
  "health": 0.95,
  "load": 0.3,
  "performance_trend": "stable",
  "error_rate": 0.02,
  "active_operations": 5,
  "stats": {
    "total_operations": 150,
    "success_rate": 0.98,
    "avg_quality": 0.85
  }
}
```

## 集成到 Agent 系统

Cognitive Core Tool 已自动集成到 OpenClaw 工具系统，主 Agents 可以直接通过 `cognitive_core` 工具调用。

工具会自动:

- 为每个 agent session 创建独立的协调器实例
- 管理内存和生命周期
- 提供线程安全的操作

## 注意事项

1. **记忆存储**: 当前为简化实现，实际存储需要配置 IntegratedNSEM2Core
2. **弹性执行**: `resilient_execute` 配置任务参数，实际执行需配合其他工具
3. **会话隔离**: 不同 agent session 的数据完全隔离
4. **资源管理**: 协调器实例会在 session 结束后自动清理
