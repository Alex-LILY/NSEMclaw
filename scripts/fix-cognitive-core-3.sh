#!/bin/bash
# 批量修复 cognitive-core 中的 TypeScript 错误 - 第三波

set -e

echo "=== 修复 cognitive-core TypeScript 错误 (第三波) ==="

# 1. 修复 AutoIngestionService.ts - 添加缺失的导入
echo "修复 AutoIngestionService.ts 导入..."
sed -i 's|import type { ContentType } from "../types/index.js";|import type { MemoryScope, ContentType } from "../types/index.js";\nimport type { UnifiedNSEM2Core } from "../mind/nsem/UnifiedNSEM2Core.js";|g' src/cognitive-core/services/AutoIngestionService.ts || true

# 修复 log 调用 - 还剩一些没被修复的
sed -i 's/log(\n      "debug",/log.debug(/g' src/cognitive-core/services/ImportanceScorer.ts || true
sed -i 's/log(\n      "info",/log.info(/g' src/cognitive-core/services/*.ts || true
sed -i 's/log(\n      "warn",/log.warn(/g' src/cognitive-core/services/*.ts || true
sed -i 's/log(\n      "error",/log.error(/g' src/cognitive-core/services/*.ts || true

# 修复 multi-agent/ResilientSubagentOrchestrator.ts
sed -i 's|"../../logging/subsystem.js"|"../../../logging/subsystem.js"|g' src/cognitive-core/multi-agent/ResilientSubagentOrchestrator.ts || true

# 修复日志调用为模板字符串格式
sed -i 's/log.error(`Failed to process conversation end for \${sessionId}:`, err)/log.error(`Failed to process conversation end for ${sessionId}: ${err}`)/g' src/cognitive-core/services/AutoIngestionService.ts || true

echo "=== 第三波修复完成 ==="
