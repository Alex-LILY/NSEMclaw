/**
 * NSEM 模型下载管理器
 *
 * 自动下载和管理本地模型文件
 */

import fs from "node:fs";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("nsem-model-downloader");

export interface ModelDownloadConfig {
  /** 模型名称 */
  name: string;
  /** 下载URL */
  url: string;
  /** 本地存储路径 */
  localPath: string;
  /** 文件大小（字节，用于验证） */
  expectedSize?: number;
  /** HuggingFace模型路径（hf:格式） */
  hfPath?: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

/**
 * 解析模型文件名从HuggingFace路径
 */
function parseHfModelPath(hfPath: string): { repo: string; file: string } | null {
  // 格式: hf:org/repo-name/file.gguf 或 hf:org/repo/file.gguf
  const match = hfPath.match(/^hf:([^/]+\/[^/]+)\/(.+)$/);
  if (!match) return null;
  return { repo: match[1], file: match[2] };
}

/**
 * 构建HuggingFace下载URL
 */
function buildHfUrl(repo: string, file: string): string {
  // 使用 HuggingFace 官方 CDN
  return `https://huggingface.co/${repo}/resolve/main/${file}`;
}

/**
 * 获取模型缓存目录
 */
export function getModelCacheDir(): string {
  const cacheDir = path.join(homedir(), ".nsemclaw", "models");
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

/**
 * 解析用户路径（支持 ~ 展开）
 */
function resolveUserPath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(homedir(), inputPath.slice(2));
  }
  return inputPath;
}

/**
 * 检查模型文件是否已存在且有效
 * 只要文件存在且大于 10MB 就认为是有效的（避免重新下载）
 */
export function isModelValid(localPath: string, expectedSize?: number): boolean {
  try {
    const resolvedPath = resolveUserPath(localPath);
    if (!existsSync(resolvedPath)) {
      return false;
    }

    const stats = fs.statSync(resolvedPath);
    // 最小有效大小：10MB（避免空文件或损坏文件）
    const MIN_VALID_SIZE = 10 * 1024 * 1024;
    if (stats.size < MIN_VALID_SIZE) {
      log.warn(`模型文件过小: ${resolvedPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
      return false;
    }

    // 如果指定了期望大小，允许 50% 的误差（不同量化版本）
    if (expectedSize) {
      const tolerance = expectedSize * 0.5;
      if (Math.abs(stats.size - expectedSize) > tolerance) {
        log.info(`模型文件大小与期望不符，但仍使用: ${resolvedPath} (实际: ${(stats.size / 1024 / 1024).toFixed(1)}MB, 期望: ${(expectedSize / 1024 / 1024).toFixed(1)}MB)`);
        // 返回 true，继续使用现有文件
        return true;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 下载文件（支持进度回调）
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  const resolvedDest = resolveUserPath(destPath);
  const dir = path.dirname(resolvedDest);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  log.info(`开始下载: ${url}`);
  log.info(`目标路径: ${resolvedDest}`);

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "nsemclaw/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }

  const total = parseInt(response.headers.get("content-length") || "0");
  let downloaded = 0;

  const body = response.body;
  if (!body) {
    throw new Error("响应体为空");
  }

  // 将 Web ReadableStream 转换为 Node.js Readable
  const reader = body.getReader();
  const fileStream = createWriteStream(resolvedDest);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      downloaded += value.length;
      fileStream.write(value);

      if (onProgress && total > 0) {
        onProgress({
          downloaded,
          total,
          percentage: Math.round((downloaded / total) * 100),
        });
      }
    }

    // 完成写入
    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => resolve());
      fileStream.on("error", reject);
    });

    log.info(`下载完成: ${resolvedDest}`);
  } catch (error) {
    fileStream.destroy();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * NSEM 预定义模型配置
 * 使用 GitHub Release 镜像加速下载 (tag: 123)
 */
const GITHUB_MODELS_BASE_URL = "https://github.com/Alex-LILY/alex-lily-profile/releases/download/123";

export const NSEM_PREDEFINED_MODELS: Record<string, ModelDownloadConfig> = {
  embedding: {
    name: "embeddinggemma-300M-Q8_0",
    hfPath: "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf",
    url: `${GITHUB_MODELS_BASE_URL}/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf`,
    localPath: path.join(getModelCacheDir(), "hf_ggml-org_embeddinggemma-300M-Q8_0.gguf"),
    expectedSize: 329_000_000, // ~314MB (实际文件大小)
  },
  expansion: {
    name: "qmd-query-expansion-1.7B-q4_k_m",
    hfPath: "hf:tobil/qmd-query-expansion-1.7B-GGUF/qmd-query-expansion-1.7B-q4_k_m.gguf",
    url: `${GITHUB_MODELS_BASE_URL}/hf_tobil_qmd-query-expansion-1.7B-q4_k_m.gguf`,
    localPath: path.join(getModelCacheDir(), "hf_tobil_qmd-query-expansion-1.7B-q4_k_m.gguf"),
    expectedSize: 1_258_000_000, // ~1.2GB (实际文件大小)
  },
  reranker: {
    name: "bge-reranker-v2-m3-q4_k_m",
    hfPath: "hf:ggml-org/bge-reranker-v2-m3-GGUF/bge-reranker-v2-m3-q4_k_m.gguf",
    url: `${GITHUB_MODELS_BASE_URL}/bge-reranker-v2-m3-q4_k_m.gguf`,
    localPath: path.join(getModelCacheDir(), "bge-reranker-v2-m3-q4_k_m.gguf"),
    expectedSize: 438_000_000, // ~438MB (实际文件大小)
  },
};

/**
 * 下载单个模型
 */
export async function downloadModel(
  config: ModelDownloadConfig,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  if (isModelValid(config.localPath, config.expectedSize)) {
    log.info(`模型已存在且有效: ${config.name}`);
    return resolveUserPath(config.localPath);
  }

  log.info(`开始下载模型: ${config.name}`);
  log.info(`来源: ${config.url}`);

  await downloadFile(config.url, config.localPath, onProgress);

  // 验证下载
  if (!isModelValid(config.localPath)) {
    throw new Error(`模型下载后验证失败: ${config.name}`);
  }

  return resolveUserPath(config.localPath);
}

/**
 * 下载所有NSEM所需模型
 */
export async function downloadAllNSEMModels(
  onModelProgress?: (modelName: string, progress: DownloadProgress) => void,
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const [key, config] of Object.entries(NSEM_PREDEFINED_MODELS)) {
    try {
      const localPath = await downloadModel(config, (progress) => {
        onModelProgress?.(config.name, progress);
      });
      results[key] = localPath;
    } catch (error) {
      log.error(`下载模型失败 ${config.name}: ${String(error)}`);
      throw error;
    }
  }

  return results;
}

/**
 * 获取模型本地路径（如果不存在则返回应下载的路径）
 */
export function getModelPath(modelType: keyof typeof NSEM_PREDEFINED_MODELS): string {
  const config = NSEM_PREDEFINED_MODELS[modelType];
  return resolveUserPath(config.localPath);
}

/**
 * 检查所有NSEM模型是否就绪
 */
export function areAllModelsReady(): boolean {
  return Object.entries(NSEM_PREDEFINED_MODELS).every(([key, config]) => {
    const ready = isModelValid(config.localPath, config.expectedSize);
    log.debug(`模型 ${key}: ${ready ? "就绪" : "缺失"}`);
    return ready;
  });
}

/**
 * 检查特定模型是否就绪
 */
export function isModelReady(modelType: keyof typeof NSEM_PREDEFINED_MODELS): boolean {
  const config = NSEM_PREDEFINED_MODELS[modelType];
  if (!config) {
    log.warn(`未知模型类型: ${modelType}`);
    return false;
  }
  return isModelValid(config.localPath, config.expectedSize);
}
