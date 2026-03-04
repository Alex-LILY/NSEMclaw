/**
 * 决策系统集成层 - 让 DecisionStrategyEngine 真正工作
 *
 * 集成点:
 * 1. 工具调用策略决策 - 决定是否允许工具、使用什么参数策略
 * 2. 子代理调用决策 - 决定何时使用子代理、选择什么策略
 * 3. 回复策略决策 - 决定使用什么回复模式
 * 4. 记忆检索策略 - 决定使用哪种检索策略
 *
 * 反馈机制:
 * - 工具成功/失败反馈
 * - 子代理任务质量反馈
 * - 用户满意度反馈
 */

import type { DecisionStrategyEngine, Action, DecisionContext, DecisionResult } from "../decision/index.js";
import { createDecisionEngine, createUCBEngine } from "../decision/index.js";
import { createMetaCognitionMonitor } from "../meta-cognition/MetaCognitionMonitor.js";
import type { MetaCognitionMonitor, PerformanceMetrics } from "../meta-cognition/MetaCognitionMonitor.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { generateId, clamp } from "../utils/common.js";

const log = createSubsystemLogger("decision-integration");

// ============================================================================
// 类型定义
// ============================================================================

/** 决策类型 */
export type DecisionType =
  | "tool_allow"      // 是否允许工具调用
  | "tool_strategy"   // 工具执行策略
  | "subagent_spawn"  // 是否调用子代理
  | "subagent_model"  // 选择子代理模型
  | "reply_mode"      // 回复模式
  | "memory_strategy"; // 记忆检索策略

/** 工具调用决策上下文 */
export interface ToolDecisionContext {
  toolName: string;
  toolParams: unknown;
  sessionKey: string;
  agentId: string;
  recentToolCalls: Array<{ toolName: string; success: boolean; duration: number }>;
  loopDetected: boolean;
  userIntent?: string;
}

/** 子代理决策上下文 */
export interface SubagentDecisionContext {
  taskDescription: string;
  taskComplexity: number; // 0-1
  parentSessionKey: string;
  availableModels: string[];
  currentLoad: number; // 0-1
  estimatedTokens: number;
}

/** 回复策略决策上下文 */
export interface ReplyDecisionContext {
  messageType: "text" | "command" | "media" | "voice";
  channel: string;
  userPriority: number; // 1-10
  responseUrgency: number; // 0-1
  contextLength: number;
  hasMedia: boolean;
}

/** 决策反馈 */
export interface DecisionFeedback {
  decisionId: string;
  success: boolean;
  reward: number; // -1 to 1
  metadata?: Record<string, unknown>;
}

/** 决策集成配置 */
export interface DecisionIntegrationConfig {
  enabled: boolean;
  defaultStrategy: "ucb" | "epsilon-greedy" | "thompson-sampling" | "softmax";
  enableMetaCognition: boolean;
  feedbackWindowSize: number;
  explorationRate: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: DecisionIntegrationConfig = {
  enabled: false, // 默认禁用，避免干扰正常工具调用
  defaultStrategy: "ucb",
  enableMetaCognition: false,
  feedbackWindowSize: 100,
  explorationRate: 0.05, // 降低探索率
};

// ============================================================================
// 决策动作定义
// ============================================================================

/** 工具允许动作 */
const TOOL_ALLOW_ACTIONS: Action[] = [
  { id: "allow", description: "允许工具调用", type: "exploitation" },
  { id: "block", description: "阻止工具调用", type: "exploration" },
  { id: "confirm", description: "需要确认", type: "exploration" },
];

/** 工具策略动作 */
const TOOL_STRATEGY_ACTIONS: Action[] = [
  { id: "direct", description: "直接执行", type: "exploitation" },
  { id: "sandbox", description: "沙箱执行", type: "exploration" },
  { id: "dry_run", description: " dry run 模式", type: "exploration" },
];

/** 子代理策略动作 */
const SUBAGENT_STRATEGY_ACTIONS: Action[] = [
  { id: "no_spawn", description: "不调用子代理，自己处理", type: "exploitation" },
  { id: "spawn_fast", description: "调用快速子代理", type: "exploration" },
  { id: "spawn_quality", description: "调用质量优先子代理", type: "exploration" },
];

/** 回复模式动作 */
const REPLY_MODE_ACTIONS: Action[] = [
  { id: "immediate", description: "立即回复", type: "exploitation" },
  { id: "stream", description: "流式回复", type: "exploitation" },
  { id: "delayed", description: "延迟回复（思考后）", type: "exploration" },
  { id: "confirm", description: "先确认再回复", type: "exploration" },
];

/** 记忆检索策略动作 */
const MEMORY_STRATEGY_ACTIONS: Action[] = [
  { id: "fast", description: "快速检索（工作记忆）", type: "exploitation" },
  { id: "balanced", description: "平衡检索（三层存储）", type: "exploitation" },
  { id: "deep", description: "深度检索（长期记忆）", type: "exploration" },
];

// ============================================================================
// 决策集成类
// ============================================================================

export class DecisionIntegration {
  private config: DecisionIntegrationConfig;
  private engine: DecisionStrategyEngine;
  private monitor?: MetaCognitionMonitor;
  
  // 决策记录
  private pendingDecisions = new Map<string, {
    type: DecisionType;
    context: unknown;
    timestamp: number;
  }>();
  
  // 反馈历史
  private feedbackHistory: DecisionFeedback[] = [];
  
  // 统计
  private stats = {
    totalDecisions: 0,
    toolDecisions: 0,
    subagentDecisions: 0,
    replyDecisions: 0,
    avgReward: 0,
  };

  constructor(config: Partial<DecisionIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 创建决策引擎
    this.engine = this.createEngine();
    
    // 创建元认知监控
    if (this.config.enableMetaCognition) {
      this.monitor = createMetaCognitionMonitor();
      this.monitor.start();
    }
    
    log.info("🎯 决策系统集成已初始化");
    log.info(`   策略: ${this.config.defaultStrategy}`);
    log.info(`   元认知: ${this.config.enableMetaCognition ? "启用" : "禁用"}`);
  }

  private createEngine(): DecisionStrategyEngine {
    switch (this.config.defaultStrategy) {
      case "ucb":
        return createUCBEngine(Math.sqrt(2));
      case "epsilon-greedy":
        return createDecisionEngine({
          defaultStrategy: "epsilon-greedy",
          strategyParams: { type: "epsilon-greedy", epsilon: this.config.explorationRate },
        });
      case "thompson-sampling":
        return createDecisionEngine({
          defaultStrategy: "thompson-sampling",
          strategyParams: { type: "thompson-sampling" },
        });
      case "softmax":
        return createDecisionEngine({
          defaultStrategy: "softmax",
          strategyParams: { type: "softmax", temperature: 1.0 },
        });
      default:
        return createUCBEngine(Math.sqrt(2));
    }
  }

  // ========================================================================
  // 工具调用决策
  // ========================================================================

  /**
   * 决策：是否允许工具调用
   * @returns 决策结果和决策ID（用于后续反馈）
   */
  decideToolAllow(context: ToolDecisionContext): { allow: boolean; requireConfirm: boolean; decisionId: string } {
    if (!this.config.enabled) {
      return { allow: true, requireConfirm: false, decisionId: "" };
    }

    const decisionContext = this.buildToolDecisionContext(context);
    
    // 如果检测到循环，强制阻止或确认
    if (context.loopDetected) {
      return { 
        allow: false, 
        requireConfirm: true, 
        decisionId: this.recordDecision("tool_allow", context),
      };
    }

    const result = this.engine.decide(TOOL_ALLOW_ACTIONS, decisionContext);
    const decisionId = this.recordDecision("tool_allow", context);
    
    this.stats.toolDecisions++;
    this.trackDecision(result, "tool_allow");

    return {
      allow: result.action.id === "allow",
      requireConfirm: result.action.id === "confirm",
      decisionId,
    };
  }

  /**
   * 决策：工具执行策略
   */
  decideToolStrategy(context: ToolDecisionContext): { strategy: "direct" | "sandbox" | "dry_run"; decisionId: string } {
    if (!this.config.enabled) {
      return { strategy: "direct", decisionId: "" };
    }

    const decisionContext = this.buildToolDecisionContext(context);
    const result = this.engine.decide(TOOL_STRATEGY_ACTIONS, decisionContext);
    const decisionId = this.recordDecision("tool_strategy", context);
    
    this.trackDecision(result, "tool_strategy");

    return {
      strategy: result.action.id as "direct" | "sandbox" | "dry_run",
      decisionId,
    };
  }

  // ========================================================================
  // 子代理决策
  // ========================================================================

  /**
   * 决策：是否调用子代理
   */
  decideSubagentSpawn(context: SubagentDecisionContext): { 
    shouldSpawn: boolean; 
    strategy: "fast" | "quality" | "none";
    decisionId: string;
  } {
    if (!this.config.enabled) {
      return { shouldSpawn: false, strategy: "none", decisionId: "" };
    }

    // 简单启发式：复杂度高或负载高时考虑子代理
    const shouldConsiderSpawn = context.taskComplexity > 0.6 || context.currentLoad > 0.7;
    
    if (!shouldConsiderSpawn) {
      return { 
        shouldSpawn: false, 
        strategy: "none", 
        decisionId: this.recordDecision("subagent_spawn", context),
      };
    }

    const decisionContext = this.buildSubagentDecisionContext(context);
    const result = this.engine.decide(SUBAGENT_STRATEGY_ACTIONS, decisionContext);
    const decisionId = this.recordDecision("subagent_spawn", context);
    
    this.stats.subagentDecisions++;
    this.trackDecision(result, "subagent_spawn");

    const strategy = result.action.id === "spawn_fast" ? "fast" :
                     result.action.id === "spawn_quality" ? "quality" : "none";

    return {
      shouldSpawn: result.action.id !== "no_spawn",
      strategy,
      decisionId,
    };
  }

  // ========================================================================
  // 回复策略决策
  // ========================================================================

  /**
   * 决策：回复模式
   */
  decideReplyMode(context: ReplyDecisionContext): { 
    mode: "immediate" | "stream" | "delayed" | "confirm";
    decisionId: string;
  } {
    if (!this.config.enabled) {
      return { mode: "immediate", decisionId: "" };
    }

    // 简单启发式
    if (context.responseUrgency > 0.8) {
      return { mode: "immediate", decisionId: this.recordDecision("reply_mode", context) };
    }

    const decisionContext = this.buildReplyDecisionContext(context);
    const result = this.engine.decide(REPLY_MODE_ACTIONS, decisionContext);
    const decisionId = this.recordDecision("reply_mode", context);
    
    this.stats.replyDecisions++;
    this.trackDecision(result, "reply_mode");

    return {
      mode: result.action.id as "immediate" | "stream" | "delayed" | "confirm",
      decisionId,
    };
  }

  // ========================================================================
  // 记忆检索策略决策
  // ========================================================================

  /**
   * 决策：记忆检索策略
   */
  decideMemoryStrategy(query: string, urgency: number): { 
    strategy: "fast" | "balanced" | "deep";
    decisionId: string;
  } {
    if (!this.config.enabled) {
      return { strategy: "balanced", decisionId: "" };
    }

    const decisionContext: DecisionContext = {
      id: `mem-${generateId("", Date.now().toString())}`,
      stateDescription: `Query: ${query.slice(0, 50)}, Urgency: ${urgency}`,
      temporalContext: { recencyBias: urgency },
    };

    const result = this.engine.decide(MEMORY_STRATEGY_ACTIONS, decisionContext);
    const decisionId = this.recordDecision("memory_strategy", { query, urgency });
    
    this.trackDecision(result, "memory_strategy");

    return {
      strategy: result.action.id as "fast" | "balanced" | "deep",
      decisionId,
    };
  }

  // ========================================================================
  // 反馈处理
  // ========================================================================

  /**
   * 提交决策反馈
   * @param decisionId 决策ID
   * @param success 是否成功
   * @param reward 奖励值 (-1 到 1)
   * @param metadata 元数据
   */
  submitFeedback(
    decisionId: string, 
    success: boolean, 
    reward: number,
    metadata?: Record<string, unknown>
  ): void {
    const normalizedReward = clamp(reward, -1, 1);
    
    // 更新决策引擎
    try {
      this.engine.updateFeedback(decisionId, normalizedReward);
    } catch (err) {
      log.debug(`更新决策反馈失败: ${decisionId}`);
    }

    // 记录反馈
    const feedback: DecisionFeedback = {
      decisionId,
      success,
      reward: normalizedReward,
      metadata,
    };
    
    this.feedbackHistory.push(feedback);
    if (this.feedbackHistory.length > this.config.feedbackWindowSize) {
      this.feedbackHistory.shift();
    }

    // 更新统计
    this.updateStats(normalizedReward);

    // 元认知监控
    if (this.monitor) {
      this.monitor.endOperation(decisionId, success, (normalizedReward + 1) / 2);
    }

    log.debug(`反馈已记录: ${decisionId} success=${success} reward=${normalizedReward.toFixed(2)}`);
  }

  /**
   * 工具调用结果反馈
   */
  submitToolFeedback(
    decisionId: string, 
    toolName: string, 
    success: boolean, 
    duration: number,
    error?: string
  ): void {
    // 计算奖励：成功+速度奖励，失败-惩罚
    let reward = success ? 0.5 : -0.5;
    if (success) {
      // 快速执行有额外奖励
      if (duration < 1000) reward += 0.3;
      else if (duration < 5000) reward += 0.1;
    } else {
      // 错误类型影响惩罚
      if (error?.includes("timeout")) reward -= 0.2;
      if (error?.includes("permission")) reward -= 0.3;
    }

    this.submitFeedback(decisionId, success, reward, { toolName, duration, error });
  }

  /**
   * 子代理任务反馈
   */
  submitSubagentFeedback(
    decisionId: string,
    taskCompleted: boolean,
    qualityScore: number, // 0-1
    executionTime: number,
  ): void {
    // 综合质量+速度计算奖励
    const timeScore = Math.max(0, 1 - executionTime / 60000); // 60秒内完成得高分
    const reward = taskCompleted ? (qualityScore * 0.7 + timeScore * 0.3) : -0.5;

    this.submitFeedback(decisionId, taskCompleted, reward, { 
      qualityScore, 
      executionTime,
    });
  }

  /**
   * 用户满意度反馈（用于回复策略优化）
   */
  submitUserFeedback(decisionId: string, satisfied: boolean, reaction?: string): void {
    const reward = satisfied ? 0.8 : -0.5;
    this.submitFeedback(decisionId, satisfied, reward, { reaction });
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  private buildToolDecisionContext(ctx: ToolDecisionContext): DecisionContext {
    const recentSuccessRate = ctx.recentToolCalls.length > 0
      ? ctx.recentToolCalls.filter(c => c.success).length / ctx.recentToolCalls.length
      : 0.5;

    return {
      id: `tool-${ctx.sessionKey}-${Date.now()}`,
      stateDescription: `Tool: ${ctx.toolName}, Recent success: ${(recentSuccessRate * 100).toFixed(0)}%, Loop: ${ctx.loopDetected}`,
      agentContext: {
        toolName: ctx.toolName,
        recentCalls: ctx.recentToolCalls.length,
        successRate: recentSuccessRate,
        loopDetected: ctx.loopDetected,
      },
    };
  }

  private buildSubagentDecisionContext(ctx: SubagentDecisionContext): DecisionContext {
    return {
      id: `sub-${ctx.parentSessionKey}-${Date.now()}`,
      stateDescription: `Complexity: ${(ctx.taskComplexity * 100).toFixed(0)}%, Load: ${(ctx.currentLoad * 100).toFixed(0)}%, Tokens: ${ctx.estimatedTokens}`,
      agentContext: {
        complexity: ctx.taskComplexity,
        load: ctx.currentLoad,
        estimatedTokens: ctx.estimatedTokens,
      },
    };
  }

  private buildReplyDecisionContext(ctx: ReplyDecisionContext): DecisionContext {
    return {
      id: `reply-${ctx.channel}-${Date.now()}`,
      stateDescription: `Type: ${ctx.messageType}, Urgency: ${(ctx.responseUrgency * 100).toFixed(0)}%, HasMedia: ${ctx.hasMedia}`,
      temporalContext: { recencyBias: ctx.responseUrgency },
      agentContext: {
        messageType: ctx.messageType,
        userPriority: ctx.userPriority,
        contextLength: ctx.contextLength,
        hasMedia: ctx.hasMedia,
      },
    };
  }

  private recordDecision(type: DecisionType, context: unknown): string {
    const decisionId = generateId("dec", Date.now().toString());
    
    this.pendingDecisions.set(decisionId, {
      type,
      context,
      timestamp: Date.now(),
    });

    // 清理过期决策
    const now = Date.now();
    for (const [id, data] of this.pendingDecisions) {
      if (now - data.timestamp > 3600000) { // 1小时过期
        this.pendingDecisions.delete(id);
      }
    }

    this.stats.totalDecisions++;

    // 开始元认知追踪
    if (this.monitor) {
      this.monitor.beginOperation("decide", { type, decisionId });
    }

    return decisionId;
  }

  private trackDecision(result: DecisionResult, type: DecisionType): void {
    log.debug(`决策: ${type} -> ${result.action.id} (置信度: ${(result.confidence * 100).toFixed(1)}%, 探索: ${result.isExploration})`);
  }

  private updateStats(reward: number): void {
    const n = this.feedbackHistory.length;
    this.stats.avgReward = this.stats.avgReward + (reward - this.stats.avgReward) / n;
  }

  // ========================================================================
  // 查询接口
  // ========================================================================

  getStats() {
    return { ...this.stats };
  }

  getEngineState() {
    return this.engine.getState();
  }

  getRecentFeedback(limit = 10): DecisionFeedback[] {
    return this.feedbackHistory.slice(-limit);
  }

  /**
   * 调整探索率
   */
  adjustExploration(factor: number): void {
    this.engine.adjustExploration(factor);
    log.info(`探索率已调整: ${factor}x`);
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.monitor?.stop();
    this.engine.destroy();
    this.pendingDecisions.clear();
    log.info("决策系统集成已销毁");
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createDecisionIntegration(
  config?: Partial<DecisionIntegrationConfig>,
): DecisionIntegration {
  return new DecisionIntegration(config);
}

// 全局实例
let globalDecisionIntegration: DecisionIntegration | undefined;

export function getDecisionIntegration(config?: Partial<DecisionIntegrationConfig>): DecisionIntegration {
  if (!globalDecisionIntegration) {
    globalDecisionIntegration = createDecisionIntegration(config);
  }
  return globalDecisionIntegration;
}

export function resetDecisionIntegration(): void {
  globalDecisionIntegration?.destroy();
  globalDecisionIntegration = undefined;
}
