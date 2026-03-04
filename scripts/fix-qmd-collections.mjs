#!/usr/bin/env node
/**
 * QMD Collection 诊断修复脚本
 * 
 * 问题: workspace-all collection 的 pattern 被错误设置，导致无法索引文件
 * 解决: 删除错误的 collections 并重新创建
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const COLLECTIONS_TO_FIX = ["workspace-all", "sessions-main"];

function runQmd(args) {
  return new Promise((resolve, reject) => {
    const qmdPath = process.env.QMD_BINARY || "qmd";
    const child = spawn(qmdPath, args, {
      cwd: homedir(),
      env: { ...process.env, QMD_PATH: join(homedir(), ".nsemclaw", "memory") },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`qmd ${args.join(" ")} failed (code ${code}): ${stderr || stdout}`));
      }
    });
  });
}

async function listCollections() {
  try {
    const { stdout } = await runQmd(["collection", "list", "--json"]);
    return JSON.parse(stdout);
  } catch (err) {
    console.error("❌ 无法列出 collections:", err.message);
    return [];
  }
}

async function removeCollection(name) {
  try {
    await runQmd(["collection", "remove", name]);
    console.log(`✅ 已删除 collection: ${name}`);
    return true;
  } catch (err) {
    if (err.message.includes("not found") || err.message.includes("不存在")) {
      console.log(`ℹ️  collection ${name} 不存在，无需删除`);
      return true;
    }
    console.error(`❌ 删除 collection ${name} 失败:`, err.message);
    return false;
  }
}

async function addCollection(name, path, pattern) {
  try {
    const args = [
      "collection", "add", path,
      "--name", name,
      "--mask", pattern,
      "--chunk-size", "800",
      "--chunk-overlap", "100"
    ];
    await runQmd(args);
    console.log(`✅ 已创建 collection: ${name} (${path}, pattern: ${pattern})`);
    return true;
  } catch (err) {
    console.error(`❌ 创建 collection ${name} 失败:`, err.message);
    return false;
  }
}

async function main() {
  console.log("🔧 QMD Collection 诊断修复工具");
  console.log("================================\n");

  // 1. 列出当前 collections
  console.log("📋 当前 collections 状态:");
  const collections = await listCollections();
  
  for (const col of collections) {
    console.log(`\n  - ${col.name}:`);
    console.log(`    Path: ${col.path || "N/A"}`);
    console.log(`    Pattern: ${col.pattern || "N/A"}`);
    console.log(`    Files: ${col.fileCount || 0}`);
    
    // 检查是否有问题
    if (COLLECTIONS_TO_FIX.includes(col.name)) {
      if (!col.pattern || col.pattern === "**/*.md") {
        console.log(`    ✅ Pattern 正确`);
      } else {
        console.log(`    ⚠️  Pattern 异常: ${col.pattern}`);
      }
    }
  }

  console.log("\n" + "=".repeat(40));
  
  // 2. 询问是否修复
  const shouldFix = process.argv.includes("--fix");
  
  if (!shouldFix) {
    console.log("\n💡 使用 --fix 参数执行修复操作:");
    console.log("   node scripts/fix-qmd-collections.mjs --fix");
    console.log("\n⚠️  修复将删除并重新创建以下 collections:");
    console.log(`   ${COLLECTIONS_TO_FIX.join(", ")}`);
    process.exit(0);
  }

  // 3. 执行修复
  console.log("\n🔨 开始修复...\n");

  const workspaceDir = join(homedir(), ".nsemclaw", "workspace");
  const sessionsDir = join(homedir(), ".nsemclaw", "agents", "main", "qmd", "sessions");

  // 删除并重新创建 workspace-all
  console.log("1️⃣  修复 workspace-all...");
  await removeCollection("workspace-all");
  await addCollection("workspace-all", workspaceDir, "**/*.md");

  // 删除并重新创建 sessions-main
  console.log("\n2️⃣  修复 sessions-main...");
  await removeCollection("sessions-main");
  await addCollection("sessions-main", sessionsDir, "**/*.md");

  console.log("\n" + "=".repeat(40));
  console.log("\n✅ 修复完成！");
  console.log("\n📋 修复后的 collections:");
  const newCollections = await listCollections();
  for (const col of newCollections) {
    if (COLLECTIONS_TO_FIX.includes(col.name)) {
      console.log(`\n  - ${col.name}:`);
      console.log(`    Path: ${col.path || "N/A"}`);
      console.log(`    Pattern: ${col.pattern || "N/A"}`);
      console.log(`    Files: ${col.fileCount || 0}`);
    }
  }

  console.log("\n📝 下一步:");
  console.log("   重启 NSEMclaw 以重新索引文件");
  console.log("   或等待自动同步触发");
}

main().catch(console.error);
