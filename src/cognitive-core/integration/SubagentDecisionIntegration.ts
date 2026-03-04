/**
 * 子代理决策集成 - 智能决策何时使用子代理
 *
 * 与 Nsemclaw 子代理系统集成:
 * - 复用 subagent-registry 管理子代理生命周期
 * - 复用 sessions-spawn-tool 进行子代理调用
 * - 增强智能任务分配决策
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { 
  DecisionIntegration, 
  SubagentDecisionContext,
  DecisionFeedback 
} from "./DecisionIntegration.js";
import { getDecisionIntegration } from "./DecisionIntegration.js";

const log = createSubsystemLogger("subagent-decision");

// ============================================================================
// 配置
// ============================================================================

const ENABLE_SUBAGENT_DECISION = process.env.NSEM_ENABLE_SUBAGENT_DECISION !== "false";

/** 任务复杂度评估参数 */
const COMPLEXITY_INDICATORS = {
  // 关键词权重
  keywords: {
    "分析": 0.3,
    "研究": 0.4,
    "重构": 0.5,
    "架构": 0.4,
    "设计": 0.3,
    "优化": 0.3,
    "复杂": 0.4,
    "大量": 0.3,
    "多文件": 0.4,
    "跨模块": 0.5,
    "并发": 0.4,
    "异步": 0.3,
    "性能": 0.3,
    "安全": 0.4,
    "测试": 0.2,
    "文档": 0.2,
    "简单": -0.3,
    "快速": -0.2,
    "小": -0.2,
  },
  // 长度因子
  lengthFactor: {
    short: 100,    // < 100 字符
    medium: 500,   // < 500 字符
    long: 1000,    // < 1000 字符
    veryLong: 2000,// >= 2000 字符
  },
};

// ============================================================================
// 任务复杂度评估
// ============================================================================

/**
 * 评估任务复杂度 (0-1)
 */
export function estimateTaskComplexity(taskDescription: string): number {
  let complexity = 0.3; // 基础复杂度

  // 1. 关键词分析
  const desc = taskDescription.toLowerCase();
  for (const [keyword, weight] of Object.entries(COMPLEXITY_INDICATORS.keywords)) {
    if (desc.includes(keyword.toLowerCase())) {
      complexity += weight;
    }
  }

  // 2. 长度因子
  const length = taskDescription.length;
  if (length > COMPLEXITY_INDICATORS.lengthFactor.veryLong) {
    complexity += 0.2;
  } else if (length > COMPLEXITY_INDICATORS.lengthFactor.long) {
    complexity += 0.1;
  } else if (length < COMPLEXITY_INDICATORS.lengthFactor.short) {
    complexity -= 0.1;
  }

  // 3. 特殊模式
  const patterns = [
    { regex: /\d+\s*(个|条|份|页)/, weight: 0.1 }, // 数量指示
    { regex: /(步骤|阶段|部分):?\s*\d+/, weight: 0.15 }, // 多步骤
    { regex: /(比较|对比|vs)/i, weight: 0.1 }, // 对比分析
    { regex: /(实现|开发|创建|构建)/, weight: 0.1 }, // 实现任务
  ];

  for (const { regex, weight } of patterns) {
    if (regex.test(desc)) {
      complexity += weight;
    }
  }

  // 限制在 0-1 范围
  return Math.max(0, Math.min(1, complexity));
}

/**
 * 估算 Token 数
 */
export function estimateTokens(text: string): number {
  // 简化估算：中文字符约1.5 tokens，英文单词约1 token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const otherChars = text.length - chineseChars - englishWords;
  
  return Math.ceil(chineseChars * 1.5 + englishWords * 1 + otherChars * 0.5);
}

// ============================================================================
// 子代理决策
// ============================================================================

export interface SubagentDecision {
  shouldSpawn: boolean;
  strategy: "fast" | "quality" | "none";
  recommendedModel?: string;
  estimatedTime: number; // 毫秒
  confidence: number;
  decisionId: string;
  reasoning: string;
}

/**
 * 决策：是否应该使用子代理
 */
export async function decideSubagentUsage(args: {
  taskDescription: string;
  parentSessionKey: string;
  availableModels: string[];
  currentLoad: number;
  parentContextLength?: number;
}): Promise<SubagentDecision> {
  if (!ENABLE_SUBAGENT_DECISION) {
    return {
      shouldSpawn: false,
      strategy: "none",
      estimatedTime: 0,
      confidence: 1,
      decisionId: "",
      reasoning: "子代理决策已禁用",
    };
  }

  try {
    const integration = getDecisionIntegration();
    
    // 1. 评估任务
    const complexity = estimateTaskComplexity(args.taskDescription);
    const estimatedTokens = estimateTokens(args.taskDescription);
    
    // 2. 快速启发式：简单任务直接处理
    if (complexity < 0.4 && args.currentLoad < 0.5) {
      return {
        shouldSpawn: false,
        strategy: "none",
        estimatedTime: estimateLocalExecutionTime(complexity, estimatedTokens),
        confidence: 0.8,
        decisionId: recordDecision("heuristic_skip", args.taskDescription),
        reasoning: `任务复杂度较低 (${(complexity * 100).toFixed(0)}%)，当前负载 ${(args.currentLoad * 100).toFixed(0)}%，建议直接处理`,
      };
    }

    // 3. 决策引擎决策
    const context: SubagentDecisionContext = {
      taskDescription: args.taskDescription,
      taskComplexity: complexity,
      parentSessionKey: args.parentSessionKey,
      availableModels: args.availableModels,
      currentLoad: args.currentLoad,
      estimatedTokens,
    };

    const decision = await integration.decideSubagentSpawn(context);
    
    // 确保 strategy 有有效值
    const strategy: "none" | "fast" | "quality" = 
      (decision.strategy as "none" | "fast" | "quality") || "none";
    
    // 4. 选择推荐模型
    const recommendedModel = selectModel(args.availableModels, strategy);
    
    // 5. 估算时间
    const estimatedTime = estimateExecutionTime(
      complexity, 
      estimatedTokens, 
      strategy,
      args.currentLoad
    );

    const reasoning = buildReasoning(complexity, args.currentLoad, strategy);

    return {
      shouldSpawn: decision.allow,
      strategy,
      recommendedModel,
      estimatedTime,
      confidence: decision.confidence,
      decisionId: decision.decisionId,
      reasoning,
    };
  } catch (err) {
    log.error("子代理决策失败", { error: err instanceof Error ? err.message : String(err) });
    // 失败时保守处理：不使用子代理
    return {
      shouldSpawn: false,
      strategy: "none",
      estimatedTime: 0,
      confidence: 0,
      decisionId: "",
      reasoning: "决策失败，保守处理",
    };
  }
}

/**
 * 提交子代理任务反馈
 */
export function submitSubagentTaskFeedback(args: {
  decisionId: string;
  taskCompleted: boolean;
  qualityScore: number;
  executionTime: number;
  outputQuality?: number;
}): void {
  if (!ENABLE_SUBAGENT_DECISION || !args.decisionId) {
    return;
  }

  try {
    const integration = getDecisionIntegration();
    
    integration.submitSubagentFeedback(
      args.decisionId,
      args.taskCompleted,
      args.qualityScore,
      args.executionTime,
    );

    log.debug(`子代理反馈已提交: ${args.decisionId} quality=${args.qualityScore.toFixed(2)}`);
  } catch (err) {
    log.debug(`提交子代理反馈失败: ${args.decisionId}`);
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function selectModel(availableModels: string[], strategy: "fast" | "quality" | "none"): string | undefined {
  if (strategy === "none" || availableModels.length === 0) {
    return undefined;
  }

  // 快速策略：选择轻量级模型
  if (strategy === "fast") {
    const fastModels = availableModels.filter(m => 
      /gpt-4o-mini|claude-3-haiku|gemini-flash/i.test(m)
    );
    return fastModels[0] || availableModels[0];
  }

  // 质量策略：选择强模型
  if (strategy === "quality") {
    const qualityModels = availableModels.filter(m =>
      /gpt-4|claude-3-opus|claude-3-5-sonnet|gemini-pro/i.test(m)
    );
    return qualityModels[0] || availableModels[availableModels.length - 1];
  }

  return availableModels[0];
}

function estimateLocalExecutionTime(complexity: number, tokens: number): number {
  // 本地执行时间估算（毫秒）
  const baseTime = 2000;
  const complexityTime = complexity * 5000;
  const tokenTime = tokens * 0.5;
  return baseTime + complexityTime + tokenTime;
}

function estimateExecutionTime(
  complexity: number, 
  tokens: number, 
  strategy: "fast" | "quality" | "none",
  currentLoad: number
): number {
  if (strategy === "none") {
    return estimateLocalExecutionTime(complexity, tokens);
  }

  // 子代理开销
  const spawnOverhead = 3000; // 3秒启动开销
  const loadFactor = 1 + currentLoad * 0.5; // 负载影响
  
  let strategyMultiplier = 1;
  if (strategy === "fast") strategyMultiplier = 0.7;
  if (strategy === "quality") strategyMultiplier = 1.5;

  const localTime = estimateLocalExecutionTime(complexity, tokens);
  return (localTime * strategyMultiplier + spawnOverhead) * loadFactor;
}

function buildReasoning(complexity: number, load: number, strategy: "fast" | "quality" | "none"): string {
  const parts: string[] = [];
  
  parts.push(`任务复杂度 ${(complexity * 100).toFixed(0)}%`);
  parts.push(`当前负载 ${(load * 100).toFixed(0)}%`);
  
  if (strategy === "fast") {
    parts.push("选择快速子代理策略（并行处理）");
  } else if (strategy === "quality") {
    parts.push("选择质量优先策略（深度处理）");
  } else {
    parts.push("直接处理");
  }

  return parts.join("，");
}

function recordDecision(type: string, taskDescription: string): string {
  // 简化实现，实际应该调用决策引擎
  return `heuristic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// 批量决策
// ============================================================================

export interface BatchTask {
  id: string;
  description: string;
  priority: number;
  dependencies?: string[];
}

export interface BatchDecision {
  tasks: Array<{
    id: string;
    shouldSpawn: boolean;
    strategy: "fast" | "quality" | "none";
    estimatedTime: number;
  }>;
  recommendedParallel: number;
  totalEstimatedTime: number;
}

/**
 * 批量决策多个任务
 */
export async function decideBatchSubagentUsage(args: {
  tasks: BatchTask[];
  parentSessionKey: string;
  availableModels: string[];
  currentLoad: number;
}): Promise<BatchDecision> {
  const results = await Promise.all(args.tasks.map(async task => {
    const decision = await decideSubagentUsage({
      taskDescription: task.description,
      parentSessionKey: args.parentSessionKey,
      availableModels: args.availableModels,
      currentLoad: args.currentLoad,
    });
    return {
      id: task.id,
      ...decision,
    };
  }));

  // 计算推荐的并行数
  const spawnCount = results.filter(r => r.shouldSpawn).length;
  const recommendedParallel = Math.min(
    spawnCount,
    Math.max(1, Math.floor((1 - args.currentLoad) * 5))
  );

  // 估算总时间（假设可以并行）
  const maxParallelTime = Math.max(
    ...results
      .filter(r => r.shouldSpawn)
      .map(r => r.estimatedTime),
    0
  );
  const sequentialTime = results
    .filter(r => !r.shouldSpawn)
    .reduce((sum, r) => sum + r.estimatedTime, 0);
  
  const totalEstimatedTime = maxParallelTime + sequentialTime;

  return {
    tasks: results.map(r => ({
      id: r.id,
      shouldSpawn: r.shouldSpawn,
      strategy: r.strategy,
      estimatedTime: r.estimatedTime,
    })),
    recommendedParallel,
    totalEstimatedTime,
  };
}

// ============================================================================
// 导出
// ============================================================================

export { ENABLE_SUBAGENT_DECISION };
