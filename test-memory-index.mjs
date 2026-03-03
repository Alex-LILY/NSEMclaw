#!/usr/bin/env node
/**
 * 测试 MemoryIndexManager 是否正确索引记忆文件
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 等待函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("=== Memory Index Test ===\n");
  
  // 清理旧数据库
  const dbPath = `${process.env.HOME}/.nsemclaw/memory/main.sqlite`;
  console.log(`Database path: ${dbPath}`);
  
  try {
    await import('fs').then(fs => fs.promises.unlink(dbPath));
    console.log("Cleaned old database");
  } catch (e) {
    console.log("No old database to clean");
  }
  
  // 使用 MemoryIndexManager
  console.log("\n--- Loading MemoryIndexManager ---");
  const { MemoryIndexManager } = await import('./dist/memory/manager.js');
  
  // 创建模拟配置
  const cfg = {
    agents: {
      defaults: {
        memorySearch: {
          enabled: true,
          provider: "none",  // FTS-only mode
          sources: ["memory"],
          store: {
            driver: "sqlite",
            path: "~/.nsemclaw/memory/main.sqlite",
            vector: { enabled: false }
          },
          chunking: { tokens: 500, overlap: 50 },
          cache: { enabled: false }
        }
      }
    }
  };
  
  const agentId = "test-agent";
  
  console.log("Creating MemoryIndexManager...");
  const manager = await MemoryIndexManager.get({ cfg, agentId });
  
  if (!manager) {
    console.error("Failed to create MemoryIndexManager");
    process.exit(1);
  }
  
  console.log("MemoryIndexManager created successfully");
  
  // 等待同步完成
  console.log("\n--- Waiting for sync to complete ---");
  await sleep(3000);
  
  // 检查数据库
  console.log("\n--- Checking database ---");
  const db = new Database(dbPath);
  
  const fileCount = db.prepare("SELECT COUNT(*) as count FROM files").get();
  console.log(`Files in database: ${fileCount.count}`);
  
  const chunkCount = db.prepare("SELECT COUNT(*) as count FROM chunks").get();
  console.log(`Chunks in database: ${chunkCount.count}`);
  
  // 检查 FTS 表
  try {
    const ftsCount = db.prepare("SELECT COUNT(*) as count FROM chunks_fts").get();
    console.log(`FTS entries: ${ftsCount.count}`);
  } catch (e) {
    console.log(`FTS check failed: ${e.message}`);
  }
  
  // 尝试搜索
  console.log("\n--- Testing search ---");
  try {
    const results = await manager.search({ 
      query: "project",
      limit: 5 
    });
    console.log(`Search returned ${results.length} results`);
    if (results.length > 0) {
      console.log("\nFirst result:");
      console.log(`  Path: ${results[0].path}`);
      console.log(`  Score: ${results[0].score}`);
      console.log(`  Content preview: ${results[0].content?.substring(0, 100)}...`);
    }
  } catch (e) {
    console.error(`Search failed: ${e.message}`);
    console.error(e.stack);
  }
  
  db.close();
  
  console.log("\n=== Test Complete ===");
  
  // 清理
  if (manager) {
    await manager.close?.();
  }
  
  process.exit(0);
}

main().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
