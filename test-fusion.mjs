#!/usr/bin/env node
/**
 * 测试 NSEM Fusion 修复
 */

import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MEMORY_DIR = path.join(homedir(), ".nsemclaw", "memory");
const MAIN_DB = path.join(MEMORY_DIR, "main.sqlite");

console.log("=== NSEM Fusion 路径测试 ===\n");

// 测试 1: 检查文件是否存在
console.log("1. 检查 Builtin Memory 路径:");
console.log(`   期望路径: ${MAIN_DB}`);

try {
  const db = new DatabaseSync(MAIN_DB, { readOnly: true });
  console.log("   ✅ 成功打开数据库 (只读模式)");
  
  // 测试查询
  const tablesStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = tablesStmt.all();
  console.log(`   📊 数据库表: ${tables.map(t => t.name).join(', ')}`);
  
  // 查询统计
  const filesStmt = db.prepare("SELECT COUNT(*) as count FROM files");
  const filesCount = filesStmt.get();
  console.log(`   📁 Files 表记录数: ${filesCount.count}`);
  
  const chunksStmt = db.prepare("SELECT COUNT(*) as count FROM chunks");
  const chunksCount = chunksStmt.get();
  console.log(`   📄 Chunks 表记录数: ${chunksCount.count}`);
  
  db.close();
  console.log("   ✅ 数据库测试通过\n");
} catch (err) {
  console.error(`   ❌ 错误: ${err.message}\n`);
}

// 测试 2: 检查 NSEM 向量数据库
console.log("2. 检查 NSEM 向量数据库:");
const NSEM_DB = path.join(homedir(), ".nsemclaw", "nsem2", "vectors", "vectors.db");
console.log(`   路径: ${NSEM_DB}`);

try {
  const db = new DatabaseSync(NSEM_DB, { readOnly: true });
  console.log("   ✅ 成功打开 NSEM 向量数据库");
  
  const vectorsStmt = db.prepare("SELECT COUNT(*) as count FROM vectors");
  const vectorsCount = vectorsStmt.get();
  console.log(`   🧬 向量数量: ${vectorsCount.count}`);
  
  db.close();
  console.log("   ✅ NSEM 数据库测试通过\n");
} catch (err) {
  console.error(`   ❌ 错误: ${err.message}\n`);
}

// 测试 3: 检查融合目录
console.log("3. 检查融合目录状态:");
const FUSION_DIR = path.join(homedir(), ".nsemclaw", "nsem2", "fusion");
console.log(`   期望路径: ${FUSION_DIR}`);

try {
  const fs = await import("node:fs/promises");
  const stats = await fs.stat(FUSION_DIR);
  if (stats.isDirectory()) {
    console.log("   ✅ 融合目录已存在");
    const files = await fs.readdir(FUSION_DIR);
    console.log(`   📂 内容: ${files.join(', ') || '(空)'}`);
  }
} catch (err) {
  console.log("   ℹ️ 融合目录尚未创建 (将在首次初始化时创建)");
}

console.log("\n=== 测试完成 ===");
