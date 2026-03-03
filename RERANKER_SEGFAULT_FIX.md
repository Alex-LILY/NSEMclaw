# Reranker 段错误修复指南

## 问题原因

`qwen3-reranker-0.6b-q8_0.gguf` 模型使用 **Qwen3 架构**，而 `node-llama-cpp 3.16.2` **不完全支持**该架构的嵌入/推理操作。

模型加载成功，但第一次调用 `embedQuery()` 时触发段错误：
```
[nsem-embedding] ✅ 重排模型加载成功
[1]    262563 segmentation fault (core dumped)  ./nsemclaw.mjs gateway
```

## 解决方案

### 方案 1：立即禁用重排功能（最快）

修改你的 `nsemclaw.json` 配置：

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "provider": "local",
        "rerank": false
      }
    }
  }
}
```

或设置环境变量：
```bash
export NSEM_GPU_ENABLED=false
```

### 方案 2：删除有问题的模型文件

```bash
rm ~/.nsemclaw/models/hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf
```

系统会自动下载替代模型（需要重新构建项目，见方案3）。

### 方案 3：重新构建项目（已修改源代码）

已将重排模型从 `qwen3-reranker` 切换到 `bge-reranker-v2-m3`：

```bash
# 清理旧模型
rm ~/.nsemclaw/models/hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf

# 重新构建项目
pnpm build

# 重新启动（会自动下载新模型）
./nsemclaw.mjs gateway
```

## 修改的文件

1. `src/cognitive-core/utils/model-downloader.ts` - 更换 reranker 模型
2. `src/cognitive-core/config.ts` - 更新默认配置
3. `src/cognitive-core/mind/perception/UnifiedEmbeddingEngine.ts` - 更新注释

## 新模型信息

| 特性 | 旧模型 | 新模型 |
|------|--------|--------|
| 名称 | qwen3-reranker-0.6b-q8_0 | bge-reranker-v2-m3-q4_k_m |
| 架构 | Qwen3 | BGE (兼容) |
| 大小 | ~610MB | ~200MB |
| 兼容性 | ❌ 不兼容 | ✅ 兼容 |

## 验证修复

重新启动后，日志应显示：
```
[nsem-embedding] 加载重排模型: /home/kade/.nsemclaw/models/hf_qdrant_bge-reranker-v2-m3-Q4_K_M.gguf
[nsem-embedding] ✅ 重排模型加载成功
# 不再出现段错误
```

## 临时绕过（无需修改代码）

如果暂时无法重新构建，可以设置环境变量跳过 reranker：

```bash
# 方法1：设置最小资源模式（不加载reranker）
export NSEM_RESOURCE_MODE=minimal

# 方法2：直接禁用 GPU（有时能绕过）
export NSEM_GPU_ENABLED=false

./nsemclaw.mjs gateway
```
