/**
 * 内容路由器 - 智能路由用户请求到合适的处理系统
 *
 * 功能:
 * - 分析用户消息内容（文本 + 附件）
 * - 识别图片相关请求
 * - 路由到视觉系统或 LLM
 * - 整合视觉结果到对话流程
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { SmartDecisionService } from "../decision/SmartDecisionService.js";
import type { VisionModelEngine } from "../vision/VisionModelEngine.js";
import type { ImageAnalysisRequest, ImageAnalysisResult } from "../vision/VisionModelEngine.js";

const log = createSubsystemLogger("content-router");

// ============================================================================
// 类型定义
// ============================================================================

export interface UserMessage {
  /** 用户ID */
  userId: string;
  /** 会话ID */
  sessionId: string;
  /** 文本内容 */
  text: string;
  /** 附件列表 */
  attachments?: Attachment[];
  /** 时间戳 */
  timestamp?: number;
}

export interface Attachment {
  /** 附件类型 */
  type: "image" | "file" | "audio" | "video";
  /** MIME 类型 */
  mimeType?: string;
  /** 文件路径或 URL */
  path: string;
  /** 文件名 */
  filename?: string;
  /** 文件大小 */
  size?: number;
}

export interface RoutingDecision {
  /** 路由目标 */
  route: "vision" | "llm" | "tool" | "hybrid";
  /** 任务类型（针对视觉系统） */
  taskType?: "describe" | "ocr" | "ui" | "code" | "custom";
  /** 优先级 */
  priority: "low" | "normal" | "high" | "urgent";
  /** 置信度 */
  confidence: number;
  /** 决策理由 */
  reasoning: string;
  /** 是否需要确认 */
  requireConfirm?: boolean;
}

export interface ContentRoutingResult {
  /** 路由决策 */
  decision: RoutingDecision;
  /** 如果是图片，视觉分析结果 */
  visionResult?: ImageAnalysisResult;
  /** 处理后的上下文 */
  enrichedContext?: string;
  /** 元数据 */
  metadata: {
    processingTime: number;
    hasImage: boolean;
    imageCount: number;
    decisionId: string;
  };
}

// ============================================================================
// 内容路由器
// ============================================================================

export class ContentRouter {
  private decisionService: SmartDecisionService;
  private visionEngine: VisionModelEngine;

  constructor(options: {
    decisionService: SmartDecisionService;
    visionEngine: VisionModelEngine;
  }) {
    this.decisionService = options.decisionService;
    this.visionEngine = options.visionEngine;
    log.info("内容路由器初始化完成");
  }

  /**
   * 路由用户消息
   * 核心入口：分析消息并决定如何处理
   */
  async routeMessage(message: UserMessage): Promise<ContentRoutingResult> {
    const startTime = Date.now();
    const decisionId = `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. 分析消息内容
    const contentAnalysis = this.analyzeContent(message);
    log.debug(`消息分析: ${contentAnalysis.hasImage ? '包含图片' : '纯文本'}, ` +
              `意图: ${contentAnalysis.intent || 'general'}`);

    // 2. 如果没有图片，直接路由到 LLM
    if (!contentAnalysis.hasImage) {
      return {
        decision: {
          route: "llm",
          priority: "normal",
          confidence: 0.9,
          reasoning: "纯文本消息，直接由 LLM 处理"
        },
        metadata: {
          processingTime: Date.now() - startTime,
          hasImage: false,
          imageCount: 0,
          decisionId
        }
      };
    }

    // 3. 有图片，进行智能路由决策
    const routingDecision = this.makeRoutingDecision(message, contentAnalysis);
    log.info(`路由决策: ${routingDecision.route} (任务: ${routingDecision.taskType || 'N/A'}, ` +
             `置信度: ${routingDecision.confidence.toFixed(2)})`);

    // 4. 如果决策路由到视觉系统，执行图片分析
    let visionResult: ImageAnalysisResult | undefined;
    if (routingDecision.route === "vision" && this.visionEngine.isModelAvailable()) {
      try {
        const imagePath = contentAnalysis.imagePaths[0];
        visionResult = await this.executeVisionAnalysis(imagePath, routingDecision.taskType);
        log.info(`视觉分析完成: ${visionResult.processingTime}ms`);
      } catch (error) {
        log.error(`视觉分析失败: ${error}`);
        // 失败时回退到 LLM 路由
        routingDecision.route = "llm";
        routingDecision.reasoning += " (视觉系统失败，回退到 LLM)";
      }
    }

    // 5. 构建增强上下文
    const enrichedContext = visionResult 
      ? this.buildEnrichedContext(message.text, visionResult)
      : undefined;

    return {
      decision: routingDecision,
      visionResult,
      enrichedContext,
      metadata: {
        processingTime: Date.now() - startTime,
        hasImage: true,
        imageCount: contentAnalysis.imagePaths.length,
        decisionId
      }
    };
  }

  /**
   * 快速路由（性能优先，无模型推理）
   */
  routeFast(message: UserMessage): RoutingDecision {
    const analysis = this.analyzeContent(message);

    // 有图片且用户询问图片内容
    if (analysis.hasImage && analysis.mentionsImage) {
      return {
        route: "vision",
        taskType: analysis.inferredTask,
        priority: "high",
        confidence: 0.85,
        reasoning: "检测到图片相关询问"
      };
    }

    // 有图片但没有明确询问（可能配图说明）
    if (analysis.hasImage) {
      return {
        route: "hybrid",
        priority: "normal",
        confidence: 0.7,
        reasoning: "图片可能是辅助说明，需要 LLM 判断是否分析"
      };
    }

    // 纯文本
    return {
      route: "llm",
      priority: "normal",
      confidence: 0.95,
      reasoning: "纯文本消息"
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 分析消息内容
   */
  private analyzeContent(message: UserMessage): {
    hasImage: boolean;
    imagePaths: string[];
    intent?: string;
    mentionsImage: boolean;
    inferredTask?: ImageAnalysisRequest["taskType"];
  } {
    const imageAttachments = message.attachments?.filter(
      a => a.type === "image" || a.mimeType?.startsWith("image/")
    ) || [];

    const hasImage = imageAttachments.length > 0;
    const imagePaths = imageAttachments.map(a => a.path);
    const text = message.text || "";

    // 检测用户是否提到图片
    const imageKeywords = /\b(图|图片|截图|界面|按钮|文字|识别|提取|这个|那个|上面|下面)\b/;
    const mentionsImage = imageKeywords.test(text);

    // 推断任务类型
    let inferredTask: ImageAnalysisRequest["taskType"] = "describe";
    if (/提取.*文字|OCR|文字识别|文本|内容/i.test(text)) {
      inferredTask = "ocr";
    } else if (/界面|UI|按钮|布局|元素|组件|菜单/i.test(text)) {
      inferredTask = "ui";
    } else if (/代码|程序|函数|类|脚本|报错/i.test(text)) {
      inferredTask = "code";
    }

    return {
      hasImage,
      imagePaths,
      mentionsImage,
      inferredTask
    };
  }

  /**
   * 做出路由决策
   */
  private makeRoutingDecision(
    message: UserMessage,
    analysis: ReturnType<typeof this.analyzeContent>
  ): RoutingDecision {
    const text = message.text || "";

    // 场景1: 用户明确询问图片内容
    if (analysis.hasImage && analysis.mentionsImage) {
      return {
        route: "vision",
        taskType: analysis.inferredTask,
        priority: "high",
        confidence: 0.92,
        reasoning: `用户明确询问图片内容，推断任务类型: ${analysis.inferredTask}`
      };
    }

    // 场景2: 有图片但没有文字（纯图片消息）
    if (analysis.hasImage && !text.trim()) {
      return {
        route: "vision",
        taskType: "describe",
        priority: "normal",
        confidence: 0.8,
        reasoning: "纯图片消息，自动分析"
      };
    }

    // 场景3: 有图片但文字不相关（可能是误发或配图）
    if (analysis.hasImage && !analysis.mentionsImage) {
      // 检查文字是否完全不相关
      const unrelatedPatterns = /^(你好|谢谢|再见|好的|收到|ok|hello|hi|thanks)/i;
      if (unrelatedPatterns.test(text)) {
        return {
          route: "llm",
          priority: "low",
          confidence: 0.75,
          reasoning: "图片可能是误发，文字内容与图片无关"
        };
      }

      // 否则给 LLM 决定
      return {
        route: "hybrid",
        priority: "normal",
        confidence: 0.65,
        reasoning: "不确定是否需要分析图片，由 LLM 判断"
      };
    }

    // 默认
    return {
      route: "llm",
      priority: "normal",
      confidence: 0.9,
      reasoning: "无需特殊路由"
    };
  }

  /**
   * 执行视觉分析
   */
  private async executeVisionAnalysis(
    imagePath: string,
    taskType?: ImageAnalysisRequest["taskType"]
  ): Promise<ImageAnalysisResult> {
    // 确保模型已加载
    await this.visionEngine.loadModel();

    // 执行分析
    return this.visionEngine.analyzeImage({
      imagePath,
      taskType: taskType || "describe"
    });
  }

  /**
   * 构建增强上下文
   * 将视觉分析结果整合到对话上下文
   */
  private buildEnrichedContext(
    userText: string,
    visionResult: ImageAnalysisResult
  ): string {
    const sections: string[] = [];

    // 添加视觉分析结果
    sections.push("[图片分析结果]");
    sections.push(visionResult.description);

    if (visionResult.detectedText && visionResult.detectedText.length > 0) {
      sections.push("\n[识别到的文字]");
      sections.push(visionResult.detectedText.join("\n"));
    }

    if (visionResult.uiElements && visionResult.uiElements.length > 0) {
      sections.push("\n[UI 元素]");
      visionResult.uiElements.forEach(el => {
        sections.push(`- ${el.type}${el.label ? `: ${el.label}` : ""}`);
      });
    }

    // 添加用户原始问题
    if (userText.trim()) {
      sections.push("\n[用户问题]");
      sections.push(userText);
    }

    return sections.join("\n");
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createContentRouter(options: {
  decisionService: SmartDecisionService;
  visionEngine: VisionModelEngine;
}): ContentRouter {
  return new ContentRouter(options);
}

// 全局实例
let globalContentRouter: ContentRouter | undefined;

export function getContentRouter(options?: {
  decisionService: SmartDecisionService;
  visionEngine: VisionModelEngine;
}): ContentRouter {
  if (!globalContentRouter) {
    if (!options) {
      throw new Error("ContentRouter not initialized");
    }
    globalContentRouter = createContentRouter(options);
  }
  return globalContentRouter;
}

export function resetContentRouter(): void {
  globalContentRouter = undefined;
}
