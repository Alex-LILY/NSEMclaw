#!/usr/bin/env node
/**
 * 决策系统使用示例
 * 
 * 演示如何使用修复后的决策系统
 */

import {
  createDecisionIntegration,
  decideSubagentUsage,
  estimateTaskComplexity,
} from "../src/cognitive-core/integration/index.js";

// ============================================================================
// 示例 1: 基础决策引擎使用
// ============================================================================

function demoBasicDecisionEngine() {
  console.log("\n🎯 示例 1: 基础决策引擎\n");

  const integration = createDecisionIntegration({
    enabled: true,
    defaultStrategy: "ucb",
    explorationRate: 0.1,
  });

  // 决策：记忆检索策略
  const query = "用户之前提到的偏好设置";
  const urgency = 0.8; // 高紧急度

  const decision = integration.decideMemoryStrategy(query, urgency);
  console.log(`查询: "${query}"`);
  console.log(`紧急度: ${urgency}`);
  console.log(`决策策略: ${decision.strategy}`);
  console.log(`决策ID: ${decision.decisionId}`);

  // 模拟执行结果反馈
  setTimeout(() => {
    const success = true;
    const reward = 0.8; // 检索成功且快速
    integration.submitFeedback(decision.decisionId, success, reward);
    console.log(`反馈已提交: reward=${reward}`);
  }, 100);

  // 查看统计
  setTimeout(() => {
    console.log("\n决策统计:", integration.getStats());
    integration.destroy();
  }, 200);
}

// ============================================================================
// 示例 2: 子代理决策
// ============================================================================

function demoSubagentDecision() {
  console.log("\n🤖 示例 2: 子代理决策\n");

  const tasks = [
    "帮我把这个文件从 A 目录移动到 B 目录",
    "分析整个代码库的架构问题并提供重构方案",
    "写一个简单的 Hello World 程序",
    "研究最新的 AI 模型论文并总结关键技术点",
  ];

  for (const task of tasks) {
    console.log(`\n任务: "${task}"`);
    
    // 评估复杂度
    const complexity = estimateTaskComplexity(task);
    console.log(`  评估复杂度: ${(complexity * 100).toFixed(0)}%`);

    // 决策
    const decision = decideSubagentUsage({
      taskDescription: task,
      parentSessionKey: "demo-session",
      availableModels: ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet"],
      currentLoad: 0.6,
    });

    console.log(`  建议: ${decision.shouldSpawn ? "调用子代理" : "直接处理"}`);
    console.log(`  策略: ${decision.strategy}`);
    console.log(`  推荐模型: ${decision.recommendedModel ?? "default"}`);
    console.log(`  预计耗时: ${(decision.estimatedTime / 1000).toFixed(1)}秒`);
    console.log(`  理由: ${decision.reasoning}`);
  }
}

// ============================================================================
// 示例 3: 工具调用决策（模拟）
// ============================================================================

function demoToolDecision() {
  console.log("\n🔧 示例 3: 工具调用决策\n");

  const integration = createDecisionIntegration();

  // 模拟不同场景的工具调用决策
  const scenarios = [
    {
      toolName: "read",
      context: { recentFailures: 0, loopDetected: false },
      description: "读取文件",
    },
    {
      toolName: "exec",
      context: { recentFailures: 2, loopDetected: false },
      description: "执行命令（有失败历史）",
    },
    {
      toolName: "write",
      context: { recentFailures: 0, loopDetected: true },
      description: "写入文件（检测到循环）",
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n场景: ${scenario.description}`);
    console.log(`工具: ${scenario.toolName}`);

    const decision = integration.decideToolAllow({
      toolName: scenario.toolName,
      toolParams: {},
      sessionKey: "demo",
      agentId: "demo-agent",
      recentToolCalls: [],
      loopDetected: scenario.context.loopDetected,
    });

    console.log(`  决策: ${decision.allow ? "允许" : decision.requireConfirm ? "需确认" : "阻止"}`);
    console.log(`  决策ID: ${decision.decisionId}`);

    // 如果是允许，继续决策执行策略
    if (decision.allow) {
      const strategyDecision = integration.decideToolStrategy({
        toolName: scenario.toolName,
        toolParams: {},
        sessionKey: "demo",
        agentId: "demo-agent",
        recentToolCalls: [],
        loopDetected: false,
      });
      console.log(`  执行策略: ${strategyDecision.strategy}`);
    }
  }

  integration.destroy();
}

// ============================================================================
// 示例 4: 批量子代理任务决策
// ============================================================================

function demoBatchSubagentDecision() {
  console.log("\n📦 示例 4: 批量子代理任务决策\n");

  import("../src/cognitive-core/integration/SubagentDecisionIntegration.js").then(
    ({ decideBatchSubagentUsage }) => {
      const tasks = [
        { id: "task-1", description: "分析需求文档", priority: 8 },
        { id: "task-2", description: "编写测试用例", priority: 6 },
        { id: "task-3", description: "重构数据库模块", priority: 9 },
        { id: "task-4", description: "更新 README", priority: 3 },
        { id: "task-5", description: "优化性能瓶颈", priority: 7 },
      ];

      const batchDecision = decideBatchSubagentUsage({
        tasks,
        parentSessionKey: "demo-batch",
        availableModels: ["gpt-4o", "claude-3-5-sonnet"],
        currentLoad: 0.5,
      });

      console.log("批量决策结果:");
      console.log(`  推荐并行数: ${batchDecision.recommendedParallel}`);
      console.log(`  预计总耗时: ${(batchDecision.totalEstimatedTime / 1000).toFixed(1)}秒`);
      console.log("\n  任务分配:");
      
      for (const task of batchDecision.tasks) {
        const origTask = tasks.find(t => t.id === task.id);
        console.log(`    ${origTask.description}: ${task.shouldSpawn ? "子代理" : "直接处理"} (${task.strategy})`);
      }
    }
  );
}

// ============================================================================
// 运行所有示例
// ============================================================================

console.log("=".repeat(60));
console.log("🧠 NSEM 决策系统修复演示");
console.log("=".repeat(60));

demoBasicDecisionEngine();
setTimeout(demoSubagentDecision, 300);
setTimeout(demoToolDecision, 600);
setTimeout(demoBatchSubagentDecision, 900);

setTimeout(() => {
  console.log("\n" + "=".repeat(60));
  console.log("✅ 演示完成");
  console.log("=".repeat(60));
  process.exit(0);
}, 1500);
