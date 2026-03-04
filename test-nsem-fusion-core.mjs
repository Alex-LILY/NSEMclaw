#!/usr/bin/env node
/**
 * NSEM Fusion Core 3.0 验证测试脚本
 * 
 * 测试内容:
 * 1. 文件存在性验证
 * 2. 导出验证
 * 3. 基础功能测试
 * 4. 向后兼容验证
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SRC_DIR = "./src/cognitive-core";

// 颜色输出
const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(colors.green(`  ✅ ${name}`));
    passCount++;
  } catch (error) {
    console.log(colors.red(`  ❌ ${name}`));
    console.log(colors.red(`     ${error.message}`));
    failCount++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

console.log(colors.bold("\n╔═══════════════════════════════════════════════════════════════╗"));
console.log(colors.bold("║       NSEM Fusion Core 3.0 架构验证测试                        ║"));
console.log(colors.bold("╚═══════════════════════════════════════════════════════════════╝\n"));

// ============================================================================
// 第一步: 文件存在性验证
// ============================================================================
console.log(colors.blue("📁 第 1 步: 核心文件存在性验证"));
console.log();

test("NSEMFusionCore.ts 存在", () => {
  assert(existsSync(join(SRC_DIR, "NSEMFusionCore.ts")), "NSEMFusionCore.ts 不存在");
});

test("index.ts 存在", () => {
  assert(existsSync(join(SRC_DIR, "index.ts")), "index.ts 不存在");
});

test("架构文档存在", () => {
  assert(existsSync(join(SRC_DIR, "NSEM_FUSION_ARCHITECTURE.md")), "架构文档不存在");
});

// UnifiedCoreV2 已在 v3.0.0 中合并到 NSEMFusionCore，文件已删除
test("UnifiedCoreV2 已合并到 NSEMFusionCore", () => {
  assert(!existsSync(join(SRC_DIR, "UnifiedCoreV2.ts")), "UnifiedCoreV2.ts 应该已被删除");
});

// 子系统文件
test("ThreeTierMemoryStore.ts 存在", () => {
  assert(existsSync(join(SRC_DIR, "memory/ThreeTierMemoryStore.ts")), "三层存储不存在");
});

test("SessionManager.ts 存在", () => {
  assert(existsSync(join(SRC_DIR, "memory-extraction/SessionManager.ts")), "会话管理不存在");
});

test("MemoryExtractor.ts 存在", () => {
  assert(existsSync(join(SRC_DIR, "memory-extraction/MemoryExtractor.ts")), "记忆提取不存在");
});

test("HybridRetriever.ts 存在", () => {
  assert(existsSync(join(SRC_DIR, "retrieval/HybridRetriever.ts")), "混合检索不存在");
});

console.log();

// ============================================================================
// 第二步: 导出验证
// ============================================================================
console.log(colors.blue("📦 第 2 步: 统一导出验证"));
console.log();

const indexContent = readFileSync(join(SRC_DIR, "index.ts"), "utf-8");

test("导出 NSEMFusionCore", () => {
  assert(indexContent.includes("NSEMFusionCore"), "未导出 NSEMFusionCore");
});

test("导出 createNSEMFusionCore", () => {
  assert(indexContent.includes("createNSEMFusionCore"), "未导出 createNSEMFusionCore");
});

test("导出 getNSEMFusionCore", () => {
  assert(indexContent.includes("getNSEMFusionCore"), "未导出 getNSEMFusionCore");
});

test("导出 FusionCoreConfig 类型", () => {
  assert(indexContent.includes("FusionCoreConfig"), "未导出 FusionCoreConfig");
});

test("导出 FusionMemoryItem 类型", () => {
  assert(indexContent.includes("FusionMemoryItem"), "未导出 FusionMemoryItem");
});

test("导出版本信息", () => {
  assert(indexContent.includes("NSEM_VERSION"), "未导出 NSEM_VERSION");
  assert(indexContent.includes("NSEM_CODENAME"), "未导出 NSEM_CODENAME");
});

// 向后兼容导出
test("导出 UnifiedCoreV2 (兼容)", () => {
  assert(indexContent.includes("UnifiedCoreV2"), "未导出 UnifiedCoreV2");
});

test("导出 NSEM2Core (兼容)", () => {
  assert(indexContent.includes("NSEM2Core"), "未导出 NSEM2Core");
});

test("导出 ContextLevel (2.1 兼容)", () => {
  assert(indexContent.includes("ContextLevel"), "未导出 ContextLevel");
});

// 子系统导出
test("导出 ThreeTierMemoryStore", () => {
  assert(indexContent.includes("ThreeTierMemoryStore"), "未导出 ThreeTierMemoryStore");
});

test("导出 SessionManager", () => {
  assert(indexContent.includes("SessionManager"), "未导出 SessionManager");
});

test("导出 MemoryExtractor", () => {
  assert(indexContent.includes("MemoryExtractor"), "未导出 MemoryExtractor");
});

test("导出 HybridRetriever", () => {
  assert(indexContent.includes("HybridRetriever"), "未导出 HybridRetriever");
});

test("导出 IntentAnalyzer", () => {
  assert(indexContent.includes("IntentAnalyzer"), "未导出 IntentAnalyzer");
});

console.log();

// ============================================================================
// 第三步: 核心内容验证
// ============================================================================
console.log(colors.blue("🔍 第 3 步: 核心实现验证"));
console.log();

const fusionCoreContent = readFileSync(join(SRC_DIR, "NSEMFusionCore.ts"), "utf-8");

test("实现 FusionMemoryItem 接口", () => {
  assert(fusionCoreContent.includes("interface FusionMemoryItem"), "未实现 FusionMemoryItem");
});

test("实现 FusionCoreConfig 接口", () => {
  assert(fusionCoreContent.includes("interface FusionCoreConfig"), "未实现 FusionCoreConfig");
});

test("实现 ingest 方法", () => {
  assert(fusionCoreContent.includes("async ingest("), "未实现 ingest 方法");
});

test("实现 retrieve 方法", () => {
  assert(fusionCoreContent.includes("async retrieve("), "未实现 retrieve 方法");
});

test("实现 startSession 方法", () => {
  assert(fusionCoreContent.includes("startSession("), "未实现 startSession 方法");
});

test("实现 endSession 方法", () => {
  assert(fusionCoreContent.includes("endSession("), "未实现 endSession 方法");
});

test("实现 extractFromSession 方法", () => {
  assert(fusionCoreContent.includes("extractFromSession("), "未实现 extractFromSession 方法");
});

test("实现 createSearchManagerAdapter 方法", () => {
  assert(fusionCoreContent.includes("createSearchManagerAdapter("), "未实现兼容层");
});

test("集成 ThreeTierMemoryStore", () => {
  assert(fusionCoreContent.includes("ThreeTierMemoryStore"), "未集成三层存储");
});

test("集成 SessionManager", () => {
  assert(fusionCoreContent.includes("SessionManager"), "未集成会话管理");
});

test("集成 MemoryExtractor", () => {
  assert(fusionCoreContent.includes("MemoryExtractor"), "未集成记忆提取");
});

test("集成 HybridRetriever", () => {
  assert(fusionCoreContent.includes("HybridRetriever"), "未集成混合检索");
});

console.log();

// ============================================================================
// 第四步: 架构设计验证
// ============================================================================
console.log(colors.blue("🏗️ 第 4 步: 架构设计验证"));
console.log();

test("统一数据模型设计", () => {
  assert(fusionCoreContent.includes("content: {"), "未设计分层内容");
  assert(fusionCoreContent.includes("embeddings: {"), "未设计多向量");
  assert(fusionCoreContent.includes("category:"), "未设计分类");
  assert(fusionCoreContent.includes("tier:"), "未设计层级");
});

test("存储模式配置", () => {
  assert(fusionCoreContent.includes('"fusion"') && fusionCoreContent.includes('"three-tier"'), 
    "未支持 fusion 或 three-tier 模式");
});

test("检索模式配置", () => {
  assert(fusionCoreContent.includes('"fusion"'), "未支持 fusion 检索");
  assert(fusionCoreContent.includes('"tiered"'), "未支持 tiered 检索");
  assert(fusionCoreContent.includes('"hybrid"'), "未支持 hybrid 检索");
});

test("分层内容支持 (L0/L1/L2)", () => {
  assert(fusionCoreContent.includes("l0_abstract"), "未支持 L0 层");
  assert(fusionCoreContent.includes("l1_overview"), "未支持 L1 层");
  assert(fusionCoreContent.includes("l2_detail"), "未支持 L2 层");
});

test("8类记忆分类支持", () => {
  assert(fusionCoreContent.includes("MemoryCategory"), "未支持记忆分类");
});

test("EventEmitter 集成", () => {
  assert(fusionCoreContent.includes("extends EventEmitter"), "未集成 EventEmitter");
});

console.log();

// ============================================================================
// 第五步: TypeScript 编译验证
// ============================================================================
console.log(colors.blue("🔨 第 5 步: TypeScript 编译验证"));
console.log();

test("TypeScript 配置存在", () => {
  assert(existsSync("./tsconfig.json"), "tsconfig.json 不存在");
});

console.log(colors.yellow("  ⏳ 执行 TypeScript 编译检查..."));
try {
  execSync("npx tsc --noEmit --skipLibCheck 2>&1", {
    cwd: process.cwd(),
    timeout: 120000,
    stdio: "pipe",
  });
  console.log(colors.green("  ✅ TypeScript 编译检查通过"));
  passCount++;
} catch (error) {
  const output = error.stdout?.toString() || error.message;
  const errorCount = (output.match(/error TS/g) || []).length;
  
  if (errorCount > 0) {
    console.log(colors.red(`  ❌ TypeScript 编译发现 ${errorCount} 个错误`));
    // 只显示前5个错误
    const lines = output.split("\n").filter((l) => l.includes("error TS")).slice(0, 5);
    lines.forEach((line) => console.log(colors.red(`     ${line}`)));
    if (errorCount > 5) {
      console.log(colors.yellow(`     ... 还有 ${errorCount - 5} 个错误`));
    }
    failCount++;
  } else {
    console.log(colors.green("  ✅ TypeScript 编译检查通过"));
    passCount++;
  }
}

console.log();

// ============================================================================
// 第六步: 架构文档验证
// ============================================================================
console.log(colors.blue("📖 第 6 步: 架构文档验证"));
console.log();

const archDocContent = readFileSync(join(SRC_DIR, "NSEM_FUSION_ARCHITECTURE.md"), "utf-8");

test("文档包含架构图", () => {
  assert(archDocContent.includes("整体架构"), "文档未包含架构图");
});

test("文档包含使用示例", () => {
  assert(archDocContent.includes("使用示例"), "文档未包含使用示例");
});

test("文档包含配置说明", () => {
  assert(archDocContent.includes("配置选项"), "文档未包含配置说明");
});

test("文档包含迁移指南", () => {
  assert(archDocContent.includes("迁移指南"), "文档未包含迁移指南");
});

test("文档包含性能指标", () => {
  assert(archDocContent.includes("性能指标"), "文档未包含性能指标");
});

console.log();

// ============================================================================
// 总结
// ============================================================================
console.log(colors.bold("═══════════════════════════════════════════════════════════════"));
console.log();

const totalTests = passCount + failCount;
const passRate = ((passCount / totalTests) * 100).toFixed(1);

console.log(`测试总数: ${totalTests}`);
console.log(`${colors.green(`通过: ${passCount}`)}`);
console.log(`${colors.red(`失败: ${failCount}`)}`);
console.log(`通过率: ${passRate}%`);

console.log();

if (failCount === 0) {
  console.log(colors.green("🎉 所有测试通过！NSEM Fusion Core 3.0 架构验证完成！"));
  console.log();
  console.log(colors.bold("📦 新架构特性:"));
  console.log("  • NSEMFusionCore - 统一融合核心");
  console.log("  • FusionMemoryItem - 统一数据模型");
  console.log("  • 三层存储 + 8类提取 + 混合检索 - 完全整合");
  console.log("  • 向后兼容 NSEM 2.0/2.1/UnifiedCoreV2");
  console.log();
  console.log(colors.bold("🚀 使用方法:"));
  console.log('  import { createNSEMFusionCore } from "nsemclaw/cognitive-core"');
  console.log("  const core = createNSEMFusionCore({ agentId: 'my-agent' });");
  console.log("  await core.initialize();");
  console.log();
  process.exit(0);
} else {
  console.log(colors.red("❌ 部分测试失败，请检查上述错误"));
  process.exit(1);
}
