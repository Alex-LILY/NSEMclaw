#!/bin/bash
# 批量修复 cognitive-core 中的 TypeScript 错误 - 第五波

set -e

echo "=== 修复 cognitive-core TypeScript 错误 (第五波) ==="

# 1. 修复 NSEM2Adapter.ts - status 返回类型
echo "修复 NSEM2Adapter.ts..."
sed -i 's/backend: "builtin" as "builtin"/backend: "builtin"/g' src/cognitive-core/integration/NSEM2Adapter.ts || true

# 2. 修复 UnifiedEmbeddingEngine.ts - 属性不存在问题  
echo "修复 UnifiedEmbeddingEngine.ts..."
sed -i 's/agentCfg\.rerankerModel/(agentCfg as { rerankerModel?: string }).rerankerModel/g' src/cognitive-core/mind/perception/UnifiedEmbeddingEngine.ts || true
sed -i 's/defaultCfg\.rerankerModel/(defaultCfg as { rerankerModel?: string }).rerankerModel/g' src/cognitive-core/mind/perception/UnifiedEmbeddingEngine.ts || true
sed -i 's/agentCfg\.expansionModel/(agentCfg as { expansionModel?: string }).expansionModel/g' src/cognitive-core/mind/perception/UnifiedEmbeddingEngine.ts || true
sed -i 's/defaultCfg\.expansionModel/(defaultCfg as { expansionModel?: string }).expansionModel/g' src/cognitive-core/mind/perception/UnifiedEmbeddingEngine.ts || true

echo "=== 第五波修复完成 ==="
