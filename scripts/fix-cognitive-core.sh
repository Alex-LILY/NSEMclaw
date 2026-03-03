#!/bin/bash
# 批量修复 cognitive-core 中的 TypeScript 错误

set -e

echo "=== 修复 cognitive-core TypeScript 错误 ==="

# 1. 修复 SubsystemLogger 调用模式: log("level", msg) -> log.level(msg)
echo "修复 SubsystemLogger 调用模式..."

# 修复 SmartEmbeddingEngine.ts
sed -i 's/log("info", /log.info(/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts
sed -i 's/log("debug", /log.debug(/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts
sed -i 's/log("warn", /log.warn(/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts
sed -i 's/log("error", /log.error(/g' src/cognitive-core/mind/perception/SmartEmbeddingEngine.ts

# 修复 NSEM2Core.ts
sed -i 's/log("info", /log.info(/g' src/cognitive-core/mind/nsem/NSEM2Core.ts
sed -i 's/log("debug", /log.debug(/g' src/cognitive-core/mind/nsem/NSEM2Core.ts
sed -i 's/log("warn", /log.warn(/g' src/cognitive-core/mind/nsem/NSEM2Core.ts
sed -i 's/log("error", /log.error(/g' src/cognitive-core/mind/nsem/NSEM2Core.ts

# 修复 UnifiedNSEM2Core.ts
sed -i 's/log("info", /log.info(/g' src/cognitive-core/mind/nsem/UnifiedNSEM2Core.ts
sed -i 's/log("debug", /log.debug(/g' src/cognitive-core/mind/nsem/UnifiedNSEM2Core.ts
sed -i 's/log("warn", /log.warn(/g' src/cognitive-core/mind/nsem/UnifiedNSEM2Core.ts
sed -i 's/log("error", /log.error(/g' src/cognitive-core/mind/nsem/UnifiedNSEM2Core.ts

# 修复 PersistentSelectiveMemoryInheritance.ts
sed -i 's/log("info", /log.info(/g' src/cognitive-core/memory/PersistentSelectiveMemoryInheritance.ts
sed -i 's/log("debug", /log.debug(/g' src/cognitive-core/memory/PersistentSelectiveMemoryInheritance.ts
sed -i 's/log("warn", /log.warn(/g' src/cognitive-core/memory/PersistentSelectiveMemoryInheritance.ts
sed -i 's/log("error", /log.error(/g' src/cognitive-core/memory/PersistentSelectiveMemoryInheritance.ts

# 修复 services 目录
for f in src/cognitive-core/services/*.ts; do
  sed -i 's/log("info", /log.info(/g' "$f" || true
  sed -i 's/log("debug", /log.debug(/g' "$f" || true
  sed -i 's/log("warn", /log.warn(/g' "$f" || true
  sed -i 's/log("error", /log.error(/g' "$f" || true
done

# 修复 multi-agent 目录
for f in src/cognitive-core/multi-agent/*.ts; do
  sed -i 's/log("info", /log.info(/g' "$f" || true
  sed -i 's/log("debug", /log.debug(/g' "$f" || true
  sed -i 's/log("warn", /log.warn(/g' "$f" || true
  sed -i 's/log("error", /log.error(/g' "$f" || true
done

# 修复 storage 目录
for f in src/cognitive-core/storage/*.ts; do
  sed -i 's/log("info", /log.info(/g' "$f" || true
  sed -i 's/log("debug", /log.debug(/g' "$f" || true
  sed -i 's/log("warn", /log.warn(/g' "$f" || true
  sed -i 's/log("error", /log.error(/g' "$f" || true
done

# 修复 utils 目录
for f in src/cognitive-core/utils/*.ts; do
  sed -i 's/log("info", /log.info(/g' "$f" || true
  sed -i 's/log("debug", /log.debug(/g' "$f" || true
  sed -i 's/log("warn", /log.warn(/g' "$f" || true
  sed -i 's/log("error", /log.error(/g' "$f" || true
done

echo "完成 SubsystemLogger 修复"

# 2. 修复 module 导入路径
echo "修复模块导入路径..."

# 修复 config.ts
sed -i 's|from "../../config/config\.js"|from "../../config/config\.ts"|g' src/cognitive-core/config.ts || true

echo "完成模块导入路径修复"

echo "=== 批量修复完成 ==="
