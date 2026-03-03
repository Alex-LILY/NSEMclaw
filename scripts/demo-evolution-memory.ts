#!/usr/bin/env bun
/**
 * 进化记忆系统演示脚本
 *
 * 运行: bun scripts/demo-evolution-memory.ts
 */

import { getMemoryEcosystem, resetMemoryEcosystem } from "../src/evolution/memory/index.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🧠 进化记忆系统演示\n");
  console.log("=".repeat(60));

  // 重置以确保干净状态
  resetMemoryEcosystem();
  const memory = getMemoryEcosystem();

  // 1. 启动系统
  console.log("\n📌 步骤 1: 启动记忆生态系统\n");
  memory.start();
  await sleep(500);

  // 2. 添加一些示例记忆
  console.log("\n📌 步骤 2: 摄入示例记忆\n");

  const memories = [
    {
      content: "今天开始学习Rust语言，所有权系统是一个全新的概念。",
      type: "experience" as const,
      tags: ["rust", "learning", "programming"],
    },
    {
      content: "Rust的所有权规则：每个值都有一个所有者，值在任意时刻只能有一个所有者。",
      type: "fact" as const,
      tags: ["rust", "ownership", "rules"],
    },
    {
      content: "编程语言学习的关键在于理解其设计哲学，而非语法。",
      type: "insight" as const,
      tags: ["learning", "programming", "philosophy"],
    },
    {
      content: "之前学习Python时，也是从理解动态类型和鸭子类型开始的。",
      type: "experience" as const,
      tags: ["python", "learning", "history"],
    },
    {
      content: "好的编程语言应该具备：简洁性、表达力、安全性。",
      type: "pattern" as const,
      tags: ["programming", "languages", "principles"],
    },
    {
      content: "Rust的borrow checker在编译期防止数据竞争，这是革命性的设计。",
      type: "insight" as const,
      tags: ["rust", "safety", "compiler"],
    },
    {
      content: "学习新语言的最佳方式是通过实际项目，而非教程。",
      type: "experience" as const,
      tags: ["learning", "practice", "advice"],
    },
    {
      content: "类型系统越强大的语言，编译器能提供的保证就越多。",
      type: "pattern" as const,
      tags: ["types", "compiler", "languages"],
    },
  ];

  for (const mem of memories) {
    await memory.ingest(mem.content, {
      type: mem.type,
      tags: mem.tags,
    });
    await sleep(100);
  }

  // 3. 查看状态
  console.log("\n📌 步骤 3: 查看生态状态\n");
  const state = memory.getState();
  console.log(`记忆原子数: ${state.stats.totalAtoms}`);
  console.log(`关系边数: ${state.stats.totalEdges}`);
  console.log(`记忆场数: ${state.stats.totalFields}`);
  console.log(`健康度: ${(state.health.overall * 100).toFixed(1)}%`);

  // 4. 查询测试
  console.log("\n📌 步骤 4: 语义查询测试\n");

  const queries = ["Rust所有权学习", "编程语言设计", "学习方法"];

  for (const query of queries) {
    console.log(`\n🔍 查询: "${query}"`);
    const result = await memory.query({
      intent: query,
      strategy: "exploratory",
      constraints: { maxResults: 3 },
    });

    for (const item of result.atoms) {
      console.log(`   • [${item.atom.contentType}] ${item.atom.content.slice(0, 50)}...`);
      console.log(`     相关度: ${(item.relevance * 100).toFixed(0)}%`);
    }

    if (result.emergentRelations.length > 0) {
      console.log(`   ✨ 发现 ${result.emergentRelations.length} 个涌现关联`);
    }
  }

  // 5. 模拟多次访问（强化记忆）
  console.log("\n📌 步骤 5: 模拟记忆强化\n");

  const atoms = Array.from(memory.getAtoms().values());
  const rustAtoms = atoms.filter((a) => a.meta.tags.includes("rust"));

  console.log(`找到 ${rustAtoms.length} 个 Rust 相关记忆`);

  // 强化其中一条
  if (rustAtoms.length > 0) {
    for (let i = 0; i < 5; i++) {
      memory.reinforce(rustAtoms[0].id);
    }
    console.log(`强化记忆: ${rustAtoms[0].content.slice(0, 40)}...`);
    console.log(`新强度: ${(rustAtoms[0].strength.current * 100).toFixed(0)}%`);
  }

  // 6. 导出测试
  console.log("\n📌 步骤 6: 导出记忆\n");

  const exportDir = "/tmp/evolution-memory-export";
  const exported = await memory.exportToMarkdown({
    targetDir: exportDir,
    strategy: "full",
    organization: "temporal",
    includeMeta: true,
  });

  console.log(`导出 ${exported.length} 个文件到 ${exportDir}`);

  // 7. 触发进化
  console.log("\n📌 步骤 7: 触发记忆进化\n");

  await memory.evolve();

  const finalState = memory.getState();
  console.log(`\n进化后健康度: ${(finalState.health.overall * 100).toFixed(1)}%`);
  console.log(`晶体数: ${finalState.stats.totalCrystals}`);

  // 8. 停止系统
  console.log("\n📌 步骤 8: 停止系统\n");
  memory.stop();

  console.log("\n" + "=".repeat(60));
  console.log("✅ 演示完成!");
  console.log("\n你可以:");
  console.log(`  1. 查看导出文件: ls ${exportDir}`);
  console.log("  2. 使用CLI: nsemclaw memory start");
  console.log("  3. 查看API: src/evolution/memory/README.md");
}

main().catch(console.error);
