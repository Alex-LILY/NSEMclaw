#!/usr/bin/env node
/**
 * 视觉系统集成测试
 * 
 * 验证视觉模型引擎和 NSEMFusionCore 集成
 */

import { getVisionModelEngine } from './dist/cognitive-core/vision/index.js';
import { NSEM_PREDEFINED_MODELS } from './dist/cognitive-core/utils/model-downloader.js';

console.log("👁️ 视觉系统集成测试\n");

// 1. 检查模型配置
console.log("1. 模型配置:");
console.log("   视觉模型:", NSEM_PREDEFINED_MODELS.vision.name);
console.log("   路径:", NSEM_PREDEFINED_MODELS.vision.localPath);
console.log("   URL:", NSEM_PREDEFINED_MODELS.vision.url);
console.log("   预计大小:", (NSEM_PREDEFINED_MODELS.vision.expectedSize / 1024 / 1024).toFixed(0), "MB");
console.log();

console.log("   MMPROJ:", NSEM_PREDEFINED_MODELS.mmproj.name);
console.log("   路径:", NSEM_PREDEFINED_MODELS.mmproj.localPath);
console.log("   URL:", NSEM_PREDEFINED_MODELS.mmproj.url);
console.log();

// 2. 检查决策模型配置
console.log("2. 决策模型配置:");
console.log("   模型:", NSEM_PREDEFINED_MODELS.decision.name);
console.log("   路径:", NSEM_PREDEFINED_MODELS.decision.localPath);
console.log("   URL:", NSEM_PREDEFINED_MODELS.decision.url);
console.log();

// 3. 检查视觉引擎状态
console.log("3. 视觉引擎状态:");
const engine = getVisionModelEngine();
console.log("   模型可用:", engine.isModelAvailable());
console.log("   状态:", engine.getStatus());
console.log();

// 4. 使用说明
console.log("4. 使用说明:");
console.log("   安装视觉模型:");
console.log("   npx nsemclaw-cli local-model vision");
console.log();
console.log("   在代码中使用:");
console.log(`   import { NSEMFusionCore } from './dist/cognitive-core/NSEMFusionCore.js';
   
   const core = new NSEMFusionCore();
   await core.initialize();
   
   // 分析图片
   const result = await core.analyzeImage({
     imagePath: '/path/to/image.png',
     taskType: 'describe'  // 'describe' | 'ocr' | 'ui' | 'code'
   });
   console.log(result.description);
   `);
console.log();

console.log("✅ 测试完成");
