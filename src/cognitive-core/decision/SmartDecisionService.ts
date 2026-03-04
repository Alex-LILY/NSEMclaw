/**
 * 智能决策服务 - 整合决策模型、情感分析和传统引擎
 *
 * 架构:
 * - 传统决策引擎提供数据支持
 * - 情感智能提供上下文理解
 * - 决策模型做出最终判断
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type {
  DecisionModelEngine,
  DecisionRequest,
  DecisionResponse,
  RichDecisionContext,
  EngineAdvice,
  DecisionModelConfig,
} from "./DecisionModelEngine.js";
import type { EmotionalIntelligence } from "./EmotionalIntelligence.js";
import type { DecisionStrategyEngine } from "./DecisionStrategyEngine.js";
import { createDecisionModelEngine, getDecisionModelEngine } from "./DecisionModelEngine.js";
import { createEmotionalIntelligence, getEmotionalIntelligence } from "./EmotionalIntelligence.js";
import { createUCBEngine, getDecisionEngine } from "./DecisionStrategyEngine.js";

const log = createSubsystemLogger("smart-decision");

// ============================================================================
// 配置类型
// ============================================================================

export interface SmartDecisionConfig {
  /** 是否启用决策模型 */
  enabled: boolean;
  /** 决策模型配置 */
  modelConfig?: DecisionModelConfig;
  /** 传统引擎权重 (0-1)，0表示完全由模型决策，1表示完全由引擎决策 */
  engineWeight: number;
  /** 情感分析权重 */
  emotionWeight: number;
  /** 默认用户ID */
  defaultUserId?: string;
  /** 是否自动记录反馈 */
  autoRecordFeedback: boolean;
  /** 决策超时 (ms) */
  decisionTimeout: number;
}

const DEFAULT_CONFIG: SmartDecisionConfig = {
  enabled: true,
  engineWeight: 0.3, // 30% 参考传统引擎，70% 由模型自主
  emotionWeight: 0.4, // 情感因素占40%影响
  autoRecordFeedback: true,
  decisionTimeout: 500, // 500ms 超时
};

// ============================================================================
// 决策服务
// ============================================================================

export class SmartDecisionService {
  private config: SmartDecisionConfig;
  private modelEngine: DecisionModelEngine;
  private emotionalIntelligence: EmotionalIntelligence;
  private traditionalEngine: DecisionStrategyEngine;

  // 决策缓存（避免重复决策）
  private decisionCache = new Map<string, {
    response: DecisionResponse;
    timestamp: number;
  }>();
  private readonly CACHE_TTL = 30000; // 30秒缓存

  // 统计
  private stats = {
    totalDecisions: 0,
    cacheHits: 0,
    modelDecisions: 0,
    engineDecisions: 0,
    timeoutFallbacks: 0,
    avgInferenceTime: 0,
  };

  constructor(config: Partial<SmartDecisionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 初始化各组件
    this.modelEngine = getDecisionModelEngine(this.config.modelConfig);
    this.emotionalIntelligence = getEmotionalIntelligence();
    this.traditionalEngine = getDecisionEngine();

    log.info("🧠 智能决策服务初始化");
    log.info(`   状态: ${this.config.enabled ? "启用" : "禁用"}`);
    log.info(`   引擎权重: ${(this.config.engineWeight * 100).toFixed(0)}%`);
    log.info(`   情感权重: ${(this.config.emotionWeight * 100).toFixed(0)}%`);
  }

  /**
   * 执行智能决策
   */
  async decide(
    request: DecisionRequest,
    options: {
      userId?: string;
      message?: string;
      skipCache?: boolean;
    } = {},
  ): Promise<DecisionResponse> {
    const startTime = Date.now();
    const userId = options.userId || this.config.defaultUserId || "anonymous";

    // 检查缓存
    if (!options.skipCache) {
      const cacheKey = this.generateCacheKey(request, userId);
      const cached = this.decisionCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.stats.cacheHits++;
        log.debug("决策缓存命中");
        return cached.response;
      }
    }

    // 如果禁用，使用传统引擎
    if (!this.config.enabled) {
      return this.traditionalFallback(request);
    }

    // 构建丰富上下文
    const context = await this.buildRichContext(userId, options.message);

    // 获取传统引擎建议
    const engineAdvice = this.getEngineAdvice(request);

    try {
      // 执行决策（带超时）
      const decisionPromise = this.modelEngine.decide(request, context, engineAdvice);
      
      const response = await Promise.race([
        decisionPromise,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Decision timeout")), this.config.decisionTimeout)
        ),
      ]);

      // 后处理：融合传统引擎建议
      const finalResponse = this.fuseWithEngineAdvice(response, engineAdvice);

      // 应用情感调整
      const emotionalAdjustedResponse = this.applyEmotionalAdjustment(
        finalResponse, 
        context.emotional,
        this.emotionalIntelligence.getUserProfile(userId),
      );

      // 更新统计
      this.updateStats(startTime, response.metadata.inferenceTime);

      // 缓存决策
      if (!options.skipCache) {
        const cacheKey = this.generateCacheKey(request, userId);
        this.decisionCache.set(cacheKey, {
          response: emotionalAdjustedResponse,
          timestamp: Date.now(),
        });
      }

      this.stats.modelDecisions++;
      return emotionalAdjustedResponse;

    } catch (err) {
      // 超时或失败时回退到传统引擎
      log.warn(`决策模型失败: ${err}, 回退到传统引擎`);
      this.stats.timeoutFallbacks++;
      return this.traditionalFallback(request);
    }
  }

  /**
   * 快速决策（无模型，用于性能敏感场景）
   */
  decideFast(
    request: DecisionRequest,
    userId?: string,
  ): DecisionResponse {
    const user = userId || "anonymous";
    const mood = request.type === "tool_allow" && "message" in request
      ? this.emotionalIntelligence.quickMoodCheck((request as any).message)
      : "neutral";

    // 基于简单规则的快速决策
    let decision: DecisionResponse["decision"];
    
    switch (request.type) {
      case "tool_allow": {
        const req = request as any;
        if (req.dangerLevel === "critical" || req.loopDetected) {
          decision = { action: "confirm", allow: false, requireConfirm: true };
        } else if (req.dangerLevel === "dangerous") {
          decision = mood === "urgent" 
            ? { action: "allow", allow: true, requireConfirm: false }
            : { action: "confirm", allow: false, requireConfirm: true };
        } else {
          decision = { action: "allow", allow: true, requireConfirm: false };
        }
        break;
      }
      case "subagent_spawn": {
        const req = request as any;
        const shouldSpawn = req.taskComplexity > 0.6 || req.currentLoad > 0.8;
        decision = {
          action: shouldSpawn ? "spawn_fast" : "no_spawn",
          allow: shouldSpawn,
          requireConfirm: false,
          strategy: shouldSpawn ? "fast" : "none",
        };
        break;
      }
      default:
        decision = { action: "allow", allow: true, requireConfirm: false };
    }

    return {
      decisionId: `fast-${Date.now()}`,
      decision,
      confidence: 0.6,
      reasoning: "快速决策模式",
      riskAssessment: { level: "low", factors: [] },
      metadata: {
        modelUsed: "fast-mode",
        inferenceTime: 0,
        tokensUsed: 0,
      },
    };
  }

  /**
   * 提交反馈
   */
  submitFeedback(
    decisionId: string,
    userId: string,
    outcome: {
      success: boolean;
      userReaction?: "satisfied" | "neutral" | "dissatisfied" | "overridden";
      metadata?: Record<string, unknown>;
    },
  ): void {
    if (!this.config.autoRecordFeedback) return;

    // 更新用户画像
    this.emotionalIntelligence.learnFromFeedback(
      userId,
      decisionId,
      outcome.userReaction || (outcome.success ? "satisfied" : "dissatisfied"),
      outcome.metadata as any,
    );

    // 更新传统引擎
    try {
      this.traditionalEngine.updateFeedback(
        decisionId,
        outcome.success ? 0.6 : -0.5,
        outcome.userReaction,
      );
    } catch {
      // 忽略引擎更新失败
    }

    log.debug(`反馈已记录: ${decisionId} -> ${outcome.userReaction || (outcome.success ? "success" : "failure")}`);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 获取用户画像
   */
  getUserProfile(userId: string) {
    return this.emotionalIntelligence.getUserProfile(userId);
  }

  /**
   * 预加载模型
   */
  async preloadModel(): Promise<void> {
    if (!this.config.enabled) return;
    await this.modelEngine.loadModel();
  }

  /**
   * 卸载模型
   */
  async unloadModel(): Promise<void> {
    await this.modelEngine.unloadModel();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private async buildRichContext(userId: string, message?: string): Promise<RichDecisionContext> {
    const now = new Date();
    
    // 时间上下文
    const hour = now.getHours();
    const timeOfDay = hour < 6 ? "night" : 
                      hour < 12 ? "morning" : 
                      hour < 18 ? "afternoon" : "evening";

    // 情感分析
    let emotional: RichDecisionContext["emotional"];
    if (message) {
      emotional = this.emotionalIntelligence.analyzeMood(message, { userId });
    }

    // 用户画像
    const userProfile = this.emotionalIntelligence.getUserProfile(userId);

    // 决策历史
    const decisionHistory: RichDecisionContext["decisionHistory"] = [];
    // TODO: 从存储中加载历史

    return {
      temporal: {
        timeOfDay,
        dayOfWeek: now.getDay(),
        isWeekend: now.getDay() === 0 || now.getDay() === 6,
      },
      system: {
        cpuLoad: 0.5, // TODO: 获取真实系统负载
        memoryUsage: 0.5,
        activeSessions: 1,
      },
      emotional,
      userProfile,
      decisionHistory,
    };
  }

  private getEngineAdvice(request: DecisionRequest): EngineAdvice | undefined {
    if (this.config.engineWeight <= 0) return undefined;

    try {
      // 将决策请求转换为传统引擎格式
      const actions = this.getActionsForRequest(request);
      
      // 这里简化处理，实际应该调用传统引擎
      const result = this.traditionalEngine.decide(actions, {
        id: `ctx-${Date.now()}`,
        stateDescription: request.type,
      });

      return {
        recommendedAction: result.action.id,
        confidence: result.confidence,
        alternativeActions: Object.entries(result.actionScores)
          .filter(([id]) => id !== result.action.id)
          .map(([action, score]) => ({ action, score })),
        riskFactors: result.isExploration ? ["exploration"] : [],
        estimatedSuccessRate: result.confidence,
      };
    } catch (err) {
      log.debug(`获取引擎建议失败: ${err}`);
      return undefined;
    }
  }

  private getActionsForRequest(request: DecisionRequest): import("./DecisionStrategyEngine.js").Action[] {
    // 根据请求类型返回对应的动作
    switch (request.type) {
      case "tool_allow":
        return [
          { id: "allow", description: "允许", type: "exploitation" as const },
          { id: "block", description: "阻止", type: "exploration" as const },
          { id: "confirm", description: "确认", type: "exploration" as const },
        ];
      case "subagent_spawn":
        return [
          { id: "no_spawn", description: "不调用", type: "exploitation" as const },
          { id: "spawn_fast", description: "快速", type: "exploration" as const },
          { id: "spawn_quality", description: "质量", type: "exploration" as const },
        ];
      default:
        return [
          { id: "allow", description: "允许", type: "exploitation" as const },
          { id: "block", description: "阻止", type: "exploration" as const },
        ];
    }
  }

  private fuseWithEngineAdvice(response: DecisionResponse, advice?: EngineAdvice): DecisionResponse {
    if (!advice || this.config.engineWeight <= 0) return response;

    const weight = this.config.engineWeight;
    
    // 融合置信度
    const fusedConfidence = response.confidence * (1 - weight) + advice.confidence * weight;
    
    // 如果引擎强烈反对，调整决策
    let adjustedDecision = response.decision;
    if (advice.confidence > 0.8 && advice.recommendedAction !== response.decision.action) {
      // 引擎非常有信心，但模型决策不同
      if (weight > 0.5) {
        // 更信任引擎
        adjustedDecision = {
          ...response.decision,
          action: advice.recommendedAction,
        };
      }
    }

    return {
      ...response,
      confidence: fusedConfidence,
      decision: adjustedDecision,
      reasoning: `${response.reasoning} (引擎建议: ${advice.recommendedAction}, 融合权重: ${weight})`,
    };
  }

  private applyEmotionalAdjustment(
    response: DecisionResponse,
    emotional?: RichDecisionContext["emotional"],
    userProfile?: RichDecisionContext["userProfile"],
  ): DecisionResponse {
    if (!emotional || this.config.emotionWeight <= 0) return response;

    let adjustedDecision = { ...response.decision };
    let adjustedConfidence = response.confidence;

    // 紧急情绪放宽限制
    if (emotional.mood === "urgent" && emotional.confidence > 0.6) {
      if (adjustedDecision.requireConfirm && userProfile && userProfile.riskTolerance > 0.5) {
        adjustedDecision.requireConfirm = false;
        adjustedConfidence = Math.min(1, adjustedConfidence + 0.1);
      }
    }

    // 沮丧情绪更谨慎
    if (emotional.mood === "frustrated" && emotional.confidence > 0.5) {
      if (!adjustedDecision.requireConfirm && adjustedDecision.action !== "allow") {
        adjustedDecision.requireConfirm = true;
      }
    }

    // 高亲密度放宽
    if (userProfile && userProfile.relationshipScore > 0.8) {
      if (adjustedDecision.requireConfirm && emotional.mood !== "frustrated") {
        adjustedDecision.requireConfirm = false;
      }
    }

    return {
      ...response,
      decision: adjustedDecision,
      confidence: adjustedConfidence,
      metadata: {
        ...response.metadata,
        emotionalFactors: [emotional.mood, `intensity:${emotional.intensity.toFixed(2)}`],
      },
    };
  }

  private traditionalFallback(request: DecisionRequest): DecisionResponse {
    this.stats.engineDecisions++;

    // 使用简单规则做回退决策
    let action: string;
    let allow: boolean;
    let requireConfirm: boolean;

    switch (request.type) {
      case "tool_allow":
        const req = request as any;
        if (req.dangerLevel === "critical" || req.loopDetected) {
          action = "confirm";
          allow = false;
          requireConfirm = true;
        } else if (req.dangerLevel === "dangerous") {
          action = "confirm";
          allow = false;
          requireConfirm = true;
        } else {
          action = "allow";
          allow = true;
          requireConfirm = false;
        }
        break;
      case "subagent_spawn":
        const subReq = request as any;
        if (subReq.taskComplexity > 0.7 || subReq.currentLoad > 0.8) {
          action = "spawn_quality";
          allow = true;
          requireConfirm = false;
        } else if (subReq.taskComplexity > 0.4) {
          action = "spawn_fast";
          allow = true;
          requireConfirm = false;
        } else {
          action = "no_spawn";
          allow = false;
          requireConfirm = false;
        }
        break;
      default:
        action = "allow";
        allow = true;
        requireConfirm = false;
    }

    return {
      decisionId: `fallback-${Date.now()}`,
      decision: { action, allow, requireConfirm },
      confidence: 0.5,
      reasoning: "传统引擎回退决策",
      riskAssessment: { level: requireConfirm ? "medium" : "low", factors: [] },
      metadata: {
        modelUsed: "traditional-fallback",
        inferenceTime: 0,
        tokensUsed: 0,
      },
    };
  }

  private generateCacheKey(request: DecisionRequest, userId: string): string {
    // 简化缓存键
    const keyParts = [request.type, userId];
    
    if (request.type === "tool_allow" || request.type === "tool_strategy") {
      keyParts.push((request as any).toolName);
      keyParts.push((request as any).dangerLevel);
    } else if (request.type === "subagent_spawn") {
      keyParts.push((request as any).taskComplexity.toFixed(1));
    }

    return keyParts.join("-");
  }

  private updateStats(startTime: number, inferenceTime: number): void {
    this.stats.totalDecisions++;
    
    const totalTime = Date.now() - startTime;
    this.stats.avgInferenceTime = 
      (this.stats.avgInferenceTime * (this.stats.totalDecisions - 1) + totalTime) / 
      this.stats.totalDecisions;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createSmartDecisionService(
  config?: Partial<SmartDecisionConfig>,
): SmartDecisionService {
  return new SmartDecisionService(config);
}

// 全局实例
let globalSmartDecisionService: SmartDecisionService | undefined;

export function getSmartDecisionService(
  config?: Partial<SmartDecisionConfig>,
): SmartDecisionService {
  if (!globalSmartDecisionService) {
    globalSmartDecisionService = createSmartDecisionService(config);
  }
  return globalSmartDecisionService;
}

export function resetSmartDecisionService(): void {
  globalSmartDecisionService = undefined;
}
