# NSEM2 统一核心重构设计

## 1. 架构目标

将分散的记忆管理组件融合为一个统一的、高性能的 NSEM2Core，消除重复代码，简化接口。

## 2. 统一核心架构 (UnifiedNSEM2Core)

```
┌─────────────────────────────────────────────────────────────────┐
│                     UnifiedNSEM2Core                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Ingestion  │  │  Activation │  │      Evolution          │ │
│  │   Pipeline  │  │    Engine   │  │      Engine             │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                     │               │
│         └────────────────┼─────────────────────┘               │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Unified Memory Interface                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │   Working   │  │   Short     │  │     Long        │  │   │
│  │  │   Memory    │  │   Term      │  │     Term        │  │   │
│  │  │  (Hot LRU)  │  │   (Warm)    │  │   (Cold/Disk)   │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  │         └─────────────────┼──────────────────┘           │   │
│  │                           ▼                              │   │
│  │              ┌─────────────────────────┐                  │   │
│  │              │    VectorStorage        │                  │   │
│  │              │  (统一持久化层)          │                  │   │
│  │              │  - 向量压缩(Float16)     │                  │   │
│  │              │  - HNSW索引 (P3)         │                  │   │
│  │              │  - GPU加速搜索 (P3)      │                  │   │
│  │              └─────────────────────────┘                  │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Batch     │  │   Async     │  │  Dynamic Model          │ │
│  │   Loader    │  │   Writer    │  │  Loader (P1)            │ │
│  │   (批量)     │  │   Queue     │  │  动态模型加载决策         │ │
│  │             │  │  (异步写入)  │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Read/Write  │  │   System    │  │  Auto-Ingestion         │ │
│  │  Lock Split │  │   Resource  │  │  on Conversation End    │ │
│  │  (P1)       │  │   Detection │  │  (P2)                   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 组件融合策略

### 3.1 IntegratedNSEM2Core → NSEM2Core

**保留的核心功能:**

- `VectorStorage` 集成 (已有)
- `SmartEmbeddingEngine` 集成 (已有)
- LRU缓存 + 热/温/冷分层 (需增强)

**需要集成的功能:**

```typescript
// 从 IntegratedNSEM2Core 合并到 NSEM2Core
interface EnhancedNSEM2Config extends NSEM2Config {
  // 三层存储配置 (替代 ThreeTierMemoryStore)
  tieredStorage: {
    workingCapacity: number; // 默认 15
    shortTermCapacity: number; // 默认 1000
    autoTierTransition: boolean; // 自动升降级
  };

  // 增强检索评分
  enhancedRetrieval: {
    enabled: boolean;
    temporalWeight: number; // 时间衰减权重
    importanceWeight: number; // 重要性权重
    frequencyWeight: number; // 访问频率权重
  };

  // 批量加载配置
  batchLoading: {
    enabled: boolean;
    batchSize: number; // 默认 100
    maxConcurrent: number; // 默认 5
  };

  // 异步写入队列
  asyncWrite: {
    enabled: boolean;
    maxQueueSize: number; // 默认 1000
    flushIntervalMs: number; // 默认 5000
    maxRetries: number; // 默认 3
  };
}
```

### 3.2 ThreeTierMemoryStore → VectorStorage 扩展

**当前重复点:**

- `ThreeTierMemoryStore`: Working/Short/Long Term (内存管理)
- `VectorStorage`: Hot/Warm/Cold (缓存管理)

**融合方案:**

```typescript
// VectorStorage 扩展示意
interface VectorStorageConfig {
  // 现有配置...

  // 三层记忆语义映射到缓存层级
  tierMapping: {
    working: "hot"; // 工作记忆 → Hot缓存
    shortTerm: "warm"; // 短期记忆 → Warm缓存
    longTerm: "cold"; // 长期记忆 → Cold/磁盘
  };

  // 层级升降级策略
  tierTransitionPolicy: {
    // 工作记忆→短期记忆: 10分钟未访问
    workingToShortTermMs: number;
    // 短期记忆→工作记忆: 5分钟内访问5次
    shortTermToWorkingThreshold: number;
    // 短期记忆→长期记忆: 24小时且强度>0.6
    shortTermToLongTermMs: number;
    shortTermToLongTermStrength: number;
  };
}
```

### 3.3 PersistentSelectiveMemoryInheritance → 统一存储

**当前问题:**

- 自建SQLite表: `personal_memories`, `shared_memories`, `inherited_memories`
- 与 `VectorStorage` 的 `vectors` + `vector_metadata` 表重复

**融合方案:**

```typescript
// 使用 VectorStorage + metadata 实现作用域
interface ScopedVectorStorage {
  // 在 metadata 中增加 scope 字段
  store(
    atom: MemAtom,
    scope: "personal" | "shared" | "inherited",
    options?: {
      parentAgentId?: string;
      inheritancePath?: string[];
      decayFactor?: number;
    },
  );

  // 按作用域检索
  retrieveByScope(query: Vector, scope: MemoryScope[], options?: RetrievalOptions);

  // 继承功能
  inheritFromParent(agentId: string, parentAgentId: string, filter?: InheritanceFilter);
}
```

### 3.4 cognitive-core-tool.ts → 简化统一接口

**当前:** 20+ actions, 738行代码

**简化后:** 6个核心操作

```typescript
// 新的简化接口
type CognitiveAction =
  | "memory.store" // 统一存储 (替代 memory_store)
  | "memory.retrieve" // 统一检索 (替代 memory_retrieve)
  | "memory.forget" // 遗忘/清理
  | "memory.stats" // 统计信息
  | "memory.evolve" // 触发进化
  | "memory.configure"; // 动态配置

// 统一参数结构
interface CognitiveCoreParams {
  action: CognitiveAction;
  // 记忆内容
  content?: string;
  // 记忆ID (用于更新/删除)
  memoryId?: string;
  // 查询 (用于检索)
  query?: string | number[];
  // 作用域 (personal/shared/inherited/all)
  scope?: MemoryScope | MemoryScope[];
  // 记忆类型
  type?: ContentType;
  // 标签
  tags?: string[];
  // 重要性 (0-1)
  importance?: number;
  // 最大结果数
  maxResults?: number;
  // 最小相似度
  minSimilarity?: number;
  // 配置项 (用于 configure)
  config?: Partial<EnhancedNSEM2Config>;
}
```

## 4. 开发计划

### 阶段一: 基础重构 (一次性完成)

#### 4.1 批量加载接口

```typescript
interface BatchLoader {
  // 批量摄入记忆
  async ingestBatch(
    items: Array<{ content: string; metadata?: MemoryMetadata }>,
    options?: {
      batchSize?: number;
      onProgress?: (completed: number, total: number) => void;
      abortSignal?: AbortSignal;
    }
  ): Promise<BatchIngestResult>;

  // 批量检索
  async retrieveBatch(
    queries: string[],
    options?: {
      maxResultsPerQuery?: number;
      maxConcurrent?: number;
    }
  ): Promise<BatchRetrieveResult>;

  // 从文件批量导入
  async importFromFile(
    filePath: string,
    format: 'jsonl' | 'csv' | 'parquet',
    options?: ImportOptions
  ): Promise<ImportResult>;
}
```

#### 4.2 异步写入队列

```typescript
interface AsyncWriteQueue {
  // 入队写入操作
  enqueue(operation: WriteOperation): Promise<void>;

  // 立即刷新队列
  flush(): Promise<void>;

  // 队列状态
  getStatus(): {
    pendingCount: number;
    processingCount: number;
    failedCount: number;
    avgWaitTimeMs: number;
  };

  // 配置
  configure(options: {
    maxQueueSize: number;
    flushIntervalMs: number;
    maxRetries: number;
    retryDelayMs: number;
  });
}
```

### 阶段二: P1 (本周)

#### P1.1 动态模型加载决策

```typescript
interface DynamicModelLoader {
  // 根据系统资源和任务类型决策加载哪些模型
  decideModelLoading(
    availableResources: SystemResources,
    pendingTasks: TaskProfile[],
  ): ModelLoadingDecision;

  // 配置: 允许的情况下全部加载
  configureLoadingStrategy(strategy: "load-all" | "on-demand" | "adaptive");
}

// 使用配置
const config: EnhancedNSEM2Config = {
  modelLoading: {
    strategy: "load-all", // 配置允许时全部加载
    fallbackStrategy: "on-demand", // 资源不足时回退
    priorityOrder: ["embedding", "reranker", "expansion"],
  },
};
```

#### P1.2 读写锁分离

```typescript
class ReadWriteLock {
  private readLock: Promise<void> = Promise.resolve();
  private writeLock: Promise<void> = Promise.resolve();
  private readCount = 0;

  // 读操作并行，写操作独占
  async withReadLock<T>(fn: () => Promise<T>): Promise<T>;
  async withWriteLock<T>(fn: () => Promise<T>): Promise<T>;
}

// 应用到核心操作
class UnifiedNSEM2Core {
  // 读操作使用读锁 - 可并行
  async activate(query: MemoryQuery): Promise<ActivatedMemory>;
  async retrieveByScope(...): Promise<...>;

  // 写操作使用写锁 - 独占
  async ingest(...): Promise<MemAtom>;
  async evolve(): Promise<void>;
}
```

#### P1.3 系统资源自动检测

```typescript
interface SystemResourceDetector {
  // 持续监控系统资源
  startMonitoring(options?: {
    intervalMs: number;
    thresholds: {
      memoryWarningPercent: number;
      memoryCriticalPercent: number;
      cpuWarningPercent: number;
    };
  });

  // 获取当前资源状态
  getCurrentResources(): SystemResources;

  // 注册回调
  onResourceWarning(callback: (resource: string, level: "warning" | "critical") => void);

  // 自动调整建议
  getOptimizationSuggestions(): OptimizationSuggestion[];
}

interface SystemResources {
  memory: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  cpu: {
    loadAverage: number[];
    usagePercent: number;
  };
  disk: {
    total: number;
    available: number;
    writeSpeed: number;
  };
  gpu?: {
    available: boolean;
    memoryTotal: number;
    memoryUsed: number;
  };
}
```

### 阶段三: P2 (下周)

#### P2.1 对话结束自动摄入

```typescript
interface AutoIngestionService {
  // 配置自动摄入规则
  configure(rules: AutoIngestionRule[]);

  // 监听对话结束事件
  onConversationEnd(event: ConversationEndEvent): Promise<void>;
}

interface AutoIngestionRule {
  // 触发条件
  trigger: {
    type: "conversation-end" | "time-interval" | "manual";
    minMessages?: number;
    minDurationMs?: number;
  };

  // 内容提取
  extraction: {
    summarize: boolean;
    extractFacts: boolean;
    extractInsights: boolean;
    includeContext: boolean;
  };

  // 摄入策略
  strategy: {
    scope: MemoryScope;
    importance: number | "auto";
    tags: string[];
    deduplicate: boolean;
  };
}
```

#### P2.2 重要信息识别规则

```typescript
interface ImportanceScorer {
  // 评估内容重要性
  calculateImportance(content: string, context: Context): ImportanceScore;

  // 配置识别规则
  configureRules(rules: ImportanceRule[]);
}

interface ImportanceRule {
  // 规则类型
  type: "keyword" | "pattern" | "semantic" | "contextual";

  // 匹配条件
  condition: {
    keywords?: string[];
    regex?: string;
    semanticThreshold?: number;
    contextFactors?: string[];
  };

  // 权重调整
  weightAdjustment: number;
}

// 默认规则
const DEFAULT_IMPORTANCE_RULES: ImportanceRule[] = [
  {
    type: "keyword",
    condition: { keywords: ["重要", "关键", "必须", "remember"] },
    weightAdjustment: 0.3,
  },
  {
    type: "keyword",
    condition: { keywords: ["密码", "密钥", "token", "secret"] },
    weightAdjustment: 0.5,
  },
  { type: "pattern", condition: { regex: "\b\d{4}-\d{2}-\d{2}\b" }, weightAdjustment: 0.2 }, // 日期
  {
    type: "contextual",
    condition: { contextFactors: ["user-emphasis", "repeated-mention"] },
    weightAdjustment: 0.25,
  },
];
```

#### P2.3 定期整理任务

```typescript
interface PeriodicMaintenanceService {
  // 配置整理任务
  configureSchedule(tasks: MaintenanceTask[]);

  // 手动触发整理
  async runMaintenance(tasks?: MaintenanceTaskType[]): Promise<MaintenanceResult>;

  // 获取下次整理时间
  getNextScheduledRun(): Date;
}

type MaintenanceTaskType =
  | 'decay'           // 记忆衰减
  | 'prune'           // 清理遗忘记忆
  | 'merge-fields'    // 合并重叠场
  | 'optimize-storage' // 优化存储
  | 'rebuild-index';  // 重建索引

interface MaintenanceTask {
  type: MaintenanceTaskType;
  schedule: 'hourly' | 'daily' | 'weekly' | 'custom';
  customIntervalMs?: number;
  options?: Record<string, unknown>;
}
```

### 阶段四: P3 (下月)

#### P3.1 GPU加速搜索

```typescript
interface GPUSearchAccelerator {
  // 检测GPU可用性
  static async detectGPU(): Promise<GPUInfo | null>;

  // 批量相似度计算
  async batchCosineSimilarity(
    query: Vector,
    candidates: Vector[],
    options?: { batchSize?: number }
  ): Promise<number[]>;

  // 矩阵乘法加速
  async matrixMultiply(a: Matrix, b: Matrix): Promise<Matrix>;
}

// 使用示例
class UnifiedNSEM2Core {
  private gpuAccelerator?: GPUSearchAccelerator;

  async activate(query: MemoryQuery): Promise<ActivatedMemory> {
    // 优先使用GPU加速
    if (this.gpuAccelerator) {
      const similarities = await this.gpuAccelerator.batchCosineSimilarity(
        queryEmbedding,
        candidateEmbeddings
      );
      // ...
    }
  }
}
```

#### P3.2 HNSW索引

```typescript
interface HNSWIndex {
  // 构建索引
  buildIndex(vectors: Array<{ id: string; vector: Vector }>): Promise<void>;

  // 增量更新
  async addVector(id: string, vector: Vector): Promise<void>;
  async removeVector(id: string): Promise<void>;

  // 近似最近邻搜索
  async search(
    query: Vector,
    k: number,
    options?: { ef?: number }  // 搜索参数
  ): Promise<Array<{ id: string; distance: number }>>;

  // 保存/加载
  save(path: string): Promise<void>;
  load(path: string): Promise<void>;
}

// 集成到 VectorStorage
class VectorStorage {
  private hnswIndex?: HNSWIndex;

  search(queryVector: Vector, options?: SearchOptions): VectorSearchResult[] {
    // 大规模数据使用HNSW
    if (this.getVectorCount() > HNSW_THRESHOLD) {
      return this.hnswIndex!.search(queryVector, options?.topK ?? 10);
    }
    // 小数据量使用暴力搜索
    return this.bruteForceSearch(queryVector, options);
  }
}
```

## 5. 迁移路径

### 5.1 代码迁移顺序

```
Phase 1 (一次性开发):
1. 创建 UnifiedNSEM2Core 框架
2. 实现 BatchLoader
3. 实现 AsyncWriteQueue
4. 集成 VectorStorage 三层存储

Phase 2 (P1 - 本周):
5. 添加动态模型加载决策
6. 实现读写锁分离
7. 添加系统资源检测

Phase 3 (P2 - 下周):
8. 实现对话结束自动摄入
9. 添加重要性识别规则
10. 实现定期整理任务

Phase 4 (P3 - 下月):
11. 添加GPU加速
12. 实现HNSW索引

Phase 5 (清理):
13. 标记旧组件为 deprecated
14. 更新 cognitive-core-tool 接口
15. 移除旧组件
```

### 5.2 向后兼容

```typescript
// 保持旧接口兼容
class NSEM2Core {
  // 新核心方法

  // 兼容旧接口
  /** @deprecated 使用新的 unified 接口 */
  async ingest(content: string, ...): Promise<MemAtom>;

  /** @deprecated 使用新的 unified 接口 */
  async activate(query: MemoryQuery): Promise<ActivatedMemory>;
}

// Adapter 模式
export function createLegacyNSEM2Core(config: LegacyConfig): NSEM2Core {
  const unified = new UnifiedNSEM2Core(adaptConfig(config));
  return createProxyForBackwardCompatibility(unified);
}
```

## 6. 性能目标

| 指标            | 当前   | 目标    | 提升 |
| --------------- | ------ | ------- | ---- |
| 单条摄入延迟    | ~50ms  | ~20ms   | 2.5x |
| 批量摄入(100条) | ~5s    | ~1s     | 5x   |
| 检索延迟(1万条) | ~100ms | ~30ms   | 3x   |
| 内存占用        | 中等   | 降低30% | -    |
| 代码行数        | ~4000  | ~2000   | 50%  |
