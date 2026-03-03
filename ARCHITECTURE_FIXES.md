# Nsemclaw 架构修复总结

## 已修复问题

### 1. ✅ VectorStorage 全局单例问题
**文件**: `src/cognitive-core/storage/VectorStorage.ts`

**问题**: 使用全局单例导致多 Agent 数据隔离失效
```typescript
// 修复前
let globalVectorStorage: VectorStorage | null = null;

// 修复后
const storageInstances = new Map<string, VectorStorage>();
const storageRefCounts = new Map<string, number>();
```

**修复内容**:
- 按 `baseDir:vectorDim` 组合键缓存实例
- 添加引用计数管理
- 新增 `releaseVectorStorage()` 和 `getVectorStorageStats()` 函数

---

### 2. ✅ NSEMFusionAdapter 快照空实现
**文件**: `src/memory/fusion/nsem-fusion-adapter.ts`

**问题**: `createSnapshot()` 和 `rollbackToSnapshot()` 是空实现，误导调用者

**修复内容**:
- 抛出明确的错误，说明功能未实现
- 添加 `@deprecated` 标记

---

### 3. ✅ HybridSearchManager 静默失败
**文件**: `src/memory/hybrid-search-manager.ts`

**问题**: 使用 `Promise.allSettled` 静默忽略错误，调用者不知道搜索部分失败

**修复内容**:
- 新增 `propagateErrors` 配置选项（"never" | "partial" | "always"）
- 默认 "never" 保持兼容
- 两个系统都失败时总是抛出错误

---

### 4. ✅ Subagent Registry Timer 泄漏
**文件**: `src/agents/subagent-registry.ts`

**问题**: 多处 `setTimeout` 未保存引用，无法清理；sweeper 未正确 unref

**修复内容**:
- 新增 `activeTimers` Map 追踪活动 timer
- 新增 `setRunTimer()` / `clearRunTimers()` 辅助函数
- 在 `clearPendingLifecycleError()` 中自动清理 timers

---

### 5. ✅ NSEM2Core 进化锁阻塞
**文件**: `src/cognitive-core/mind/nsem/NSEM2Core.ts`

**问题**: `mergeFields()` 是 O(n²) 操作，长时间持有锁阻塞其他操作

**修复内容**:
- 新增 `mergeFieldsChunked()` 分批处理场合并
- 每批处理 50 个场后让出事件循环
- 添加 `yieldToEventLoop()` 辅助函数

---

### 6. ✅ 网关启动回滚机制
**文件**: `src/gateway/server.impl.ts`

**问题**: 启动失败时，已初始化的资源未清理

**修复内容**:
- 新增 `GatewayCleanupManager` 类
- 在 `startGatewayServer()` 中添加 try-catch-finally
- 失败时执行注册的清理函数

---

### 7. ✅ 配置写入竞争条件
**文件**: `src/config/io.ts`

**问题**: 多处并发调用 `writeConfigFile` 可能导致文件损坏

**修复内容**:
- 新增 `configWriteQueue` Promise 链
- 添加 `configWriteLock` 锁机制
- 排队等待前一个写入完成

---

### 8. ✅ QMD 缓存竞态
**文件**: `src/memory/backend-config.ts`

**问题**: 缓存过期时，多个并发调用可能同时执行 `execSync`

**修复内容**:
- 新增 `qmdCheckInProgress` 锁
- 检查进行中时返回缓存值或默认值
- 避免并发执行 `execSync`

---

### 9. ✅ VectorStorage 冷数据全表扫描
**文件**: `src/cognitive-core/storage/VectorStorage.ts`

**问题**: `searchFromDisk` 加载所有冷数据到内存，O(n) 复杂度

**修复内容**:
- 分批查询，每批 1000 条
- 最多扫描 10000 条后停止
- 避免一次性加载大量数据

---

### 10. ⚠️ 循环依赖风险（记录待解决）

**问题模式**:
```
cognitive-core → agents → cognitive-core
memory → cognitive-core → memory
```

**短期缓解**:
- 使用 `type` 导入减少运行时依赖
- 延迟加载（动态 import）

**长期解决方案**:
- 将共享类型提取到 `src/types/` 目录
- 重新划分模块边界
- 使用依赖注入模式

---

## 构建状态

✅ 所有修复已通过 TypeScript 编译检查
```bash
pnpm run build  # 成功
```

## 测试建议

修复后建议重点测试：

1. **多 Agent 场景**: 同时启动多个 Agent，验证数据隔离
2. **高并发搜索**: 大量并发搜索请求，验证错误传播
3. **长时间运行**: 验证 timer 无泄漏，进程可正常退出
4. **网关重启**: 验证启动失败时的资源清理
5. **配置并发更新**: 多个插件同时更新配置

---

## 后续优化方向

1. **添加更多指标**: 使用 `getVectorStorageStats()` 监控存储实例
2. **进化性能**: 考虑将 NSEM 进化改为后台线程（Worker Threads）
3. **向量索引**: 为冷数据添加 HNSW 或 IVF 索引
4. **模块化重构**: 解决循环依赖，提高代码可维护性
