/**
 * UnifiedNSEM2Core 完整使用示例
 *
 * 展示 P1 和 P2 所有功能的集成使用
 */

import type { ResolvedMemorySearchConfig } from "../../agents/memory-search.js";
import type { NsemclawConfig } from "../../config/config.js";
import { createUnifiedNSEM2Core, type UnifiedNSEM2Core } from "../mind/nsem/UnifiedNSEM2Core.js";
import {
  createAutoIngestionService,
  createImportanceScorer,
  createPeriodicMaintenanceService,
} from "../services/index.js";

/**
 * 示例 1: 基础使用 - 创建统一核心
 */
async function example1_basicUsage() {
  console.log("=== 示例 1: 基础使用 ===");

  const cfg = {
    model: { provider: "openai", model: "gpt-4" },
    embedding: { provider: "local", model: "all-MiniLM-L6-v2" },
  } as unknown as NsemclawConfig;

  const memoryConfig = {
    enabled: true,
    provider: "local",
  } as unknown as ResolvedMemorySearchConfig;

  // 创建统一核心
  const core = await createUnifiedNSEM2Core(cfg, "example-agent", memoryConfig, {
    // P1: 动态模型加载 - 配置允许时全部加载
    modelLoading: {
      strategy: "load-all",
      fallbackStrategy: "on-demand",
      priorityOrder: ["embedding", "reranker", "expansion"],
      minMemoryGb: 4,
    },

    // P1: 三层存储配置
    tieredStorage: {
      workingCapacity: 15,
      shortTermCapacity: 1000,
      longTermDiskLimit: 10000,
      autoTierTransition: true,
      tierCheckIntervalMs: 60000,
    },

    // P1: 批量加载配置
    batchLoading: {
      enabled: true,
      batchSize: 100,
      maxConcurrent: 5,
      progressIntervalMs: 1000,
    },

    // P1: 异步写入配置
    asyncWrite: {
      enabled: true,
      maxQueueSize: 1000,
      flushIntervalMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
    },

    // P1: 系统资源检测
    systemResource: {
      monitoringIntervalMs: 30000,
      memoryWarningPercent: 75,
      memoryCriticalPercent: 90,
      cpuWarningPercent: 80,
      autoAdjust: true,
    },
  });

  await core.start();

  // 单条摄入
  const atom1 = await core.ingest("这是一个重要的事实", {
    type: "fact",
    scope: "personal",
    tags: ["example", "important"],
    strength: 0.8,
  });
  console.log(`摄入记忆: ${atom1.content} (ID: ${atom1.id.slice(0, 8)})`);

  // 检索记忆
  const result = await core.activate({
    intent: "重要事实",
    strategy: "precise",
    constraints: { maxResults: 5 },
  });
  console.log(`检索到 ${result.atoms.length} 条记忆`);

  // 获取统计
  const stats = core.getStats();
  console.log("系统统计:", {
    memory: stats.memory,
    cacheHitRate: `${(stats.cache.hitRate * 100).toFixed(1)}%`,
  });

  await core.stop();
}

/**
 * 示例 2: 批量操作
 */
async function example2_batchOperations(core: UnifiedNSEM2Core) {
  console.log("\n=== 示例 2: 批量操作 ===");

  // 批量摄入
  const batchResult = await core.ingestBatch(
    [
      { content: "批量记忆 1", type: "fact", tags: ["batch"] },
      { content: "批量记忆 2", type: "insight", tags: ["batch"] },
      { content: "批量记忆 3", type: "experience", tags: ["batch"] },
      { content: "批量记忆 4", type: "pattern", tags: ["batch"] },
      { content: "批量记忆 5", type: "narrative", tags: ["batch"] },
    ],
    {
      onProgress: (completed, total) => {
        console.log(`批量摄入进度: ${completed}/${total}`);
      },
    },
  );

  console.log(`批量摄入完成: 成功 ${batchResult.succeeded}, 失败 ${batchResult.failed}`);
  console.log(`耗时: ${batchResult.durationMs}ms`);

  // 批量检索
  const batchRetrieveResult = await core.retrieveBatch([
    { intent: "批量记忆 1", strategy: "precise", constraints: { maxResults: 3 } },
    { intent: "批量记忆 2", strategy: "precise", constraints: { maxResults: 3 } },
    { intent: "批量记忆 3", strategy: "precise", constraints: { maxResults: 3 } },
  ]);

  console.log(`批量检索完成: ${batchRetrieveResult.results.length} 个查询`);
  console.log(`总耗时: ${batchRetrieveResult.durationMs}ms`);
}

/**
 * 示例 3: 作用域管理 (替代 SelectiveMemoryInheritance)
 */
async function example3_scopeManagement(core: UnifiedNSEM2Core) {
  console.log("\n=== 示例 3: 作用域管理 ===");

  // 摄入不同作用域的记忆
  await core.ingest("个人秘密", { scope: "personal", tags: ["private"] });
  await core.ingest("共享知识", { scope: "shared", tags: ["public"] });
  await core.ingest("继承的配置", { scope: "inherited", tags: ["config"] });

  // 检索所有作用域
  const allResult = await core.retrieveByScope(
    { intent: "知识", strategy: "precise", constraints: { maxResults: 10 } },
    ["personal", "shared", "inherited"],
  );
  console.log(`所有作用域检索: ${allResult.atoms.length} 条`);

  // 仅检索个人作用域
  const personalResult = await core.retrieveByScope(
    { intent: "知识", strategy: "precise", constraints: { maxResults: 10 } },
    ["personal"],
  );
  console.log(`个人作用域检索: ${personalResult.atoms.length} 条`);
}

/**
 * 示例 4: P2 - 自动摄入服务
 */
async function example4_autoIngestion(core: UnifiedNSEM2Core) {
  console.log("\n=== 示例 4: 自动摄入服务 (P2) ===");

  const service = createAutoIngestionService(core);
  service.start();

  // 添加自定义规则
  service.addRule({
    id: "custom-rule",
    name: "自定义摄入规则",
    trigger: {
      type: "conversation-end",
      minMessages: 2,
      minDurationMs: 5000,
    },
    extraction: {
      extractFacts: true,
      extractInsights: true,
      summarize: false,
      includeContext: true,
      contextMessageCount: 3,
    },
    ingestion: {
      scope: "personal",
      importance: "auto",
      tags: ["auto-ingested", "custom"],
      deduplicate: true,
      dedupThreshold: 0.85,
    },
    enabled: true,
  });

  // 模拟对话
  const sessionId = "example-session-1";
  service.startSession(sessionId, { agentId: "example", channel: "chat" });

  service.addMessage(sessionId, {
    role: "user",
    content: "你好，我想学习机器学习",
  });

  service.addMessage(sessionId, {
    role: "assistant",
    content: "好的，机器学习是一个广泛的领域，你具体想了解什么？",
  });

  service.addMessage(sessionId, {
    role: "user",
    content: "我对深度学习特别感兴趣，尤其是神经网络",
  });

  // 结束对话，触发自动摄入
  service.endSession(sessionId);

  // 等待摄入完成 (简化处理)
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 查看摄入历史
  const history = service.getIngestionHistory(sessionId);
  console.log(`摄入历史: ${history?.length ?? 0} 条记录`);

  // 查看统计
  const stats = service.getStats();
  console.log("自动摄入统计:", {
    rules: stats.rules,
    sessions: stats.sessions,
    ingestion: stats.ingestion,
  });
}

/**
 * 示例 5: P2 - 重要性评分
 */
async function example5_importanceScoring() {
  console.log("\n=== 示例 5: 重要性评分 (P2) ===");

  const scorer = createImportanceScorer();

  // 评分不同重要性的内容
  const testCases = [
    "这是非常关键重要的信息，请记住",
    "我的名字叫张三，请记住",
    "我喜欢吃巧克力",
    "随便说点什么",
    "这是一个密码: secret123",
    "我发现了一个重要的模式",
  ];

  for (const content of testCases) {
    const score = scorer.calculateImportance(content, "fact");
    console.log(`内容: "${content.slice(0, 20)}..."`);
    console.log(`  总分: ${(score.total * 100).toFixed(1)}%`);
    console.log(
      `  维度: semantic=${(score.dimensions.semantic * 100).toFixed(0)}%, ` +
        `explicit=${(score.dimensions.explicit * 100).toFixed(0)}%`,
    );
    console.log(`  匹配规则: ${score.appliedRules.length}个`);
    console.log(`  解释: ${score.explanation.slice(0, 50)}...`);
  }

  // 查看统计
  const stats = scorer.getStats();
  console.log("评分统计:", {
    rules: stats.rules,
    scoring: stats.scoring,
  });
}

/**
 * 示例 6: P2 - 定期整理
 */
async function example6_periodicMaintenance(core: UnifiedNSEM2Core) {
  console.log("\n=== 示例 6: 定期整理 (P2) ===");

  const service = createPeriodicMaintenanceService(core, {
    autoStart: false, // 手动控制
    maxConcurrentTasks: 2,
    taskTimeoutMs: 30 * 60 * 1000,
  });

  // 查看默认任务
  const tasks = service.getAllTasks();
  console.log(`维护任务数: ${tasks.length}`);
  for (const task of tasks) {
    console.log(`  - ${task.id} (${task.type}): ${task.schedule}, 启用: ${task.enabled}`);
  }

  // 手动运行 decay 任务
  console.log("\n执行 decay 任务...");
  const decayResult = await service.runTask("hourly-decay");
  console.log(`结果: ${decayResult.status}, 耗时: ${decayResult.durationMs}ms`);

  // 手动运行 prune 任务
  console.log("\n执行 prune 任务...");
  const pruneResult = await service.runTask("daily-prune");
  console.log(
    `结果: ${pruneResult.status}, 处理: ${pruneResult.details.processedCount}, 删除: ${pruneResult.details.deletedCount}`,
  );

  // 运行所有任务
  console.log("\n运行所有启用的任务...");
  const allResults = await service.runAllTasks();
  console.log(`共执行 ${allResults.length} 个任务`);

  // 查看统计
  const stats = service.getStats();
  console.log("维护统计:", {
    tasks: stats.tasks,
    execution: stats.execution,
    effects: stats.effects,
  });
}

/**
 * 示例 7: 完整集成 - 智能对话记忆系统
 */
async function example7_fullIntegration() {
  console.log("\n=== 示例 7: 完整集成 - 智能对话记忆系统 ===");

  const cfg = {
    model: { provider: "openai", model: "gpt-4" },
    embedding: { provider: "local", model: "all-MiniLM-L6-v2" },
  } as unknown as NsemclawConfig;

  const memoryConfig = {
    enabled: true,
    provider: "local",
  } as unknown as ResolvedMemorySearchConfig;

  // 创建核心
  const core = await createUnifiedNSEM2Core(cfg, "smart-agent", memoryConfig, {
    modelLoading: {
      strategy: "load-all",
      fallbackStrategy: "on-demand",
      priorityOrder: ["embedding", "reranker", "expansion"],
      minMemoryGb: 4,
    },
    tieredStorage: {
      workingCapacity: 20,
      shortTermCapacity: 500,
      longTermDiskLimit: 10000,
      autoTierTransition: true,
      tierCheckIntervalMs: 60000,
    },
    asyncWrite: {
      enabled: true,
      maxQueueSize: 1000,
      flushIntervalMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
  });

  await core.start();

  // 创建服务
  const autoIngestion = createAutoIngestionService(core);
  const importanceScorer = createImportanceScorer();
  const maintenance = createPeriodicMaintenanceService(core, { autoStart: false });

  autoIngestion.start();

  // 模拟智能对话流程
  console.log("\n模拟对话流程...");

  const sessions = [
    {
      id: "session-1",
      messages: [
        { role: "user" as const, content: "你好，请介绍一下自己" },
        {
          role: "assistant" as const,
          content: "你好！我是一个AI助手，可以帮助你解答问题和处理任务。",
        },
        { role: "user" as const, content: "好的，我叫李明，请记住我的名字" },
        {
          role: "assistant" as const,
          content: "好的李明，我已经记住了你的名字。有什么我可以帮助你的吗？",
        },
      ],
    },
    {
      id: "session-2",
      messages: [
        { role: "user" as const, content: "我想学习Python编程" },
        {
          role: "assistant" as const,
          content: "Python是一个优秀的编程语言，适合初学者。你想从哪方面开始？",
        },
        { role: "user" as const, content: "从基础语法开始吧，我需要掌握变量、函数和类的概念" },
        { role: "assistant" as const, content: "好的，我们先从变量开始..." },
      ],
    },
  ];

  for (const session of sessions) {
    autoIngestion.startSession(session.id, { agentId: "smart-agent" });

    for (const message of session.messages) {
      autoIngestion.addMessage(session.id, message);

      // 实时评分重要性
      if (message.role === "user") {
        const score = importanceScorer.calculateImportance(message.content, "fact");
        if (score.total > 0.6) {
          console.log(
            `  检测到高重要性内容: "${message.content.slice(0, 30)}..." (重要性: ${(score.total * 100).toFixed(0)}%)`,
          );
        }
      }
    }

    autoIngestion.endSession(session.id);
    await new Promise((resolve) => setTimeout(resolve, 50)); // 等待摄入完成
  }

  // 检索记忆
  console.log("\n检索用户相关信息...");
  const userInfoResult = await core.activate({
    intent: "用户信息 名字",
    strategy: "precise",
    constraints: { maxResults: 5 },
  });
  console.log(`找到 ${userInfoResult.atoms.length} 条相关记忆`);
  for (const item of userInfoResult.atoms) {
    console.log(
      `  - ${item.atom.content.slice(0, 50)}... (相关度: ${(item.relevance * 100).toFixed(0)}%)`,
    );
  }

  console.log("\n检索学习相关内容...");
  const learningResult = await core.activate({
    intent: "Python 编程 学习",
    strategy: "exploratory",
    constraints: { maxResults: 5 },
  });
  console.log(`找到 ${learningResult.atoms.length} 条相关记忆`);

  // 执行维护
  console.log("\n执行记忆维护...");
  await maintenance.runTask("hourly-decay");
  console.log("维护完成");

  // 最终统计
  console.log("\n最终统计:");
  const stats = core.getStats();
  console.log(`  记忆总数: ${stats.memory.total}`);
  console.log(`  工作记忆: ${stats.memory.working}`);
  console.log(`  短期记忆: ${stats.memory.shortTerm}`);
  console.log(`  缓存命中率: ${(stats.cache.hitRate * 100).toFixed(1)}%`);

  const autoIngestionStats = autoIngestion.getStats();
  console.log(`  自动摄入: ${autoIngestionStats.ingestion.totalIngested} 条`);

  await core.stop();
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     UnifiedNSEM2Core - 完整功能示例                        ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await example1_basicUsage();
  } catch (err) {
    console.error("示例 1 失败:", err);
  }

  // 注意：示例 2-6 需要传入 core 实例，这里仅作演示
  // await example2_batchOperations(core);
  // await example3_scopeManagement(core);
  // await example4_autoIngestion(core);

  try {
    await example5_importanceScoring();
  } catch (err) {
    console.error("示例 5 失败:", err);
  }

  // await example6_periodicMaintenance(core);

  try {
    await example7_fullIntegration();
  } catch (err) {
    console.error("示例 7 失败:", err);
  }

  console.log("\n✅ 所有示例执行完成");
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}
