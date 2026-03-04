/**
 * 决策系统集成层 v2.0 - 智能、情感化、LLM驱动
 *
 * 核心改进:
 * 1. 集成 SmartDecisionService - 轻量级LLM决策模型
 * 2. 情感感知 - 根据用户情绪调整决策
 * 3. 用户画像学习 - 越用越懂你
 * 4. 动态阈值 - 不再是死板硬编码
 * 5. 决策可覆盖 - LLM可以覆盖系统决策
 *
 * 决策流程:
 * 用户请求 → 情感分析 → 智能决策服务 → 决策结果 → 执行 → 反馈学习
 */

import type { 
  DecisionStrategyEngine,
  SmartDecisionService,
  EmotionalIntelligence,
  DecisionResponse,
  SmartDecisionConfig,
  ToolDecisionRequest,
  SubagentDecisionRequest,
  ReplyDecisionRequest,
  MemoryDecisionRequest,
} from "../decision/index.js";
import { 
  createDecisionEngine, 
  createUCBEngine,
  getSmartDecisionService,
  getEmotionalIntelligence,
  getDecisionEngine,
  resetSmartDecisionService,
} from "../decision/index.js";
import { createMetaCognitionMonitor } from "../meta-cognition/MetaCognitionMonitor.js";
import type { MetaCognitionMonitor } from "../meta-cognition/MetaCognitionMonitor.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { generateId } from "../utils/common.js";

const log = createSubsystemLogger("decision-integration-v2");

// ============================================================================
// 配置
// ============================================================================

export interface DecisionIntegrationConfig {
  /** 是否启用决策系统 */
  enabled: boolean;
  /** 使用模式: 'traditional' | 'smart' | 'hybrid' */
  mode: "traditional" | "smart" | "hybrid";
  /** 智能决策服务配置 */
  smartDecision?: SmartDecisionConfig;
  /** 传统引擎策略 */
  defaultStrategy: "ucb" | "epsilon-greedy" | "thompson-sampling" | "softmax";
  /** 是否启用元认知监控 */
  enableMetaCognition: boolean;
  /** 反馈窗口大小 */
  feedbackWindowSize: number;
  /** 探索率 */
  explorationRate: number;
}

const DEFAULT_CONFIG: DecisionIntegrationConfig = {
  enabled: true, // 默认启用新决策系统
  mode: "smart", // 默认使用智能决策
  defaultStrategy: "ucb",
  enableMetaCognition: false,
  feedbackWindowSize: 100,
  explorationRate: 0.1,
};

// ============================================================================
// 类型定义
// ============================================================================

export type DecisionType =
  | "tool_allow"
  | "tool_strategy"
  | "subagent_spawn"
  | "subagent_model"
  | "reply_mode"
  | "memory_strategy";

/** 工具调用决策上下文 */
export interface ToolDecisionContext {
  toolName: string;
  toolParams: unknown;
  toolDescription?: string;
  sessionKey: string;
  agentId: string;
  recentToolCalls: Array<{ toolName: string; success: boolean; duration: number }>;
  loopDetected: boolean;
  userIntent?: string;
  message?: string; // 用户原始消息（用于情感分析）
}

/** 子代理决策上下文 */
export interface SubagentDecisionContext {
  taskDescription: string;
  taskComplexity: number;
  parentSessionKey: string;
  availableModels: string[];
  currentLoad: number;
  estimatedTokens: number;
  deadline?: number;
  message?: string;
}

/** 回复策略决策上下文 */
export interface ReplyDecisionContext {
  messageContent: string;
  messageType: "text" | "command" | "media" | "voice";
  channel: string;
  userPriority: number;
  responseUrgency: number;
  contextLength: number;
  hasMedia: boolean;
  conversationHistory: number;
}

/** 记忆检索决策上下文 */
export interface MemoryDecisionContext {
  query: string;
  urgency: number;
  queryIntent?: string;
  expectedResults?: number;
}

/** 决策结果 */
export interface DecisionResult {
  allow: boolean;
  requireConfirm: boolean;
  strategy?: string;
  mode?: string;
  decisionId: string;
  confidence: number;
  reasoning: string;
  userMessage?: {
    shouldExplain: boolean;
    explanation: string;
    tone: "friendly" | "professional" | "cautious" | "urgent";
  };
  riskAssessment: {
    level: "low" | "medium" | "high" | "critical";
    factors: string[];
  };
}

/** 决策反馈 */
export interface DecisionFeedback {
  decisionId: string;
  success: boolean;
  reward: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 决策集成类 v2
// ============================================================================

export class DecisionIntegration {
  private config: DecisionIntegrationConfig;
  private smartService: SmartDecisionService;
  private emotionalIntelligence: EmotionalIntelligence;
  private traditionalEngine: DecisionStrategyEngine;
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
    emotionalDecisions: 0,
  };

  constructor(config: Partial<DecisionIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 初始化智能决策服务
    this.smartService = getSmartDecisionService(this.config.smartDecision);
    this.emotionalIntelligence = getEmotionalIntelligence();
    this.traditionalEngine = getDecisionEngine();

    // 元认知监控
    if (this.config.enableMetaCognition) {
      this.monitor = createMetaCognitionMonitor();
      this.monitor.start();
    }

    log.info("🎯 决策系统集成 v2.0 已初始化");
    log.info(`   模式: ${this.config.mode}`);
    log.info(`   状态: ${this.config.enabled ? "启用" : "禁用"}`);
  }

  // ==========================================================================
  // 工具调用决策
  // ==========================================================================

  async decideToolAllow(context: ToolDecisionContext): Promise<DecisionResult> {
    if (!this.config.enabled) {
      return this.allowByDefault(context);
    }

    const dangerLevel = this.assessToolDangerLevel(context.toolName);

    // 构建请求
    const request: ToolDecisionRequest = {
      type: "tool_allow",
      toolName: context.toolName,
      toolParams: context.toolParams,
      toolDescription: context.toolDescription,
      dangerLevel,
      sessionKey: context.sessionKey,
      agentId: context.agentId,
      recentToolCalls: context.recentToolCalls.map(c => ({ ...c, timestamp: Date.now() })),
      loopDetected: context.loopDetected,
    };

    // 执行决策
    const response = await this.smartService.decide(request, {
      userId: context.agentId,
      message: context.message,
    });

    return this.convertToDecisionResult(response);
  }

  async decideToolStrategy(context: ToolDecisionContext): Promise<DecisionResult> {
    if (!this.config.enabled) {
      return { ...this.allowByDefault(context), strategy: "direct" };
    }

    const dangerLevel = this.assessToolDangerLevel(context.toolName);

    const request: ToolDecisionRequest = {
      type: "tool_strategy",
      toolName: context.toolName,
      toolParams: context.toolParams,
      dangerLevel,
      sessionKey: context.sessionKey,
      agentId: context.agentId,
      recentToolCalls: context.recentToolCalls.map(c => ({ ...c, timestamp: Date.now() })),
      loopDetected: context.loopDetected,
    };

    const response = await this.smartService.decide(request, {
      userId: context.agentId,
      message: context.message,
    });

    return this.convertToDecisionResult(response);
  }

  // ==========================================================================
  // 子代理决策
  // ==========================================================================

  async decideSubagentSpawn(context: SubagentDecisionContext): Promise<DecisionResult> {
    if (!this.config.enabled) {
      return this.simpleSubagentDecision(context);
    }

    const request: SubagentDecisionRequest = {
      type: "subagent_spawn",
      taskDescription: context.taskDescription,
      taskComplexity: context.taskComplexity,
      estimatedTokens: context.estimatedTokens,
      parentSessionKey: context.parentSessionKey,
      availableModels: context.availableModels,
      currentLoad: context.currentLoad,
      deadline: context.deadline,
    };

    const response = await this.smartService.decide(request, {
      userId: context.parentSessionKey,
      message: context.message,
    });

    return this.convertToDecisionResult(response);
  }

  // ==========================================================================
  // 回复策略决策
  // ==========================================================================

  async decideReplyMode(context: ReplyDecisionContext): Promise<DecisionResult> {
    if (!this.config.enabled) {
      return { ...this.allowByDefault({} as any), mode: "immediate" };
    }

    const request: ReplyDecisionRequest = {
      type: "reply_mode",
      messageContent: context.messageContent,
      messageType: context.messageType,
      channel: context.channel,
      userPriority: context.userPriority,
      responseUrgency: context.responseUrgency,
      contextLength: context.contextLength,
      hasMedia: context.hasMedia,
      conversationHistory: context.conversationHistory,
    };

    const response = await this.smartService.decide(request, {
      userId: "default",
      message: context.messageContent,
    });

    return this.convertToDecisionResult(response);
  }

  // ==========================================================================
  // 记忆检索策略决策
  // ==========================================================================

  async decideMemoryStrategy(query: string, urgency: number): Promise<DecisionResult> {
    if (!this.config.enabled) {
      return { ...this.allowByDefault({} as any), strategy: "balanced" };
    }

    const request: MemoryDecisionRequest = {
      type: "memory_strategy",
      query,
      urgency,
    };

    const response = await this.smartService.decide(request);

    return this.convertToDecisionResult(response);
  }

  // ==========================================================================
  // 反馈处理
  // ==========================================================================

  submitFeedback(
    decisionId: string,
    success: boolean,
    reward: number,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.config.enabled) return;

    this.smartService.submitFeedback(decisionId, metadata?.userId as string || "anonymous", {
      success,
      userReaction: reward > 0.5 ? "satisfied" : reward > 0 ? "neutral" : "dissatisfied",
      metadata,
    });

    // 更新传统引擎
    try {
      this.traditionalEngine.updateFeedback(decisionId, reward);
    } catch {
      // 忽略
    }

    // 更新统计
    this.stats.avgReward = 
      (this.stats.avgReward * this.feedbackHistory.length + reward) / 
      (this.feedbackHistory.length + 1);

    log.debug(`反馈已提交: ${decisionId}, reward=${reward.toFixed(2)}`);
  }

  submitToolFeedback(
    decisionId: string,
    toolName: string,
    success: boolean,
    duration: number,
    error?: string,
  ): void {
    let reward = success ? 0.5 : -0.5;
    if (success && duration < 1000) reward += 0.3;
    if (error?.includes("timeout")) reward -= 0.2;

    this.submitFeedback(decisionId, success, reward, { toolName, duration, error });
  }

  submitSubagentFeedback(
    decisionId: string,
    taskCompleted: boolean,
    qualityScore: number,
    executionTime: number,
  ): void {
    const timeScore = Math.max(0, 1 - executionTime / 60000);
    const reward = taskCompleted ? (qualityScore * 0.7 + timeScore * 0.3) : -0.5;

    this.submitFeedback(decisionId, taskCompleted, reward, {
      qualityScore,
      executionTime,
    });
  }

  // ==========================================================================
  // 查询接口
  // ==========================================================================

  getStats() {
    return {
      ...this.stats,
      ...this.smartService.getStats(),
    };
  }

  getEngineState() {
    return this.traditionalEngine.getState();
  }

  getRecentFeedback(limit = 10): DecisionFeedback[] {
    return this.feedbackHistory.slice(-limit);
  }

  getUserProfile(userId: string) {
    return this.smartService.getUserProfile(userId);
  }

  adjustExploration(factor: number): void {
    this.traditionalEngine.adjustExploration(factor);
    log.info(`探索率已调整: ${factor}x`);
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  private assessToolDangerLevel(toolName: string): "safe" | "caution" | "dangerous" | "critical" {
    const name = toolName.toLowerCase();
    
    if (/exec|bash|shell|system/i.test(name)) return "critical";
    if (/write|edit|delete|remove|rm/i.test(name)) return "dangerous";
    if (/docker|container|network|curl|wget/i.test(name)) return "caution";
    
    return "safe";
  }

  private allowByDefault(context: ToolDecisionContext): DecisionResult {
    return {
      allow: true,
      requireConfirm: false,
      decisionId: `default-${Date.now()}`,
      confidence: 0.5,
      reasoning: "决策系统已禁用，默认允许",
      riskAssessment: { level: "low", factors: [] },
    };
  }

  private simpleSubagentDecision(context: SubagentDecisionContext): DecisionResult {
    const shouldSpawn = context.taskComplexity > 0.6 || context.currentLoad > 0.7;
    
    return {
      allow: shouldSpawn,
      requireConfirm: false,
      strategy: shouldSpawn ? (context.taskComplexity > 0.7 ? "quality" : "fast") : "none",
      decisionId: `simple-${Date.now()}`,
      confidence: 0.6,
      reasoning: `简单决策: 复杂度=${context.taskComplexity.toFixed(2)}, 负载=${context.currentLoad.toFixed(2)}`,
      riskAssessment: { level: "low", factors: [] },
    };
  }

  private convertToDecisionResult(response: DecisionResponse): DecisionResult {
    return {
      allow: response.decision.allow,
      requireConfirm: response.decision.requireConfirm,
      strategy: response.decision.strategy,
      mode: response.decision.action as any,
      decisionId: response.decisionId,
      confidence: response.confidence,
      reasoning: response.reasoning,
      userMessage: response.userMessage,
      riskAssessment: response.riskAssessment,
    };
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

export function getDecisionIntegration(
  config?: Partial<DecisionIntegrationConfig>,
): DecisionIntegration {
  if (!globalDecisionIntegration) {
    globalDecisionIntegration = createDecisionIntegration(config);
  }
  return globalDecisionIntegration;
}

export function resetDecisionIntegration(): void {
  globalDecisionIntegration = undefined;
  resetSmartDecisionService();
}
