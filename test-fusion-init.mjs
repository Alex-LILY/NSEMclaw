#!/usr/bin/env node
/**
 * 测试 NSEM Fusion 完整初始化
 */

import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

console.log("=== NSEM Fusion 完整初始化测试 ===\n");

// 加载配置
console.log("1. 加载配置...");
const configPath = path.join(homedir(), ".nsemclaw", "nsemclaw.json");
const config = JSON.parse(await fs.readFile(configPath, "utf-8"));

const nsemConfig = config.agents?.defaults?.nsem;
console.log(`   NSEM 启用状态: ${nsemConfig?.enabled ?? '未配置'}`);
console.log(`   资源模式: ${nsemConfig?.resourceMode ?? 'balanced'}`);

// 动态导入模块
console.log("\n2. 加载 NSEM 模块...");
const { getNSEM2Core } = await import("./dist/cognitive-core/mind/nsem/NSEM2Core.js");
const { NSEMFusionAdapter } = await import("./dist/memory/fusion/nsem-fusion-adapter.js");
const { resolveMemorySearchConfig } = await import("./dist/agents/memory-search.js");

console.log("   ✅ 模块加载成功");

// 初始化 NSEM
console.log("\n3. 初始化 NSEM Core...");
const agentId = "main";
const memoryConfig = resolveMemorySearchConfig(config, agentId);

const nsem = await getNSEM2Core(config, agentId, memoryConfig, {
  resourceMode: nsemConfig?.resourceMode ?? "balanced",
});
await nsem.start();

const stats = nsem.getStats();
console.log(`   ✅ NSEM 启动成功`);
console.log(`   📊 原子: ${stats.totalAtoms}, 边: ${stats.totalEdges}, 场: ${stats.totalFields}`);

// 初始化 Fusion Adapter
console.log("\n4. 初始化 NSEM Fusion Adapter...");
const fusionAdapter = new NSEMFusionAdapter(nsem, config, agentId, {
  dualWrite: nsemConfig?.fusion?.dualWrite ?? true,
  progressiveMigration: nsemConfig?.fusion?.progressiveMigration ?? true,
  migrationThreshold: nsemConfig?.fusion?.migrationThreshold ?? 5,
  keepSnapshots: nsemConfig?.fusion?.keepSnapshots ?? true,
  queryExternalMetadata: nsemConfig?.fusion?.queryExternalMetadata ?? true,
  fallbackMode: nsemConfig?.fusion?.fallbackMode ?? false,
});

await fusionAdapter.initialize();
console.log("   ✅ Fusion Adapter 初始化成功");

// 检查融合目录
console.log("\n5. 检查融合系统文件...");
const fusionDir = path.join(homedir(), ".nsemclaw", "nsem2", "fusion", agentId);
try {
  const files = await fs.readdir(fusionDir);
  console.log(`   ✅ 融合目录已创建: ${fusionDir}`);
  console.log(`   📂 文件: ${files.join(', ')}`);
} catch (err) {
  console.log(`   ℹ️ 融合目录尚未创建: ${err.message}`);
}

// 获取状态
console.log("\n6. 获取 Fusion Adapter 状态...");
const status = fusionAdapter.status();
console.log(`   后端: ${status.backend}`);
console.log(`   提供者: ${status.provider}`);
console.log(`   模型: ${status.model}`);
console.log(`   自定义状态:`, JSON.stringify(status.custom, null, 2));

// 测试搜索
console.log("\n7. 测试搜索功能...");
try {
  const results = await fusionAdapter.search("session", { maxResults: 5 });
  console.log(`   ✅ 搜索成功，返回 ${results.length} 条结果`);
  if (results.length > 0) {
    console.log(`   📄 第一条: ${results[0].path} (分数: ${results[0].score.toFixed(3)})`);
  }
} catch (err) {
  console.error(`   ❌ 搜索失败: ${err.message}`);
}

// 关闭
console.log("\n8. 关闭 Fusion Adapter...");
await fusionAdapter.close();
await nsem.stop();
console.log("   ✅ 已关闭");

console.log("\n=== 测试完成 ===");
