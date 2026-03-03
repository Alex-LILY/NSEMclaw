# 修复：memory_stats 显示 0 的问题

## 问题描述

`memory_stats` 和 `memory status` 命令显示记忆数量为 0，原因是：

1. **旧存储格式**：Builtin memory 使用 `chunks` 表存储向量
2. **新存储格式**：NSEM 2.0 使用 `vectors` 表存储向量
3. **代码问题**：`MemoryIndexManager.status()` 只查询了旧的 `chunks` 表

## 修复方案

修改 `src/memory/manager.ts` 中的 `status()` 方法：

1. **自动检测存储格式**：检查是否存在 `vectors` 表
2. **优先查询新格式**：如果存在 `vectors` 表，查询它
3. **回退到旧格式**：如果不存在，查询 `chunks` 表
4. **添加格式标识**：在状态中添加 `storageFormat` 字段

## 代码变更

### manager.ts
```typescript
status(): MemoryProviderStatus {
  // ... 检测存储格式
  let vectorCount = 0;
  let storageFormat: "nsem-vectors" | "legacy-chunks" | "unknown" = "unknown";
  
  try {
    // 检查是否存在 vectors 表 (NSEM 格式)
    const vectorTableExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vectors'")
      .get();
    
    if (vectorTableExists) {
      // 查询 NSEM vectors 表
      const vectors = this.db.prepare("SELECT COUNT(*) as c FROM vectors...").get();
      vectorCount = vectors?.c ?? 0;
      storageFormat = "nsem-vectors";
    } else {
      // 回退到旧的 chunks 表
      const chunks = this.db.prepare("SELECT COUNT(*) as c FROM chunks...").get();
      vectorCount = chunks?.c ?? 0;
      storageFormat = "legacy-chunks";
    }
  } catch (err) {
    log.warn(`获取向量统计失败: ${err}`);
  }
  
  return {
    backend: "builtin",
    files: files?.c ?? 0,
    chunks: vectorCount,  // 使用正确的统计
    storageFormat,        // 标识存储格式
    // ...
  };
}
```

### types.ts
```typescript
export type MemoryProviderStatus = {
  // ...
  /** 存储格式标识 */
  storageFormat?: "nsem-vectors" | "legacy-chunks" | "unknown";
  custom?: Record<string, unknown>;
};
```

## 验证

```bash
# 查看状态
nsemclaw memory status

# 预期输出
{
  "backend": "builtin",
  "files": 10,
  "chunks": 61,           # 正确显示向量数量
  "storageFormat": "nsem-vectors",  # 标识使用的是 NSEM 格式
  // ...
}
```

## 向后兼容

- 如果数据库仍在使用旧的 `chunks` 表，会自动检测并查询
- 如果已迁移到新的 `vectors` 表，会优先查询新表
- 添加 `storageFormat` 字段帮助调试和监控
