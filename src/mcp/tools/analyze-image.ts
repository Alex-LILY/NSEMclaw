/**
 * 本地视觉分析工具
 * 
 * 使用本地 Llava-Phi-3-mini-int4 模型分析图片
 * 按需加载到 GPU，空闲自动卸载
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../agents/tools/common.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getVisionModelEngine } from "../../cognitive-core/vision/VisionModelEngine.js";
import { resolveUserPath } from "../../utils.js";

const log = createSubsystemLogger("local-vision-tool");

export interface LocalVisionToolOptions {
  /** 最大图片大小 (MB) */
  maxSizeMb?: number;
  /** 默认任务类型 */
  defaultTaskType?: "describe" | "ocr" | "ui" | "code";
}

/**
 * 创建本地视觉分析工具
 * 
 * 这个工具使用本地 VLM (Llava-Phi-3-mini-int4) 分析图片，不需要外部 API
 * 模型按需加载到 GPU，空闲 5 分钟后自动卸载
 */
export function createLocalVisionTool(options?: LocalVisionToolOptions): AnyAgentTool | null {
  const maxSizeBytes = (options?.maxSizeMb ?? 10) * 1024 * 1024;
  const defaultTaskType = options?.defaultTaskType ?? "describe";

  return {
    label: "Local Vision",
    name: "local_vision",
    description: `Analyze an image using a local vision model (Llava-Phi-3-mini). 
The model loads on-demand to GPU and auto-unloads after 5 minutes of inactivity.
Tasks: describe (general description), ocr (text extraction), ui (UI element analysis), code (code screenshot analysis).`,
    parameters: Type.Object({
      imagePath: Type.String({ description: "Path to the image file" }),
      task: Type.Optional(
        Type.Enum(
          { describe: "describe", ocr: "ocr", ui: "ui", code: "code" },
          { description: `Analysis task type. Default: ${defaultTaskType}` }
        )
      ),
      prompt: Type.Optional(
        Type.String({ description: "Custom prompt (optional, for advanced use)" })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      
      // 验证图片路径
      const imagePathRaw = typeof record.imagePath === "string" ? record.imagePath.trim() : "";
      if (!imagePathRaw) {
        return {
          content: [{ type: "text", text: "Error: imagePath is required" }],
          details: { error: "missing_image_path" },
        };
      }

      const imagePath = imagePathRaw.startsWith("~") 
        ? resolveUserPath(imagePathRaw) 
        : imagePathRaw;

      // 检查模型是否可用
      const engine = getVisionModelEngine();
      if (!engine.isModelAvailable()) {
        return {
          content: [
            {
              type: "text",
              text: `Local vision model not installed.\n\nTo install, run:\n  npx nsemclaw-cli local-model vision`,
            },
          ],
          details: { error: "model_not_installed" },
        };
      }

      // 确定任务类型
      const taskType = (record.task as any) || defaultTaskType;
      const customPrompt = typeof record.prompt === "string" ? record.prompt : undefined;

      log.info(`Analyzing image: ${imagePath} [${taskType}]`);

      try {
        const startTime = Date.now();
        
        const result = await engine.analyzeImage({
          imagePath,
          taskType,
          prompt: customPrompt,
        });

        const totalTime = Date.now() - startTime;

        return {
          content: [{ type: "text", text: result.description }],
          details: {
            taskType,
            processingTime: result.processingTime,
            totalTime,
            modelLoaded: engine.getStatus().loaded,
          },
        };

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`Image analysis failed: ${errorMsg}`);
        
        return {
          content: [{ type: "text", text: `Error analyzing image: ${errorMsg}` }],
          details: { error: errorMsg },
        };
      }
    },
  };
}

/**
 * 检查本地视觉模型是否已安装
 */
export function isLocalVisionModelAvailable(): boolean {
  return getVisionModelEngine().isModelAvailable();
}

/**
 * 获取本地视觉模型状态
 */
export function getLocalVisionModelStatus() {
  const engine = getVisionModelEngine();
  return {
    available: engine.isModelAvailable(),
    ...engine.getStatus(),
  };
}
