#!/usr/bin/env bun
/**
 * NSEM 2.0 演示脚本
 *
 * 展示与 OpenClaw 本地模型集成的进化记忆系统
 *
 * 运行: bun scripts/demo-nsem2.ts
 */

import type { ResolvedMemorySearchConfig } from "../src/agents/memory-search.js";
import { NSEM2Core } from "../src/cognitive-core/mind/nsem/NSEM2Core.js";
import type { OpenClawConfig } from "../src/config/config.js";

// 模拟配置
const mockConfig: OpenClawConfig = {} as any;

const mockMemoryConfig: ResolvedMemorySearchConfig = {
  enabled: true,
  sources: ["memory"],
  extraPaths: [],
  provider: "local",
  fallback: "none",
  model: "embedding-gemma-300m",
  local: {
    modelPath: "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf",
    modelCacheDir: "~/.nsemclaw/models",
  },
  store: {
    driver: "sqlite",
    path: "~/.nsemclaw/memory/test.sqlite",
    vector: { enabled: true },
  },
  chunking: { tokens: 400, overlap: 80 },
  sync: {
    onSessionStart: true,
    onSearch: true,
    watch: true,
    watchDebounceMs: 1500,
    intervalMinutes: 0,
    sessions: { deltaBytes: 100000, deltaMessages: 50 },
  },
  query: {
    maxResults: 10,
    minScore: 0.35,
    hybrid: {
      enabled: true,
      vectorWeight: 0.7,
      textWeight: 0.3,
      candidateMultiplier: 4,
      mmr: { enabled: false, lambda: 0.7 },
      temporalDecay: { enabled: false, halfLifeDays: 30 },
    },
  },
  cache: { enabled: true },
  experimental: { sessionMemory: false },
};

async function main() {
  console.log("🧠 NSEM 2.0 演示\n");
  console.log("=".repeat(60));

  // 创建 NSEM 2.0 核心
  console.log("\n📌 初始化 NSEM 2.0...");
  console.log("   模型: embedding-gemma-300M");
  console.log("   模式: 自动检测");

  try {
    const nsem = await NSEM2Core.create(mockConfig, "demo-agent", mockMemoryConfig, {
      resourceMode: "balanced",
    });

    await nsem.start();

    // 摄入示例记忆
    console.log("\n📌 摄入示例记忆...\n");

    const memories = [
      {
        content: "今天开始学习Rust语言，所有权系统是一个全新的概念",
        type: "experience" as const,
        tags: ["rust", "learning"],
      },
      {
        content: "Rust的所有权规则：每个值都有一个所有者",
        type: "fact" as const,
        tags: ["rust", "ownership"],
      },
      {
        content: "编程语言学习的关键在于理解设计哲学",
        type: "insight" as const,
        tags: ["learning", "philosophy"],
      },
      {
        content: "之前学Python也是从理解动态类型开始的",
        type: "experience" as const,
        tags: ["python", "learning"],
      },
      {
        content: "好的语言应该具备：简洁性、表达力、安全性",
        type: "pattern" as const,
        tags: ["languages", "principles"],
      },
      {
        content: "Rust的borrow checker在编译期防止数据竞争",
        type: "insight" as const,
        tags: ["rust", "safety"],
      },
    ];

    for (const mem of memories) {
      await nsem.ingest(mem.content, {
        type: mem.type,
        tags: mem.tags,
      });
    }

    console.log(`\n✅ 已摄入 ${memories.length} 条记忆`);
    console.log(`   原子数: ${nsem.getAtoms().size}`);
    console.log(`   场数: ${nsem.getFields().size}`);
    console.log(`   关系边: ${nsem.getEdges().size}`);

    // 测试查询
    console.log("\n📌 测试记忆激活\n");

    const queries = ["Rust所有权学习", "编程语言设计", "学习经验"];

    for (const query of queries) {
      console.log(`\n🔍 查询: "${query}"`);

      const result = await nsem.activate({
        intent: query,
        strategy: "exploratory",
        constraints: { maxResults: 3 },
      });

      console.log(`   激活原子: ${result.atoms.length}`);
      console.log(`   一致性: ${(result.semantic.coherence * 100).toFixed(1)}%`);

      for (let i = 0; i < Math.min(2, result.atoms.length); i++) {
        const atom = result.atoms[i];
        console.log(
          `   ${i + 1}. [${atom.atom.contentType}] ${atom.atom.content.slice(0, 40)}... (${(atom.relevance * 100).toFixed(0)}%)`,
        );
      }

      if (result.emergentRelations.length > 0) {
        console.log(`   ✨ 涌现关联: ${result.emergentRelations.length} 个`);
      }
    }

    // 手动进化
    console.log("\n📌 触发记忆进化...");
    await nsem.evolve();

    // 停止
    await nsem.stop();

    console.log("\n" + "=".repeat(60));
    console.log("✅ 演示完成!");
    console.log("\nNSEM 2.0 特性:");
    console.log("  • 复用 OpenClaw 本地模型");
    console.log("  • 渐进加载，资源自适应");
    console.log("  • 智能重排序优化");
    console.log("  • 自动记忆进化");
  } catch (error) {
    console.error("\n❌ 演示失败:", error);
    console.log("\n注意: 首次运行需要下载模型 (~300MB)");
    console.log("模型将自动下载到 ~/.nsemclaw/models/");
  }
}

main();
