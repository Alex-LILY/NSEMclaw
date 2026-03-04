# Cognitive Core 文件梳理报告

## 📊 当前状态

```
src/cognitive-core/
├── ✅ 已集成/需要保留
├── ⚠️ 待确认/可选
├── ❌ 可以清理
└── 🆕 新增文件
```

---

## ✅ 必须保留（核心功能）

### 核心入口
| 文件 | 说明 | 状态 |
|------|------|------|
| `index.ts` | 主入口，导出所有模块 | ✅ 活跃 |
| `config.ts` | 配置管理 | ✅ 活跃 |
| `UnifiedCoreV2.ts` | 新融合核心 | 🆕 新增 |

### 类型定义
| 文件 | 说明 | 状态 |
|------|------|------|
| `types/index.ts` | 统一类型 | ✅ 活跃 |

### 三层记忆存储
| 文件 | 说明 | 状态 |
|------|------|------|
| `memory/ThreeTierMemoryStore.ts` | 三层存储实现 | ✅ 活跃 |
| `memory/index.ts` | 导出 | ✅ 活跃 |

### 记忆提取系统
| 文件 | 说明 | 状态 |
|------|------|------|
| `memory-extraction/SessionManager.ts` | 会话管理 | ✅ 活跃 |
| `memory-extraction/MemoryExtractor.ts` | 记忆提取 | ✅ 活跃 |
| `memory-extraction/types.ts` | 类型定义 | ✅ 活跃 |
| `memory-extraction/index.ts` | 导出 | ✅ 活跃 |

### 检索模块
| 文件 | 说明 | 状态 |
|------|------|------|
| `retrieval/HierarchicalRetriever.ts` | 分层检索 | ✅ 活跃 |
| `retrieval/HybridRetriever.ts` | 混合检索 | ✅ 活跃 |
| `retrieval/IntentAnalyzer.ts` | 意图分析 | ✅ 活跃 |
| `retrieval/Reranker.ts` | 重排序 | ✅ 活跃 |
| `retrieval/SparseIndex.ts` | 稀疏索引 | ✅ 活跃 |
| `retrieval/index.ts` | 导出 | ✅ 活跃 |

### 上下文管理
| 文件 | 说明 | 状态 |
|------|------|------|
| `context/ContextLevel.ts` | 上下文层级 | ✅ 活跃 |
| `context/UnifiedContext.ts` | 统一上下文 | ✅ 活跃 |
| `context/RetrievalTracer.ts` | 检索追踪 | ✅ 活跃 |
| `context/index.ts` | 导出 | ✅ 活跃 |

### 嵌入引擎
| 文件 | 说明 | 状态 |
|------|------|------|
| `mind/perception/SmartEmbeddingEngine.ts` | 智能嵌入 | ✅ 活跃 |
| `mind/perception/UnifiedEmbeddingEngine.ts` | 统一嵌入 | ✅ 活跃 |

### 存储
| 文件 | 说明 | 状态 |
|------|------|------|
| `storage/VectorStorage.ts` | 向量存储 | ✅ 活跃 |

---

## ⚠️ 可选/待确认

### NSEM 2.x 系列（可能冗余）
| 文件 | 说明 | 建议 |
|------|------|------|
| `mind/nsem/NSEM2Core.ts` | NSEM 2.0 核心 | ⚠️ UnifiedNSEM2Core 替代？ |
| `mind/nsem/UnifiedNSEM2Core.ts` | 统一核心 | ⚠️ UnifiedCoreV2 替代？ |
| `NSEM21Core.ts` | NSEM 2.1 核心 | ⚠️ 检查是否在用 |
| `NSEM21CoreWithExtraction.ts` | 2.1+提取 | ⚠️ 检查是否在用 |

**建议**：如果 UnifiedCoreV2 工作正常，这些可以标记为废弃

### 决策系统
| 文件 | 说明 | 建议 |
|------|------|------|
| `decision/DecisionStrategyEngine.ts` | 决策引擎 | ⚠️ 如不用可移除 |
| `integration/DecisionIntegration.ts` | 决策集成 | ⚠️ 如不用可移除 |

### 其他可选模块
| 文件 | 说明 | 建议 |
|------|------|------|
| `evolution/*` | 进化系统 | ⚠️ 高级功能，可选 |
| `meta-cognition/*` | 元认知 | ⚠️ 高级功能，可选 |
| `multi-agent/*` | 多代理 | ⚠️ 高级功能，可选 |
| `services/*` | 服务 | ⚠️ 检查依赖 |
| `lifecycle/*` | 生命周期 | ⚠️ 检查依赖 |

---

## ❌ 可以清理

### 适配器层（已被 UnifiedCoreV2 替代）
| 文件 | 说明 | 操作 |
|------|------|------|
| `adapter/storage-adapter.ts` | 旧适配器 | ❌ 删除 |
| `adapter/session-adapter.ts` | 旧适配器 | ❌ 删除 |
| `adapter/format-converter.ts` | 旧适配器 | ❌ 删除 |
| `adapter/api-adapter.ts` | 旧适配器 | ❌ 删除 |
| `adapter/unified-service.ts` | 旧适配器 | ❌ 删除 |
| `adapter/ThreeTierSearchManager.ts` | 旧适配器 | ❌ 删除 |
| `adapter/TripleHybridSearchManager.ts` | 旧适配器 | ❌ 删除 |
| `adapter/ARCHITECTURE.md` | 旧文档 | ❌ 删除 |
| `adapter/AFTER_ADDING_ADAPTER.md` | 旧文档 | ❌ 删除 |
| `adapter/INTEGRATION_GUIDE.md` | 旧文档 | ❌ 删除 |
| `adapter/USAGE_EXAMPLE.md` | 旧文档 | ❌ 删除 |
| `adapter/index.ts` | 旧导出 | ❌ 删除 |

**注意**：删除前请确认没有代码引用这些文件

### 文档（可以归档）
| 文件 | 说明 | 操作 |
|------|------|------|
| `INTEGRATION_ANALYSIS.md` | 分析文档 | 📁 归档到 docs/ |
| `MISSING_FEATURES_ANALYSIS.md` | 分析文档 | 📁 归档到 docs/ |
| `NSEM21-COMPLETION-SUMMARY.md` | 总结文档 | 📁 归档到 docs/ |
| `NSEM21-FINAL-SUMMARY.md` | 总结文档 | 📁 归档到 docs/ |
| `NSEM21-INTEGRATION-SUMMARY.md` | 总结文档 | 📁 归档到 docs/ |
| `NSEM21-README.md` | 说明文档 | 📁 归档到 docs/ |
| `OPENVIKING_VS_NSEMCLAW_COMPARISON.md` | 对比文档 | 📁 归档到 docs/ |
| `UPGRADE_2.1.md` | 升级文档 | 📁 归档到 docs/ |
| `WHY_THIS_IS_BETTER.md` | 对比文档 | ❌ 删除（已过时） |
| `FUSION_SOLUTION.md` | 方案文档 | 📁 归档到 docs/ |

### 示例代码（可以归档）
| 文件 | 说明 | 操作 |
|------|------|------|
| `examples/*` | 示例代码 | 📁 归档到 examples/ |
| `example-usage.ts` | 示例代码 | 📁 归档到 examples/ |

### 测试文件（保留但可整理）
| 文件 | 说明 | 操作 |
|------|------|------|
| `*.test.ts` | 测试文件 | ✅ 保留在原地 |

---

## 🆕 新增文件（本次集成）

| 文件 | 说明 | 状态 |
|------|------|------|
| `UnifiedCoreV2.ts` | 融合核心 | ✅ 新增 |
| `memory/unified-core-v2-adapter.ts` | search-manager 适配器 | ✅ 新增（在 memory/ 目录） |

---

## 📁 建议的目录结构

清理后的结构：

```
src/cognitive-core/
├── index.ts                    # 主入口
├── config.ts                   # 配置
├── UnifiedCoreV2.ts            # 融合核心 ⭐
├── types/
│   └── index.ts                # 类型定义
├── context/                    # 上下文管理
├── memory/                     # 三层存储
├── memory-extraction/          # 记忆提取
├── retrieval/                  # 检索模块
├── mind/
│   └── perception/             # 嵌入引擎
├── storage/                    # 向量存储
├── security/                   # 安全（如需要）
├── decision/                   # 决策（如需要）
├── services/                   # 服务（如需要）
└── utils/                      # 工具函数
```

---

## 🧹 清理步骤

### 步骤 1：删除旧适配器层
```bash
rm -rf src/cognitive-core/adapter/
```

### 步骤 2：归档文档
```bash
mkdir -p docs/cognitive-core/
mv src/cognitive-core/*.md docs/cognitive-core/
```

### 步骤 3：检查依赖
```bash
# 检查是否有文件引用即将删除的模块
grep -r "from.*adapter" src/
grep -r "import.*adapter" src/
```

### 步骤 4：更新 index.ts
移除废弃模块的导出

---

## ⚡ 优先级建议

| 优先级 | 操作 | 影响 |
|-------|------|------|
| P0 | 保留 UnifiedCoreV2.ts | 核心功能 |
| P1 | 清理 adapter/ 目录 | 减少混淆 |
| P2 | 归档文档 | 整理结构 |
| P3 | 标记废弃模块 | 代码质量 |
| P4 | 删除可选模块 | 精简代码 |

---

## 📊 统计

| 类型 | 数量 | 说明 |
|------|------|------|
| 必须保留 | ~25 个文件 | 核心功能 |
| 可选模块 | ~15 个文件 | 高级功能 |
| 可以清理 | ~20 个文件 | 旧适配器+文档 |
| 总计 | ~60 个文件 | 当前目录 |

清理后预计减少 **30%** 文件数量
