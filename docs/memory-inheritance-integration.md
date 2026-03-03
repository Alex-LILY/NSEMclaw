# NSEM 2.0 向量存储升级文档

## 概述

本次升级为 NSEM 2.0 记忆系统引入了高性能的向量持久化和分层存储机制，充分利用 128GB RAM + RTX 4090 + 1TB 磁盘的高性能环境。

## 主要改进

### 1. 向量持久化 (VectorStorage)

**文件**: `src/cognitive-core/storage/VectorStorage.ts`

- **SQLite 存储**: 向量数据现在存储在 SQLite 数据库中 (`~/.nsemclaw/nsem2/vectors/vectors.db`)
- **向量压缩**: 使用 Float16 压缩，节省 50% 存储空间
- **元数据索引**: 支持按 agent、标签、重要性等字段索引

### 2. 内存-磁盘分层存储

**三层存储架构**:

```
┌─────────────────────────────────────────────────────────────┐
│                        Hot Cache                            │
│              (内存中, 最近访问的 10万+ 向量)                  │
├─────────────────────────────────────────────────────────────┤
│                       Warm Cache                            │
│              (内存中, 较常访问的 50万+ 向量)                  │
├─────────────────────────────────────────────────────────────┤
│                        Cold Storage                         │
│              (磁盘 SQLite, 持久化的所有向量)                   │
└─────────────────────────────────────────────────────────────┘
```

### 3. 动态按需加载

**查找流程**:

1. 先在 Hot Cache 中查找
2. 未命中则在 Warm Cache 中查找
3. 仍未命中则从磁盘 SQLite 加载
4. 加载后自动提升到缓存

**代码示例**:

```typescript
// 透明访问，自动处理缓存未命中
const atom = this.getAtomWithFallback(id);
```

### 4. 动态内存管理

**自适应内存配置**:

```typescript
// 根据系统内存自动计算最大原子数
const availableMemory = getAvailableSystemMemory(); // e.g., 128 GB
const maxAtoms = calculateMaxAtoms(availableMemory);
// 128GB 系统可支持约 3500万 原子
```

## API 使用

### 存储向量

```typescript
import { getVectorStorage } from "./storage/VectorStorage.js";

const storage = getVectorStorage({
  baseDir: "~/.nsemclaw/vector-storage",
  compression: "float16", // 可选: 'none', 'float16', 'int8'
  hotCacheSize: 100000, // 热数据缓存大小
  warmCacheSize: 500000, // 温数据缓存大小
});

// 存储向量
storage.store(id, vector, {
  content: "记忆内容",
  importance: 0.8,
  agentId: "agent-001",
  tags: ["重要", "项目A"],
});
```

### 搜索相似向量

```typescript
// 搜索最相似的向量 (自动处理内存+磁盘)
const results = storage.search(queryVector, {
  topK: 10,
  minSimilarity: 0.5,
});
```

### 获取存储统计

```typescript
const stats = nsemCore.getStorageStats();
console.log(stats);
// {
//   memory: { atoms: 50000, edges: 120000, fields: 50 },
//   disk: { totalVectors: 2500000, hotCache: 100000, warmCache: 500000 },
//   performance: { cacheHitRate: 0.85, loadedFromDisk: 1200, savedToDisk: 50000 }
// }
```

## 性能预期

### 128GB RAM + RTX 4090 环境

| 指标       | 旧系统        | 新系统                           |
| ---------- | ------------- | -------------------------------- |
| 最大原子数 | 50,000 (固定) | 35,000,000 (动态)                |
| 向量持久化 | ❌ 仅内存     | ✅ SQLite                        |
| 重启后向量 | ❌ 需重新生成 | ✅ 从磁盘加载                    |
| 内存占用   | 100% (不稳定) | 70% 可用内存                     |
| 搜索延迟   | <100ms        | <50ms (缓存命中) / <200ms (磁盘) |
| 存储容量   | ~400MB        | ~200GB (压缩后)                  |

### 向量压缩效果

| 压缩类型 | 存储空间 | 精度损失 | 适用场景   |
| -------- | -------- | -------- | ---------- |
| none     | 100%     | 0%       | 高精度需求 |
| float16  | 50%      | <0.1%    | 默认推荐   |
| int8     | 25%      | <1%      | 海量数据   |

## 配置选项

### NSEM2Core 配置

```typescript
const nsem = await NSEM2Core.create(config, agentId, memoryConfig, {
  resourceMode: "performance", // 'minimal' | 'balanced' | 'performance'
  // maxAtoms 现在自动根据系统内存计算
  // 128GB 系统 ≈ 35M 原子
});
```

### VectorStorage 配置

```typescript
interface VectorStorageConfig {
  baseDir: string; // 存储目录
  dbName: string; // 数据库文件名
  vectorDim: number; // 向量维度 (默认 384)
  enableWAL: boolean; // 启用 WAL 模式 (默认 true)
  compression: "none" | "float16" | "int8";
  hotCacheSize: number; // 热缓存大小
  warmCacheSize: number; // 温缓存大小
}
```

## 磁盘使用估算

对于 2 年的记忆保留:

| 记忆数量 | 原始大小 | Float16 压缩 | Int8 压缩 |
| -------- | -------- | ------------ | --------- |
| 100 万   | 1.5 GB   | 750 MB       | 375 MB    |
| 1000 万  | 15 GB    | 7.5 GB       | 3.75 GB   |
| 3500 万  | 52.5 GB  | 26 GB        | 13 GB     |

> 注: 实际使用还包括 SQLite 索引开销，约增加 20-30%

## 监控和调试

### 日志输出

```
🧠 NSEM 2.0 初始化完成
   系统内存: 128.0 GB
   动态最大原子数: 35,000,000
   LRU缓存大小: 7,000,000
   向量存储: ~/.nsemclaw/nsem2/vectors
```

### 运行时统计

```typescript
// 获取详细统计
const memStats = nsemCore.getMemoryReport();
const cacheStats = nsemCore.getCacheStats();
const storageStats = nsemCore.getStorageStats();

console.log("内存使用:", memStats.heapUsed, "/", memStats.heapTotal);
console.log("缓存命中率:", storageStats.performance.cacheHitRate);
console.log("磁盘读取:", storageStats.performance.loadedFromDisk);
```

## 迁移指南

### 从旧版本升级

1. 新系统会自动创建向量存储目录
2. 旧的记忆元数据仍然兼容
3. 首次启动时会显示新的内存配置

### 数据兼容性

- ✅ 旧 SQLite 元数据表兼容
- ✅ 记忆内容存储格式不变
- ⚠️ 旧向量缓存会被清除，需要重新生成 (首次)

## 故障排除

### 磁盘空间不足

```typescript
// 使用更高的压缩率
const storage = getVectorStorage({
  compression: "int8", // 节省 75% 空间
});
```

### 内存压力

```typescript
// 减小缓存大小
const storage = getVectorStorage({
  hotCacheSize: 50000, // 减小热缓存
  warmCacheSize: 200000, // 减小温缓存
});
```

### 性能调优

```typescript
// 针对 128GB + 4090 优化
const storage = getVectorStorage({
  compression: "float16", // 平衡精度和空间
  hotCacheSize: 200000, // 更多热数据
  warmCacheSize: 1000000, // 更多温数据
  enableWAL: true, // 提高写入性能
});
```

## 未来扩展

1. **GPU 加速搜索**: 利用 RTX 4090 进行批量向量相似度计算
2. **增量快照**: 支持更快的重启恢复
3. **分布式存储**: 多 Agent 共享向量存储
4. **语义聚类**: 自动基于向量相似度聚类记忆
