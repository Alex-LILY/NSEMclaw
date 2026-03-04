/**
 * 决策模型引擎 - 专用轻量级推理模型
 *
 * 使用 Phi-4-mini-instruct 做决策推理
 * - 本地运行，延迟 < 200ms
 * - GPU 加速
 * - 支持情感感知和上下文理解
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { generateId } from "../utils/common.js";
import { getModelPath } from "../utils/model-downloader.js";
import type { DecisionStrategyEngine } from "./DecisionStrategyEngine.js";

const log = createSubsystemLogger("decision-model");

// 动态导入 node-llama-cpp（ESM 兼容）
async function importNodeLlamaCpp() {
  return import("node-llama-cpp");
}

// ============================================================================
// 模型配置
// ============================================================================

/** 决策模型配置 */
export interface DecisionModelConfig {
  /** 模型路径（默认使用 NSEM_PREDEFINED_MODELS.decision） */
  modelPath?: string;
  /** GPU 层数（默认 999，尽可能多加载到 GPU） */
  gpuLayers?: number;
  /** 上下文长度 */
  contextLength?: number;
  /** 温度（创造性 vs 确定性） */
  temperature?: number;
  /** 最大生成长度 */
  maxTokens?: number;
}

const DEFAULT_CONFIG: Required<DecisionModelConfig> = {
  modelPath: "",
  gpuLayers: 999,
  contextLength: 8192,
  temperature: 0.3,
  maxTokens: 512,
};

// ============================================================================
// 类型定义
// ============================================================================

export interface ToolDecisionRequest {
  type: "tool_allow" | "tool_strategy";
  toolName: string;
  toolParams: unknown;
  toolDescription?: string;
  dangerLevel: "safe" | "caution" | "dangerous" | "critical";
  sessionKey: string;
  agentId: string;
  recentToolCalls: Array<{
    toolName: string;
    success: boolean;
    duration: number;
    timestamp: number;
  }>;
  loopDetected: boolean;
}

export interface SubagentDecisionRequest {
  type: "subagent_spawn";
  taskDescription: string;
  taskComplexity: number;
  estimatedTokens: number;
  parentSessionKey: string;
  availableModels: string[];
  currentLoad: number;
  deadline?: number;
}

export interface ReplyDecisionRequest {
  type: "reply_mode";
  messageContent: string;
  messageType: "text" | "command" | "media" | "voice";
  channel: string;
  userPriority: number;
  responseUrgency: number;
  contextLength: number;
  hasMedia: boolean;
  conversationHistory: number;
}

export interface MemoryDecisionRequest {
  type: "memory_strategy";
  query: string;
  urgency: number;
}

export type DecisionRequest =
  | ToolDecisionRequest
  | SubagentDecisionRequest
  | ReplyDecisionRequest
  | MemoryDecisionRequest;

export interface EmotionalContext {
  mood: "urgent" | "frustrated" | "curious" | "casual" | "happy" | "neutral";
  confidence: number;
  intensity: number;
  keywords: string[];
}

export interface UserProfile {
  userId: string;
  riskTolerance: number;
  preferredSpeed: "immediate" | "balanced" | "thoughtful";
  toolFamiliarity: Record<string, number>;
  satisfactionHistory: number[];
  relationshipScore: number;
  commonPatterns: string[];
}

export interface RichDecisionContext {
  temporal: {
    timeOfDay: string;
    dayOfWeek: number;
    isWeekend: boolean;
  };
  system: {
    cpuLoad: number;
    memoryUsage: number;
    activeSessions: number;
  };
  emotional?: EmotionalContext;
  userProfile?: UserProfile;
  decisionHistory: Array<{
    decisionType: string;
    outcome: "success" | "failure" | "overridden";
    timestamp: number;
  }>;
}

export interface EngineAdvice {
  recommendedAction: string;
  confidence: number;
  alternativeActions: Array<{ action: string; score: number }>;
  riskFactors: string[];
  estimatedSuccessRate: number;
}

export interface DecisionResponse {
  decisionId: string;
  decision: {
    action: string;
    allow: boolean;
    requireConfirm: boolean;
    strategy?: string;
  };
  confidence: number;
  reasoning: string;
  riskAssessment: {
    level: "low" | "medium" | "high" | "critical";
    factors: string[];
    mitigation?: string;
  };
  userMessage?: {
    shouldExplain: boolean;
    explanation: string;
    tone: "friendly" | "professional" | "cautious" | "urgent";
  };
  metadata: {
    modelUsed: string;
    inferenceTime: number;
    tokensUsed: number;
    emotionalFactors?: string[];
  };
}

// ============================================================================
// 决策模型引擎
// ============================================================================

export class DecisionModelEngine {
  private config: Required<DecisionModelConfig>;
  private modelLoaded = false;
  private loadPromise: Promise<void> | null = null;
  
  // node-llama-cpp 实例
  private llamaInstance: any = null;
  private model: any = null;
  private context: any = null;

  constructor(config: DecisionModelConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 如果没有指定路径，使用默认决策模型路径
    if (!this.config.modelPath) {
      this.config.modelPath = getModelPath("decision");
    }
    
    log.info("🧠 决策模型引擎初始化");
    log.info(`   模型路径: ${this.config.modelPath}`);
    log.info(`   GPU 层数: ${this.config.gpuLayers}`);
  }

  /**
   * 加载模型到 GPU
   */
  async loadModel(): Promise<void> {
    if (this.modelLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.doLoadModel();
    return this.loadPromise;
  }

  private async doLoadModel(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const llama = await importNodeLlamaCpp();
      
      log.info("🔧 初始化 Llama (GPU 模式)...");
      this.llamaInstance = await llama.getLlama({ logLevel: llama.LlamaLogLevel.error });
      
      log.info(`📥 加载决策模型: Phi-4-mini-instruct`);
      log.info(`   路径: ${this.config.modelPath}`);
      
      this.model = await this.llamaInstance.loadModel({
        modelPath: this.config.modelPath,
        gpuLayers: this.config.gpuLayers,
        verbose: false,
      });
      
      // 创建上下文
      this.context = await this.model.createContext({
        contextSize: this.config.contextLength,
      });
      
      this.modelLoaded = true;
      const loadTime = Date.now() - startTime;
      
      log.info(`✅ 决策模型加载完成 (${loadTime}ms)`);
      log.info(`   模型大小: ~2.5GB`);
      log.info(`   GPU 层数: ${this.config.gpuLayers}`);
      
    } catch (err) {
      log.error(`❌ 决策模型加载失败: ${err}`);
      throw err;
    }
  }

  /**
   * 执行决策
   */
  async decide(
    request: DecisionRequest,
    context: RichDecisionContext,
    engineAdvice?: EngineAdvice,
  ): Promise<DecisionResponse> {
    await this.loadModel();

    const startTime = Date.now();
    const decisionId = generateId("dec", Date.now().toString());

    // 构建提示
    const prompt = this.buildDecisionPrompt(request, context, engineAdvice);

    try {
      // 使用模型推理
      const sequence = this.context.getSequence();
      
      // 生成响应
      const response = await sequence.evaluate(prompt, {
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      });
      
      const responseText = response.trim();
      
      // 解析响应
      const result = this.parseDecisionResponse(responseText, request);
      
      const inferenceTime = Date.now() - startTime;
      
      log.debug(`决策完成: ${request.type} -> ${result.decision.action} (${inferenceTime}ms)`);

      return {
        ...result,
        decisionId,
        metadata: {
          ...result.metadata,
          inferenceTime,
        },
      };
      
    } catch (err) {
      log.error(`模型推理失败: ${err}`);
      // 失败时回退到规则-based 决策
      return this.fallbackDecision(request, context, decisionId);
    }
  }

  /**
   * 构建决策提示
   */
  private buildDecisionPrompt(
    request: DecisionRequest,
    context: RichDecisionContext,
    engineAdvice?: EngineAdvice,
  ): string {
    const parts: string[] = [];

    // 系统提示
    parts.push(`<|system|>
你是一个智能决策助手，帮助AI系统做出合适的决策。
原则：1)安全第一 2)理解用户真实意图 3)灵活但有原则 4)透明可解释
只输出JSON格式的决策结果。<|end|>`);

    // 上下文
    parts.push(`<|user|>
### 上下文
时间: ${context.temporal.timeOfDay}
系统负载: CPU ${(context.system.cpuLoad * 100).toFixed(0)}%`);

    if (context.emotional) {
      parts.push(`用户情绪: ${context.emotional.mood} (强度: ${(context.emotional.intensity * 100).toFixed(0)}%)`);
    }

    if (context.userProfile) {
      parts.push(`用户信任度: ${(context.userProfile.relationshipScore * 100).toFixed(0)}%`);
      parts.push(`风险容忍度: ${(context.userProfile.riskTolerance * 100).toFixed(0)}%`);
    }

    // 决策请求
    parts.push(`\n### 决策请求
类型: ${request.type}`);

    if (request.type === "tool_allow" || request.type === "tool_strategy") {
      parts.push(`工具: ${request.toolName}
危险等级: ${request.dangerLevel}`);
      if (request.loopDetected) parts.push(`警告: 检测到循环调用`);
    } else if (request.type === "subagent_spawn") {
      parts.push(`任务复杂度: ${(request.taskComplexity * 100).toFixed(0)}%
当前负载: ${(request.currentLoad * 100).toFixed(0)}%`);
    }

    // 引擎建议
    if (engineAdvice) {
      parts.push(`\n### 引擎建议
推荐: ${engineAdvice.recommendedAction} (置信度: ${(engineAdvice.confidence * 100).toFixed(0)}%)`);
    }

    // 输出格式
    parts.push(`\n### 请以JSON格式输出决策
{"decision": {"action": "动作", "allow": true/false, "requireConfirm": true/false}, "confidence": 0.0-1.0, "reasoning": "解释", "riskLevel": "low/medium/high"}<|end|>
<|assistant|>`);

    return parts.join("\n");
  }

  /**
   * 解析模型响应
   */
  private parseDecisionResponse(response: string, request: DecisionRequest): DecisionResponse {
    try {
      // 提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
          decisionId: "",
          decision: {
            action: parsed.decision?.action || "allow",
            allow: parsed.decision?.allow ?? true,
            requireConfirm: parsed.decision?.requireConfirm ?? false,
            strategy: parsed.decision?.strategy,
          },
          confidence: parsed.confidence ?? 0.7,
          reasoning: parsed.reasoning || "模型决策",
          riskAssessment: {
            level: parsed.riskLevel || "low",
            factors: [],
          },
          metadata: {
            modelUsed: "Phi-4-mini-instruct",
            inferenceTime: 0,
            tokensUsed: response.length,
          },
        };
      }
    } catch {
      // 解析失败，使用默认
    }
    
    return this.fallbackDecision(request, {} as any, "");
  }

  /**
   * 回退决策（模型失败时使用）
   */
  private fallbackDecision(
    request: DecisionRequest,
    context: RichDecisionContext,
    decisionId: string,
  ): DecisionResponse {
    // 简单规则决策
    let action = "allow";
    let allow = true;
    let requireConfirm = false;

    if (request.type === "tool_allow") {
      if (request.dangerLevel === "critical" || request.loopDetected) {
        action = "confirm";
        allow = false;
        requireConfirm = true;
      } else if (request.dangerLevel === "dangerous") {
        action = "confirm";
        allow = false;
        requireConfirm = true;
      }
    }

    return {
      decisionId,
      decision: { action, allow, requireConfirm },
      confidence: 0.5,
      reasoning: "模型推理失败，使用规则回退",
      riskAssessment: { level: requireConfirm ? "medium" : "low", factors: [] },
      metadata: {
        modelUsed: "fallback-rules",
        inferenceTime: 0,
        tokensUsed: 0,
      },
    };
  }

  /**
   * 检查模型是否已加载
   */
  isLoaded(): boolean {
    return this.modelLoaded;
  }

  /**
   * 卸载模型释放资源
   */
  async unloadModel(): Promise<void> {
    if (!this.modelLoaded) return;
    
    log.info("📤 卸载决策模型");
    
    if (this.context) {
      await this.context.dispose();
      this.context = null;
    }
    if (this.model) {
      await this.model.dispose();
      this.model = null;
    }
    
    this.modelLoaded = false;
    this.loadPromise = null;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createDecisionModelEngine(
  config?: DecisionModelConfig,
): DecisionModelEngine {
  return new DecisionModelEngine(config);
}

// 全局实例
let globalDecisionModelEngine: DecisionModelEngine | undefined;

export function getDecisionModelEngine(
  config?: DecisionModelConfig,
): DecisionModelEngine {
  if (!globalDecisionModelEngine) {
    globalDecisionModelEngine = createDecisionModelEngine(config);
  }
  return globalDecisionModelEngine;
}

export function resetDecisionModelEngine(): void {
  globalDecisionModelEngine = undefined;
}
