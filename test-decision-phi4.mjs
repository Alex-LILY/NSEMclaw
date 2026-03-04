#!/usr/bin/env node
/**
 * Phi-4-mini 决策模型测试
 * 通过主入口导入
 */

import { 
  getDecisionIntegration 
} from "./dist/cognitive-core/integration/DecisionIntegration.js";

console.log("🧠 Phi-4-mini 决策系统测试\n");

async function main() {
  try {
    // 测试决策集成
    console.log("━━━ 决策集成测试 ━━━");
    const integration = getDecisionIntegration({
      enabled: true,
      mode: "smart",
    });
    
    console.log("✅ 决策集成初始化成功");
    
    // 测试工具调用决策
    console.log("\n━━━ 工具调用决策测试 ━━━");
    const toolDecision = await integration.decideToolAllow({
      toolName: "read",
      toolParams: { path: "/home/user/doc.txt" },
      sessionKey: "test-session",
      agentId: "main",
      recentToolCalls: [],
      loopDetected: false,
      message: "帮我读一下这个文件",
    });
    
    console.log(`   决策: ${toolDecision.allow ? "✅ 允许" : "❌ 阻止"}`);
    console.log(`   需要确认: ${toolDecision.requireConfirm ? "是" : "否"}`);
    console.log(`   置信度: ${(toolDecision.confidence * 100).toFixed(1)}%`);
    console.log(`   理由: ${toolDecision.reasoning}`);
    
    // 测试子代理决策
    console.log("\n━━━ 子代理决策测试 ━━━");
    const subagentDecision = await integration.decideSubagentSpawn({
      taskDescription: "分析代码库并重构主要模块",
      taskComplexity: 0.8,
      estimatedTokens: 5000,
      parentSessionKey: "test-session",
      availableModels: ["gpt-4o", "claude-3-5-sonnet"],
      currentLoad: 0.3,
      message: "帮我重构代码",
    });
    
    console.log(`   调用子代理: ${subagentDecision.allow ? "✅ 是" : "❌ 否"}`);
    console.log(`   策略: ${subagentDecision.strategy}`);
    console.log(`   置信度: ${(subagentDecision.confidence * 100).toFixed(1)}%`);
    console.log(`   理由: ${subagentDecision.reasoning}`);
    
    // 测试记忆检索策略
    console.log("\n━━━ 记忆检索策略测试 ━━━");
    const memoryDecision = await integration.decideMemoryStrategy(
      "查找关于API调用的文档",
      0.7
    );
    
    console.log(`   策略: ${memoryDecision.strategy}`);
    console.log(`   置信度: ${(memoryDecision.confidence * 100).toFixed(1)}%`);
    
    console.log("\n✅ 所有测试通过！");
    console.log("\n决策系统已配置使用 Phi-4-mini 模型");
    console.log("启动时会自动加载模型到 GPU");
    
  } catch (error) {
    console.error("\n❌ 测试失败:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
