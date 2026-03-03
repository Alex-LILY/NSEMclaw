# OpenClaw Cognitive Core (OCC) - 认知核心

## 概述

Cognitive Core 是 OpenClaw 的下一代认知架构，包含：

- **NSEM 2.0**: 神经符号进化记忆系统
- **Smart Embedding**: 智能轻量模型管理
- **Soul Integration**: 灵魂系统接口 (预留)

## 与原版 NSEM 的关键差异

| 特性     | 原版 NSEM        | NSEM 2.0 (当前)            |
| -------- | ---------------- | -------------------------- |
| 嵌入引擎 | 简化实现 (384维) | **复用 OpenClaw 本地模型** |
| 模型管理 | 独立管理         | **渐进加载，资源自适应**   |
| 内存占用 | 固定 ~100MB      | **自动选择: 80MB-500MB**   |
| 重排序   | 无               | **智能加载，用完即释**     |
| 配置     | 独立配置         | **复用 memorySearch 配置** |

## 轻量模型推荐

### 极简模式 (8GB 内存设备)

```json
{
  "memorySearch": {
    "provider": "local",
    "local": {
      "modelPath": "hf:qdrant/all-MiniLM-L6-v2-gguf/all-MiniLM-L6-v2-Q4_K_M.gguf"
    }
  }
}
```

- 大小: ~80MB
- 维度: 384
- 质量: 良好

### 平衡模式 (推荐，16GB 内存)

```json
{
  "memorySearch": {
    "provider": "local",
    "local": {
      "modelPath": "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf"
    }
  }
}
```

- 大小: ~300MB
- 维度: 1536
- 质量: 优秀

## 快速开始

### 1. 直接使用

```typescript
import { NSEM2Core } from "nsemclaw/cognitive-core";

const nsem = await NSEM2Core.create(cfg, agentId, memoryConfig);
await nsem.start();

// 摄入记忆
await nsem.ingest("今天学习Rust", {
  type: "experience",
  tags: ["rust", "learning"],
});

// 激活记忆
const activated = await nsem.activate({
  intent: "编程学习",
  strategy: "exploratory",
});

// 结果包含重排序优化
console.log(activated.atoms);
```

### 2. 完整配置示例

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "enabled": true,
        "provider": "local",
        "local": {
          "modelPath": "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf",
          "modelCacheDir": "~/.nsemclaw/models"
        }
      },
      "nsem": {
        "enabled": true,
        "resourceMode": "balanced",
        "evolutionIntervalMinutes": 15
      }
    }
  }
}
```

## 架构

```
cognitive-core/
├── mind/
│   ├── nsem/
│   │   └── NSEM2Core.ts          # NSEM 2.0 核心
│   └── perception/
│       └── SmartEmbeddingEngine.ts  # 智能嵌入引擎
├── soul/                          # 灵魂系统 (预留)
├── instinct/                      # 本能系统 (预留)
├── metabolism/                    # 代谢系统 (预留)
├── MODEL_RECOMMENDATIONS.md       # 模型推荐
└── README.md                      # 本文档
```

## 核心特性

### 1. 智能资源管理

- **自动检测**: 根据系统内存选择模式
- **渐进加载**: 重排模型按需加载，用完即释
- **降级保护**: 资源不足时自动降配

### 2. 复用 OpenClaw 基础设施

- 使用 `createEmbeddingProvider` 加载模型
- 支持 `hf:` URI 自动下载
- 复用 `~/.nsemclaw/models` 缓存

### 3. 增强搜索质量

- 查询扩展 (规则-based)
- 神经激活传播
- 智能重排序
- 涌现关联发现

## 文件清单

| 文件                                      | 说明              |
| ----------------------------------------- | ----------------- |
| `mind/nsem/NSEM2Core.ts`                  | NSEM 2.0 核心实现 |
| `mind/perception/SmartEmbeddingEngine.ts` | 智能嵌入引擎      |
| `MODEL_RECOMMENDATIONS.md`                | 详细模型推荐      |
| `README.md`                               | 本文档            |

## 下一步

1. **测试验证**: 运行演示脚本
2. **OpenClaw 集成**: 替换原有记忆管理器
3. **Soul 系统**: 开发元认知层
4. **Instinct 系统**: 开发模式固化

## 参考

- 原版 NSEM: `src/evolution/memory/`
- OpenClaw 嵌入: `src/memory/embeddings.ts`
- 配置说明: `MODEL_RECOMMENDATIONS.md`
