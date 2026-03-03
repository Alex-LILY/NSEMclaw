# NSEM 2.0 系统级自查与优化方案

## 1. 系统级问题诊断

### 1.1 架构层面的问题

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         当前系统架构 (问题视图)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   问题1: 多套记忆系统并存 (碎片化)                                        │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Agent层                                                         │   │
│   │   ├─► memory-tool.ts (旧版记忆工具)                              │   │
│   │   ├─► cognitive-core-tool.ts (NSEM2入口)                         │   │
│   │   └─► sessions-spawn-tool.ts (子代理记忆继承)                      │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│   ┌──────────────────────────┼──────────────────────────────────────┐   │
│   │  认知核心层 (4套独立系统)   │                                      │   │
│   │                           ▼                                      │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │   │
│   │  │NSEM2Core    │  │Selective    │  │ThreeTier    │  │Persistent│ │   │
│   │  │(1498行)     │  │Memory       │  │MemoryStore  │  │Inheritance│ │   │
│   │  │             │  │Inheritance  │  │(1012行)     │  │(537行)   │ │   │
│   │  │向量+图谱     │  │(记忆继承)    │  │工作/短期/长期│  │(持久化)   │ │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │   │
│   │        │                │                │               │       │   │
│   │        └────────────────┴────────────────┴───────────────┘       │   │
│   │                          │                                       │   │
│   │                   ❌ 没有统一接口                                 │   │
│   │                   ❌ 数据不互通                                   │   │
│   │                   ❌ 重复存储                                     │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│   ┌──────────────────────────▼──────────────────────────────────────┐   │
│   │  存储层                                                          │   │
│   │   ├─► VectorStorage (SQLite) - NSEM2Core专用                     │   │
│   │   ├─► PersistentStorage (SQLite) - Inheritance专用               │   │
│   │   └─► ThreeTierStorage (内存) - ThreeTier专用                    │   │
│   │                                                                  │   │
│   │   ❌ 三个SQLite数据库文件，重复存储向量                             │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

关键发现:
1. 代码重复: NSEM2Core (1498行) + IntegratedNSEM2Core (1265行) = 60%重复逻辑
2. 存储重复: 向量在 VectorStorage + PersistentStorage 中重复存储
3. 接口混乱: cognitive-core-tool 暴露20+个actions，没有统一抽象
```

### 1.2 配置层面的问题

```typescript
// 当前配置 (分散且不完整)
interface AgentDefaultsConfig {
  // ... 其他配置 ...
  memorySearch?: MemorySearchConfig; // QMD记忆 (外部工具)

  nsem?: {
    // NSEM2配置
    enabled?: boolean; // ✅ 启用开关
    resourceMode?: "minimal" | "balanced" | "performance"; // ✅ 资源模式
    evolutionIntervalMinutes?: number; // ✅ 进化间隔
    maxAtoms?: number; // ✅ 容量限制
    ingestConversations?: boolean; // ⚠️ 未实现自动摄入
    rerankerModel?: string; // ✅ 模型配置
    expansionModel?: string; // ✅ 模型配置
    // ❌ 缺少: 自动存储策略
    // ❌ 缺少: 重要信息识别规则
    // ❌ 缺少: 定期整理时间
    // ❌ 缺少: 存储路径配置
    // ❌ 缺少: 保留策略
  };
}
```

**配置问题清单:**
| 问题 | 影响 | 现状 |
|------|------|------|
| `ingestConversations` 未实现 | 需要手动存储每条记忆 | 配置存在但代码未实现 |
| 无自动存储策略配置 | 无法控制何时自动存储 | 完全缺失 |
| 无重要信息识别规则 | 无法自动识别主人偏好 | 完全缺失 |
| 无定期整理配置 | 无法配置整理时间 | 硬编码1小时 |
| 无存储路径配置 | 无法自定义存储位置 | 硬编码 ~/.nsemclaw |

### 1.3 运行时层面的问题

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         运行时问题分析                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  问题1: 模型加载策略过于简单                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  当前: 根据 resourceMode 静态加载                                  │   │
│  │    minimal → 只加载 embedding (80MB)                              │   │
│  │    balanced → 加载 embedding + reranker (300MB)                   │   │
│  │    performance → 加载全部 (500MB+)                                │   │
│  │                                                                  │   │
│  │  问题: 不考虑实际硬件配置                                          │   │
│  │    - 16GB内存 + performance模式 = OOM                             │   │
│  │    - 128GB内存 + minimal模式 = 资源浪费                            │   │
│  │    - 没有动态调整机制                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  问题2: 内存管理不智能                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  当前: 启动时根据系统内存计算maxAtoms，之后固定                     │   │
│  │                                                                  │   │
│  │  问题:                                                           │   │
│  │    - 不监控系统内存变化 (其他进程占用)                              │   │
│  │    - 不根据访问模式调整缓存策略                                     │   │
│  │    - 无OOM保护机制                                                │   │
│  │    - 缓存淘汰过于简单 (仅LRU)                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  问题3: 缺乏自动化运维机制                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  缺失功能:                                                        │   │
│  │    ❌ 对话结束后自动存储记忆                                        │   │
│  │    ❌ 自动识别重要信息 (主人偏好)                                   │   │
│  │    ❌ 定期自动整理 (清理+合并)                                     │   │
│  │    ❌ 存储空间不足自动告警                                          │   │
│  │    ❌ 自动备份机制                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 系统级优化方案

### 2.1 架构重构: 统一记忆核心

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     优化后的统一架构                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Agent层                                                               │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  统一记忆工具 (memory-tool.ts 合并 cognitive-core-tool)          │   │
│   │                                                                  │   │
│   │  自动摄入 (AutoIngestion)                                       │   │
│   │    ├─ 对话结束检测 → 自动提取关键信息 → 存储                      │   │
│   │    ├─ 重要信息识别 → 立即存储                                     │   │
│   │    └─ 定期整理任务 → 每天执行                                     │   │
│   │                                                                  │   │
│   │  手动操作接口                                                    │   │
│   │    ├─ remember(content, importance)                             │   │
│   │    ├─ recall(query, options)                                    │   │
│   │    ├─ forget(memoryId)                                          │   │
│   │    └─ listMemories(filter)                                      │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  UnifiedMemoryCore (统一记忆核心)                                │   │
│   │                                                                  │   │
│   │  职责: 整合 NSEM2Core + ThreeTierStore + Inheritance             │   │
│   │                                                                  │   │
│   │  ┌─────────────────────────────────────────────────────────┐    │   │
│   │  │  内部模块:                                               │    │   │
│   │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │   │
│   │  │  │ MemoryGraph  │  │ TierManager  │  │ Inheritance  │   │    │   │
│   │  │  │ (原NSEM2Core)│  │ (三层管理)    │  │ (记忆继承)    │   │    │   │
│   │  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │   │
│   │  │                                                          │    │   │
│   │  │  统一使用 VectorStorage 作为底层存储                       │    │   │
│   │  └─────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  UnifiedStorage (统一存储层)                                     │   │
│   │                                                                  │   │
│   │  单一SQLite数据库: ~/.nsemclaw/memory/unified.db                 │   │
│   │                                                                  │   │
│   │  表结构:                                                         │   │
│   │    ├─ atoms (记忆原子)                                           │   │
│   │    ├─ edges (关系边)                                             │   │
│   │    ├─ fields (记忆场)                                            │   │
│   │    ├─ vectors (向量数据)                                         │   │
│   │    ├─ inheritance_chains (继承链)                                │   │
│   │    └─ tiers (层级状态)                                           │   │
│   │                                                                  │   │
│   │  ❌ 删除 PersistentStorage (重复)                                │   │
│   │  ❌ 删除 ThreeTierStorage (重复)                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 智能模型加载策略

```typescript
// 动态模型加载决策引擎
interface ModelLoadingDecision {
  // 系统资源检测
  systemProfile: {
    totalMemoryGB: number;
    availableMemoryGB: number;
    hasGPU: boolean;
    vramGB: number;
    cpuCores: number;
  };

  // 决策结果
  loadDecision: {
    embedding: "minimal" | "balanced" | "performance"; // 必须加载
    reranker: boolean; // 是否加载
    expansion: boolean; // 是否加载
  };

  // 动态调整策略
  adaptiveStrategy: {
    unloadRerankerAfterIdleMs: number; // 空闲后卸载重排序模型
    preloadPredictedQueries: boolean; // 预测预加载
    gpuOffloadLayers: number; // GPU层数
  };
}

// 决策逻辑
function decideModelLoading(profile: SystemProfile): ModelLoadingDecision {
  const available = profile.availableMemoryGB;
  const hasGPU = profile.hasGPU && profile.vramGB >= 4;

  // 决策树
  if (available >= 100) {
    // 128GB系统: 全部加载，常驻内存
    return {
      loadDecision: { embedding: "performance", reranker: true, expansion: true },
      adaptiveStrategy: {
        unloadRerankerAfterIdleMs: 0,
        preloadPredictedQueries: true,
        gpuOffloadLayers: 999,
      },
    };
  } else if (available >= 20) {
    // 32GB系统: 加载全部，但空闲卸载reranker
    return {
      loadDecision: { embedding: "balanced", reranker: true, expansion: hasGPU },
      adaptiveStrategy: {
        unloadRerankerAfterIdleMs: 300000,
        preloadPredictedQueries: true,
        gpuOffloadLayers: hasGPU ? 35 : 0,
      },
    };
  } else if (available >= 8) {
    // 16GB系统: 只加载embedding，reranker按需
    return {
      loadDecision: { embedding: "balanced", reranker: false, expansion: false },
      adaptiveStrategy: {
        unloadRerankerAfterIdleMs: 0,
        preloadPredictedQueries: false,
        gpuOffloadLayers: hasGPU ? 20 : 0,
      },
    };
  } else {
    // 8GB以下: 极简模式
    return {
      loadDecision: { embedding: "minimal", reranker: false, expansion: false },
      adaptiveStrategy: {
        unloadRerankerAfterIdleMs: 0,
        preloadPredictedQueries: false,
        gpuOffloadLayers: 0,
      },
    };
  }
}
```

### 2.3 智能内存管理

```typescript
// 自适应内存管理器
interface AdaptiveMemoryManager {
  // 实时监控
  monitor: {
    systemMemoryUsage: number; // 系统内存使用率
    processMemoryUsage: number; // 进程内存使用
    cacheHitRate: number; // 缓存命中率
    diskIOWait: number; // 磁盘IO等待
  };

  // 动态调整策略
  adjust: {
    // 当系统内存紧张时
    onMemoryPressure: () => {
      // 1. 减小Hot Cache
      // 2. 清空Warm Cache
      // 3. 触发GC
      // 4. 暂停非关键任务
    };

    // 当缓存命中率低时
    onLowHitRate: () => {
      // 1. 增加Hot Cache大小
      // 2. 预加载高频记忆
      // 3. 优化缓存淘汰策略
    };

    // 当磁盘IO繁忙时
    onHighDiskIO: () => {
      // 1. 批量写入合并
      // 2. 延迟非关键读取
      // 3. 增加内存缓存比例
    };
  };
}

// 实现代码示意
class AdaptiveMemoryManager {
  private checkInterval: NodeJS.Timeout;

  start() {
    this.checkInterval = setInterval(() => {
      const stats = this.collectStats();

      if (stats.systemMemoryUsage > 85) {
        this.handleMemoryPressure();
      } else if (stats.cacheHitRate < 80 && stats.systemMemoryUsage < 70) {
        this.increaseCacheSize();
      }

      // 动态调整maxAtoms
      const newMaxAtoms = this.calculateOptimalCapacity(stats);
      this.adjustCapacity(newMaxAtoms);
    }, 60000); // 每分钟检查
  }
}
```

### 2.4 自动化运维机制

```typescript
// 自动记忆摄入配置
interface AutoIngestionConfig {
  // 对话结束自动存储
  onConversationEnd: {
    enabled: boolean;
    extractKeyPoints: boolean; // 提取关键信息
    summarize: boolean; // 生成摘要
    storeRaw: boolean; // 存储原始对话
    importanceThreshold: number; // 重要性阈值 (0-1)
  };

  // 重要信息立即识别
  importantInfoDetection: {
    enabled: boolean;
    rules: Array<{
      pattern: RegExp; // 匹配模式
      type: "preference" | "habit" | "fact" | "task";
      importance: number; // 默认重要性
    }>;
    // 预设规则示例:
    // - "我喜欢/我讨厌/我偏好" → preference
    // - "每天/总是/从不" → habit
    // - "请记住/别忘了" → fact (高重要性)
    // - "截止日期/必须在" → task
  };

  // 定期整理
  periodicMaintenance: {
    enabled: boolean;
    schedule: "0 2 * * *"; // 每天凌晨2点
    tasks: {
      decay: boolean; // 衰减记忆
      prune: boolean; // 清理遗忘
      merge: boolean; // 合并场
      compress: boolean; // 压缩旧数据
      backup: boolean; // 备份
    };
  };
}

// 配置示例
const defaultAutoConfig: AutoIngestionConfig = {
  onConversationEnd: {
    enabled: true,
    extractKeyPoints: true,
    summarize: true,
    storeRaw: false, // 不存原始对话，节省空间
    importanceThreshold: 0.6, // 只存重要性>0.6的
  },

  importantInfoDetection: {
    enabled: true,
    rules: [
      { pattern: /我喜欢(.+)/, type: "preference", importance: 0.9 },
      { pattern: /我讨厌(.+)/, type: "preference", importance: 0.9 },
      { pattern: /我(每天|总是|通常|经常)(.+)/, type: "habit", importance: 0.8 },
      { pattern: /请记住(.+)/, type: "fact", importance: 1.0 },
      { pattern: /(截止日期|必须在|别忘了)(.+)/, type: "task", importance: 0.95 },
      { pattern: /我(姓名|叫|是)(.+)/, type: "fact", importance: 0.85 },
    ],
  },

  periodicMaintenance: {
    enabled: true,
    schedule: "0 2 * * *", // cron格式
    tasks: {
      decay: true,
      prune: true,
      merge: true,
      compress: true,
      backup: true,
    },
  },
};
```

---

## 3. 实施路线图

### Phase 1: 架构统一 (2周)

```
Week 1:
├─ 创建 UnifiedMemoryCore 类
├─ 整合 NSEM2Core + ThreeTierStore
├─ 统一使用 VectorStorage
└─ 删除重复代码 (预计删除2000+行)

Week 2:
├─ 更新 cognitive-core-tool.ts
├─ 统一API接口
├─ 迁移数据
└─ 测试验证
```

### Phase 2: 智能加载 (1周)

```
├─ 实现动态模型加载决策
├─ 硬件自动检测
├─ 内存自适应调整
└─ 模型按需卸载
```

### Phase 3: 自动化 (1周)

```
├─ 实现对话结束检测
├─ 实现关键信息提取
├─ 实现重要信息识别
├─ 配置定期整理任务
└─ 添加监控告警
```

### Phase 4: 性能优化 (1周)

```
├─ 批量加载接口
├─ 异步写入队列
├─ 读写锁分离
└─ GPU加速搜索
```

---

## 4. 预期收益

| 指标       | 当前      | 优化后     | 提升   |
| ---------- | --------- | ---------- | ------ |
| 代码行数   | 4312行    | ~2000行    | -54%   |
| 存储文件数 | 3个SQLite | 1个SQLite  | -67%   |
| 内存占用   | 固定分配  | 动态适应   | 自适应 |
| 自动存储   | ❌ 无     | ✅ 自动    | 新功能 |
| 重要识别   | ❌ 无     | ✅ 自动    | 新功能 |
| 自动整理   | 硬编码1h  | 可配置cron | 灵活   |
| 模型加载   | 静态      | 动态决策   | 智能   |

---

_报告版本: 1.0_  
_分析日期: 2026-03-03_  
_范围: 系统级架构_
