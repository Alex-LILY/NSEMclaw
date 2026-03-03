#!/bin/bash
# 批量修复 cognitive-core 中的 TypeScript 错误 - 第二波

set -e

echo "=== 修复 cognitive-core TypeScript 错误 (第二波) ==="

# 1. 修复 log.xxx(msg, non-object) -> log.xxx(msg) 或 log.xxx(msg, {data: ...})
echo "修复日志参数类型问题..."

# 修复 SmartEmbeddingEngine.ts 中的 log.info("...:", Object.keys(...))
sed -i 's/log.info("模型下载完成:", Object.keys(downloaded))/log.info(`模型下载完成: ${Object.keys(downloaded).join(", ")}`)/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts || true
sed -i 's/log.error("模型下载失败:", error)/log.error(`模型下载失败: ${error}`)/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts || true

# 修复所有 log.xxx("...", error) 模式 - 改为模板字符串
sed -i 's/log\.\(info\|debug\|warn\|error\)("\([^"]*\):", \([^)]*\))/log.\1(`\2: ${\3}`)/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts || true

# 修复 services 目录
for f in src/cognitive-core/services/*.ts; do
  sed -i 's/log\.\(info\|debug\|warn\|error\)("\([^"]*\):", \([^)]*\))/log.\1(`\2: ${\3}`)/g' "$f" || true
done

# 修复 multi-agent 目录
for f in src/cognitive-core/multi-agent/*.ts; do
  sed -i 's/log\.\(info\|debug\|warn\|error\)("\([^"]*\):", \([^)]*\))/log.\1(`\2: ${\3}`)/g' "$f" || true
done

# 修复 utils 目录
for f in src/cognitive-core/utils/*.ts; do
  sed -i 's/log\.\(info\|debug\|warn\|error\)("\([^"]*\):", \([^)]*\))/log.\1(`\2: ${\3}`)/g' "$f" || true
done

# 修复 mind 目录
for f in src/cognitive-core/mind/nsem/*.ts; do
  sed -i 's/log\.\(info\|debug\|warn\|error\)("\([^"]*\):", \([^)]*\))/log.\1(`\2: ${\3}`)/g' "$f" || true
done

# 修复 memory 目录
for f in src/cognitive-core/memory/*.ts; do
  sed -i 's/log\.\(info\|debug\|warn\|error\)("\([^"]*\):", \([^)]*\))/log.\1(`\2: ${\3}`)/g' "$f" || true
done

# 修复 storage 目录
for f in src/cognitive-core/storage/*.ts; do
  sed -i 's/log\.\(info\|debug\|warn\|error\)("\([^"]*\):", \([^)]*\))/log.\1(`\2: ${\3}`)/g' "$f" || true
done

echo "完成日志参数修复"

# 2. 修复 ContentType 导入问题 - 从 types/index.js 导入
echo "修复 ContentType 导入..."
sed -i 's|import.*ContentType.*from.*UnifiedNSEM2Core.*|import type { ContentType } from "../types/index.js";|g' src/cognitive-core/services/AutoIngestionService.ts || true

echo "=== 第二波修复完成 ==="
