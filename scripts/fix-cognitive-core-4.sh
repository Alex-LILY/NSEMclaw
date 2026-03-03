#!/bin/bash
# 批量修复 cognitive-core 中的 TypeScript 错误 - 第四波

set -e

echo "=== 修复 cognitive-core TypeScript 错误 (第四波) ==="

# 1. 修复 SmartEmbeddingEngine.ts - 第 319 行 rerankScore 不存在问题
echo "修复 SmartEmbeddingEngine.ts..."
sed -i 's/(b.score ?? b.rerankScore) - (a.score ?? a.rerankScore)/((b as unknown as { rerankScore?: number }).rerankScore ?? b.score) - ((a as unknown as { rerankScore?: number }).rerankScore ?? a.score)/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts || true

# 2. 修复 AutoIngestionService.ts - 第 276 行 generateId 参数问题
echo "修复 AutoIngestionService.ts..."
sed -i 's/id: generateId("msg"),/id: generateId("msg", message.content ?? Date.now().toString()),/g' src/cognitive-core/services/AutoIngestionService.ts || true

# 3. 修复 AutoIngestionService.ts - 第 584 行类型问题
sed -i 's/scope: rule.ingestion.scope,/scope: rule.ingestion.scope ?? "local",/g' src/cognitive-core/services/AutoIngestionService.ts || true

# 4. 修复 AutoIngestionService.ts - 第 591 行日志参数
sed -i 's/log.error(`提取记忆失败 (\${extracted.length}\/\${extracted.length + failed}):`, err)/log.error(`提取记忆失败 (${extracted.length}\/${extracted.length + failed}): ${err}`)/g' src/cognitive-core/services/AutoIngestionService.ts || true

echo "=== 第四波修复完成 ==="
