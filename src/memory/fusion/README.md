# NSEM Fusion 架构

「NSEM 核心 + 元数据外链」存储层融合方案

## 架构设计

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        统一 MemorySearchManager 接口                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NSEMFusionAdapter (融合适配器)                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  搜索策略:                                                       │  │
│  │  1. 首先搜索 NSEM 核心 (vectors.db)                              │  │
│  │  2. 同时查询 Builtin 元数据 (main.sqlite) 作为外链补充            │  │
│  │  3. 合并结果，去重排序                                           │  │
│  │  4. 更新访问统计，触发渐进迁移                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌─────────────────────────────┐              ┌─────────────────────────────┐
│      NSEM 核心存储          │              │    Builtin 元数据外链       │
│  ~/.nsemclaw/nsem2/         │              │  ~/.nsemclaw/memory/        │
│  └── vectors/               │              │  └── main.sqlite (只读)     │
│      └── vectors.db         │◄────────────┤      ├── chunks (FTS)       │
│      ├── float16 压缩       │   渐进迁移   │      └── files             │
│      ├── 进化引擎           │              │                             │
│      └── 语义网络           │              │  21MB 历史数据保留          │
└─────────────────────────────┘              └─────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Fusion 元数据管理层                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │   MetadataLinker     │  │ MigrationController  │                     │
│  │  (外链关系数据库)     │  │   (渐进迁移控制器)    │                     │
│  │                      │  │                      │                     │
│  │  • atom_id ↔ chunk   │  │  • 访问频率统计       │                     │
│  │  • 内容哈希校验       │  │  • 自动迁移队列       │                     │
│  │  • 迁移状态追踪       │  │  • 批量迁移执行       │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. NSEMFusionAdapter

统一的记忆搜索管理器接口实现，整合 NSEM 和 Builtin Memory。

```typescript
const adapter = new NSEMFusionAdapter(nsem, config, agentId, {
  dualWrite: true,              // 双写模式
  progressiveMigration: true,   // 渐进迁移
  migrationThreshold: 5,        // 访问5次后迁移
  queryExternalMetadata: true,  // 查询外链数据
});
```

### 2. MetadataLinker

管理 NSEM 原子与 Builtin 块之间的外链映射关系。

- **位置**: `~/.nsemclaw/nsem2/fusion/{agentId}/metadata-links.sqlite`
- **功能**:
  - 记录 atom_id ↔ builtin_path ↔ chunk_id 映射
  - 内容哈希一致性校验
  - 访问统计和迁移状态追踪
  - 热数据缓存

### 3. MigrationController

管理从 Builtin 到 NSEM 的渐进迁移。

- **位置**: `~/.nsemclaw/nsem2/fusion/{agentId}/migration-controller.sqlite`
- **功能**:
  - 记录数据访问频率
  - 自动触发热门数据迁移
  - 迁移队列管理
  - 失败重试机制

## 配置选项

在 `nsemclaw.json` 中配置：

```json
{
  "agents": {
    "defaults": {
      "nsem": {
        "enabled": true,
        "fusion": {
          "dualWrite": true,
          "progressiveMigration": true,
          "migrationThreshold": 5,
          "keepSnapshots": true,
          "queryExternalMetadata": true
        }
      }
    }
  }
}
```

## 数据流

### 搜索流程

```
用户查询
    ↓
[NSEMFusionAdapter.search]
    ↓
┌─────────────────┬─────────────────┐
↓                 ↓
[NSEM.search]   [Builtin.query]
(核心存储)       (外链补充)
    ↓               ↓
[结果合并] ←──────┘
(去重、排序)
    ↓
[更新访问统计]
    ↓
[触发渐进迁移?]
```

### 写入流程

```
新数据
    ↓
[NSEMFusionAdapter.ingest]
    ↓
[写入 NSEM 核心] ←────── 总是执行
    ↓
[写入 Builtin]? ←─────── dualWrite 模式
```

## 渐进迁移策略

1. **访问计数**: 每次查询 Builtin 数据时增加访问计数
2. **阈值触发**: 访问次数达到阈值后标记为待迁移
3. **批量迁移**: 后台批量将数据从 Builtin 迁移到 NSEM
4. **状态追踪**: 记录迁移状态，支持失败重试

## 回滚策略

```typescript
// 创建快照
const snapshotId = await adapter.createSnapshot();

// 紧急回退到 Builtin Memory
await adapter.enableFallbackMode();

// 从快照恢复
await adapter.rollbackToSnapshot(snapshotId);
```

## 文件结构

```
~/.nsemclaw/
├── nsem2/
│   ├── vectors/
│   │   └── vectors.db          # NSEM 核心存储 (float16 压缩)
│   └── fusion/
│       └── {agentId}/
│           ├── metadata-links.sqlite      # 外链关系数据库
│           └── migration-controller.sqlite # 迁移控制器数据库
│
└── memory/
    └── {agentId}/
        └── main.sqlite         # Builtin 元数据 (只读外链)
```

## 优势

1. **不停机迁移**: 渐进式数据迁移，无需中断服务
2. **双写安全**: 过渡期内数据双写，确保不丢失
3. **回滚支持**: 快照和回退模式，风险可控
4. **性能优化**: 热门数据在 NSEM，冷数据外链查询
5. **空间节省**: NSEM float16 压缩比 Builtin 更省空间

## 监控指标

```typescript
const status = adapter.status();
console.log(status.custom);
// {
//   totalEmbeddings: 1000,
//   queryStats: { nsemHits: 800, builtinHits: 200 },
//   migrationStatus: {
//     pendingCount: 10,
//     completedCount: 50,
//     failedCount: 0
//   }
// }
```
