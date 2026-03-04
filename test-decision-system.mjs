#!/usr/bin/env node
/**
 * 决策系统 v2.0 测试脚本
 * 
 * 测试新的智能决策系统，包括:
 * 1. 情感分析
 * 2. 工具调用决策
 * 3. 子代理决策
 * 4. 反馈学习
 */

import { 
  getEmotionalIntelligence,
  getSmartDecisionService,
  getDecisionIntegration,
  resetDecisionIntegration,
} from "./dist/cognitive-core/decision/index.js";

console.log("🧠 决策系统 v2.0 测试\n");

// 等待构建完成
await new Promise(r => setTimeout(r, 100));

// ============================================================================
// 测试 1: 情感分析
// ============================================================================
console.log("━━━ 测试 1: 情感分析 ━━━");

const emotional = getEmotionalIntelligence();

const testMessages = [
  "快点帮我处理这个！！！",
  "为什么又出错了？烦死了",
  "你能解释一下这个原理吗？",
  "谢谢！太好了 👍",
  "随便，你看着办吧",
  "这是正常的查询",
];

for (const msg of testMessages) {
  const result = emotional.analyzeMood(msg);
  console.log(`\n💬 "${msg}"`);
  console.log(`   情绪: ${result.mood} (置信度: ${(result.confidence * 100).toFixed(0)}%)`);
  console.log(`   强度: ${(result.intensity * 100).toFixed(0)}%`);
  if (result.keywords.length > 0) {
    console.log(`   关键词: ${result.keywords.join(", ")}`);
  }
}

// ============================================================================
// 测试 2: 用户画像学习
// ============================================================================
console.log("\n\n━━━ 测试 2: 用户画像学习 ━━━");

const userId = "test-user-123";
const profile = emotional.getUserProfile(userId);
console.log(`\n初始用户画像 (${userId}):`);
console.log(`   风险容忍度: ${(profile.riskTolerance * 100).toFixed(0)}%`);
console.log(`   关系亲密度: ${(profile.relationshipScore * 100).toFixed(0)}%`);
console.log(`   偏好速度: ${profile.preferredSpeed}`);

// 模拟反馈学习
console.log("\n模拟反馈学习:");
emotional.learnFromFeedback(userId, "tool_call", "satisfied", { toolName: "read", executionTime: 500 });
emotional.learnFromFeedback(userId, "tool_call", "satisfied", { toolName: "read", executionTime: 600 });
emotional.learnFromFeedback(userId, "tool_call", "overridden", { toolName: "exec", executionTime: 200 });

const updatedProfile = emotional.getUserProfile(userId);
console.log(`   更新后风险容忍度: ${(updatedProfile.riskTolerance * 100).toFixed(0)}%`);
console.log(`   更新后关系亲密度: ${(updatedProfile.relationshipScore * 100).toFixed(0)}%`);

// ============================================================================
// 测试 3: 智能决策服务
// ============================================================================
console.log("\n\n━━━ 测试 3: 智能决策服务 ━━━");

const decisionService = getSmartDecisionService({
  enabled: true,
  engineWeight: 0.3,
  emotionWeight: 0.4,
});

// 测试工具调用决策
console.log("\n1. 工具调用决策:");
const toolDecision = await decisionService.decide({
  type: "tool_allow",
  toolName: "read",
  toolParams: { path: "/home/user/document.txt" },
  dangerLevel: "safe",
  sessionKey: "session-1",
  agentId: "main",
  recentToolCalls: [],
  loopDetected: false,
}, { userId, message: "帮我读一下这个文件" });

console.log(`   决策: ${toolDecision.decision.allow ? "✅ 允许" : "❌ 阻止"}`);
console.log(`   置信度: ${(toolDecision.confidence * 100).toFixed(1)}%`);
console.log(`   理由: ${toolDecision.reasoning}`);

// 测试危险工具
console.log("\n2. 危险工具决策 (exec):");
const dangerousDecision = await decisionService.decide({
  type: "tool_allow",
  toolName: "exec",
  toolParams: { command: "rm -rf /" },
  dangerLevel: "critical",
  sessionKey: "session-1",
  agentId: "main",
  recentToolCalls: [],
  loopDetected: false,
}, { userId, message: "帮我执行这个命令" });

console.log(`   决策: ${dangerousDecision.decision.allow ? "✅ 允许" : "❌ 阻止"}`);
console.log(`   需要确认: ${dangerousDecision.decision.requireConfirm ? "是" : "否"}`);
console.log(`   风险等级: ${dangerousDecision.riskAssessment.level}`);
console.log(`   理由: ${dangerousDecision.reasoning}`);

// 测试紧急消息
console.log("\n3. 紧急消息决策:");
const urgentDecision = await decisionService.decide({
  type: "tool_allow",
  toolName: "write",
  toolParams: { path: "/tmp/test.txt", content: "test" },
  dangerLevel: "dangerous",
  sessionKey: "session-1",
  agentId: "main",
  recentToolCalls: [],
  loopDetected: false,
}, { userId, message: "快点帮我保存这个！！！很重要" });

console.log(`   决策: ${urgentDecision.decision.allow ? "✅ 允许" : "❌ 阻止"}`);
console.log(`   需要确认: ${urgentDecision.decision.requireConfirm ? "是" : "否"}`);
console.log(`   理由: ${urgentDecision.reasoning}`);
if (urgentDecision.metadata.emotionalFactors) {
  console.log(`   情感因素: ${urgentDecision.metadata.emotionalFactors.join(", ")}`);
}

// 测试子代理决策
console.log("\n4. 子代理决策:");
const subagentDecision = await decisionService.decide({
  type: "subagent_spawn",
  taskDescription: "分析整个代码库并重构主要模块",
  taskComplexity: 0.8,
  estimatedTokens: 5000,
  parentSessionKey: "session-1",
  availableModels: ["gpt-4o", "claude-3-5-sonnet"],
  currentLoad: 0.3,
}, { userId });

console.log(`   决策: ${subagentDecision.decision.allow ? "✅ 调用子代理" : "❌ 自己处理"}`);
console.log(`   策略: ${subagentDecision.decision.strategy}`);
console.log(`   理由: ${subagentDecision.reasoning}`);

// ============================================================================
// 测试 4: 决策集成
// ============================================================================
console.log("\n\n━━━ 测试 4: 决策集成层 ━━━");

const integration = getDecisionIntegration({
  enabled: true,
  mode: "smart",
});

console.log("\n工具调用决策 (通过集成层):");
const integratedDecision = await integration.decideToolAllow({
  toolName: "edit",
  toolParams: { path: "/home/user/code.js", content: "..." },
  sessionKey: "session-2",
  agentId: "main",
  recentToolCalls: [],
  loopDetected: false,
  message: "帮我修改一下这个文件",
});

console.log(`   允许: ${integratedDecision.allow}`);
console.log(`   需要确认: ${integratedDecision.requireConfirm}`);
console.log(`   置信度: ${(integratedDecision.confidence * 100).toFixed(1)}%`);
console.log(`   理由: ${integratedDecision.reasoning}`);

// ============================================================================
// 统计
// ============================================================================
console.log("\n\n━━━ 统计信息 ━━━");

const stats = decisionService.getStats();
console.log(`\n决策服务统计:`);
console.log(`   总决策数: ${stats.totalDecisions}`);
console.log(`   缓存命中: ${stats.cacheHits}`);
console.log(`   模型决策: ${stats.modelDecisions}`);
console.log(`   引擎决策: ${stats.engineDecisions}`);
console.log(`   平均推理时间: ${stats.avgInferenceTime.toFixed(1)}ms`);

// ============================================================================
// 总结
// ============================================================================
console.log("\n\n✅ 测试完成!");
console.log("\n决策系统 v2.0 特性:");
console.log("   ✓ 情感感知 - 能识别用户情绪并调整决策");
console.log("   ✓ 用户画像 - 学习用户偏好和习惯");
console.log("   ✓ 智能决策 - 轻量级LLM模型驱动");
console.log("   ✓ 动态阈值 - 不再是死板硬编码");
console.log("   ✓ 可解释性 - 每个决策都有理由");

// 清理
resetDecisionIntegration();
