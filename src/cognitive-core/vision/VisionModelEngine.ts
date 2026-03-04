/**
 * 视觉模型引擎 - 按需加载
 * 
 * 使用 Llava-Phi-3-mini-int4 进行图片理解
 * 特点：
 * - 需要时才加载到 GPU
 * - 空闲 5 分钟后自动卸载
 * - 不占用常驻显存
 * 
 * 依赖：需要系统安装 llama.cpp (llama-mtmd-cli)
 * 安装方式：
 *   - 从源码编译: https://github.com/ggml-org/llama.cpp
 *   - make llama-mtmd-cli && sudo cp build/bin/llama-mtmd-cli /usr/local/bin/
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import path from "node:path";
import { homedir } from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);
const log = createSubsystemLogger("vision-model");

export interface VisionModelConfig {
  modelPath?: string;
  mmprojPath?: string;
  gpuLayers?: number;
  contextLength?: number;
  temperature?: number;
  maxTokens?: number;
  idleTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<VisionModelConfig> = {
  modelPath: path.join(homedir(), ".nsemclaw", "models", "llava-phi-3-mini-int4.gguf"),
  mmprojPath: path.join(homedir(), ".nsemclaw", "models", "llava-phi-3-mini-mmproj-f16.gguf"),
  gpuLayers: 999,
  contextLength: 4096,
  temperature: 0.2,
  maxTokens: 1024,
  idleTimeoutMs: 5 * 60 * 1000,
};

export interface ImageAnalysisRequest {
  imagePath: string;
  prompt?: string;
  taskType?: "describe" | "ocr" | "ui" | "code" | "custom";
}

export interface ImageAnalysisResult {
  description: string;
  detectedText?: string[];
  uiElements?: Array<{ type: string; label?: string }>;
  confidence: number;
  processingTime: number;
}

export class VisionModelEngine {
  private config: Required<VisionModelConfig>;
  private modelLoaded = false;
  private lastUsedTime = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private cliPath: string | null = null;

  constructor(config: VisionModelConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.debug("👁️ 视觉模型引擎初始化 (按需加载模式)");
  }

  isModelAvailable(): boolean {
    return fs.existsSync(this.config.modelPath) && fs.existsSync(this.config.mmprojPath);
  }

  private async findCli(): Promise<string | null> {
    if (this.cliPath) return this.cliPath;

    // 只使用 llama-mtmd-cli (llava-cli 已弃用)
    const candidates = [
      "llama-mtmd-cli",
      path.join(homedir(), ".local", "bin", "llama-mtmd-cli"),
      "/usr/local/bin/llama-mtmd-cli",
      "/usr/bin/llama-mtmd-cli",
    ];

    for (const cli of candidates) {
      try {
        await execFileAsync(cli, ["--version"]);
        this.cliPath = cli;
        log.debug(`使用 CLI: ${cli}`);
        return cli;
      } catch {
        continue;
      }
    }
    return null;
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded) {
      this.lastUsedTime = Date.now();
      return;
    }

    if (!this.isModelAvailable()) {
      throw new Error(
        "视觉模型文件不存在。请运行: npx nsemclaw-cli local-model vision"
      );
    }

    const cli = await this.findCli();
    if (!cli) {
      throw new Error(
        "未找到 llama-mtmd-cli。请安装:\n" +
        "  从源码编译: https://github.com/ggml-org/llama.cpp\n" +
        "  make llama-mtmd-cli && sudo cp build/bin/llama-mtmd-cli /usr/local/bin/"
      );
    }

    this.modelLoaded = true;
    this.lastUsedTime = Date.now();
    this.startIdleTimer();
    log.debug("✅ 视觉模型准备就绪");
  }

  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResult> {
    await this.loadModel();
    
    const startTime = Date.now();
    this.lastUsedTime = Date.now();

    const cli = await this.findCli();
    if (!cli) throw new Error("llama-mtmd-cli 不可用");

    const prompt = this.buildPrompt(request);
    
    try {
      const output = await this.runCliInference(cli, request.imagePath, prompt);

      return {
        description: output.trim(),
        confidence: 0.85,
        processingTime: Date.now() - startTime,
      };
    } catch (err) {
      log.error(`图片分析失败: ${err}`);
      throw err;
    }
  }

  private runCliInference(cli: string, imagePath: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        "-m", this.config.modelPath,
        "--mmproj", this.config.mmprojPath,
        "--image", imagePath,
        "-p", prompt,
        "-n", String(this.config.maxTokens),
        "--temp", String(this.config.temperature),
        "-ngl", String(this.config.gpuLayers),
        "--no-warmup",           // 禁用预热，避免额外输出
        "-c", String(this.config.contextLength),
      ];

      log.debug(`运行: ${path.basename(cli)} ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")}`);

      const proc = spawn(cli, args, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const line = data.toString();
        // 只收集非 CUDA 初始化的错误信息
        if (!line.includes("ggml_cuda_init") && 
            !line.includes("Device 0:") &&
            !line.includes("compute capability") &&
            !line.includes("VMM:")) {
          stderr += line;
        }
      });

      proc.on("close", (code: number | null) => {
        if (code !== 0) {
          reject(new Error(`CLI 退出码 ${code}: ${stderr || stdout}`));
          return;
        }
        resolve(stdout);
      });

      proc.on("error", (err) => {
        reject(new Error(`启动 CLI 失败: ${err.message}`));
      });
    });
  }

  async unloadModel(): Promise<void> {
    if (!this.modelLoaded) return;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.modelLoaded = false;
    this.lastUsedTime = 0;
    log.debug("✅ 视觉模型已卸载");
  }

  getStatus() {
    return {
      loaded: this.modelLoaded,
      lastUsed: this.lastUsedTime,
      idleTime: this.modelLoaded ? Date.now() - this.lastUsedTime : 0,
    };
  }

  private buildPrompt(request: ImageAnalysisRequest): string {
    const { taskType = "describe", prompt: customPrompt } = request;
    const prompts: Record<string, string> = {
      describe: "Describe this image in detail.",
      ocr: "Extract all text from this image. List each text element.",
      ui: "Analyze this UI screenshot. List all interactive elements with their labels.",
      code: "This is a code screenshot. Extract the code and explain what it does.",
      custom: customPrompt || "Describe this image.",
    };
    return prompts[taskType] || prompts.describe;
  }

  private startIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    this.idleTimer = setTimeout(() => {
      const idleTime = Date.now() - this.lastUsedTime;
      if (idleTime >= this.config.idleTimeoutMs) {
        log.debug(`视觉模型空闲 ${(idleTime / 1000 / 60).toFixed(1)} 分钟，自动卸载`);
        this.unloadModel();
      }
    }, this.config.idleTimeoutMs);
  }
}

let globalVisionEngine: VisionModelEngine | undefined;

export function getVisionModelEngine(config?: VisionModelConfig): VisionModelEngine {
  if (!globalVisionEngine) {
    globalVisionEngine = new VisionModelEngine(config);
  }
  return globalVisionEngine;
}

export async function resetVisionModelEngine(): Promise<void> {
  await globalVisionEngine?.unloadModel();
  globalVisionEngine = undefined;
}
