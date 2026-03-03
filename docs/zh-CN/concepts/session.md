# 会话

会话是 Nsemclaw 中管理对话上下文的核心概念。

## 会话类型

### Main 会话

默认会话，用于直接对话：

```bash
nsemclaw agent --message "你好"
```

### 隔离会话

为特定任务创建的独立会话：

```bash
nsemclaw agent --message "分析代码" --session coding-task
```

### 群组会话

用于群组聊天的会话：

```bash
nsemclaw agent --message "大家好" --session group:team-chat
```

## 会话生命周期

1. **创建**: 首次发送消息时自动创建
2. **激活**: 收到新消息时激活
3. **休眠**: 一段时间无活动后进入休眠
4. **归档**: 手动归档或自动清理

## 会话上下文

会话保留以下上下文：

- 对话历史
- 工具调用结果
- 文件引用
- 用户偏好

## 管理会话

### 列出会话

```bash
nsemclaw sessions list
```

### 重置会话

```bash
nsemclaw sessions reset
```

### 删除会话

```bash
nsemclaw sessions delete <session-key>
```

## 会话策略

### 压缩 (Compaction)

当会话过长时，自动压缩历史：

```json
{
  "session": {
    "compaction": {
      "enabled": true,
      "threshold": 100
    }
  }
}
```

### 历史限制

限制保留的消息数量：

```json
{
  "session": {
    "maxHistory": 50
  }
}
```
