/**
 * 本地模型管理 CLI
 * 
 * 下载和管理本地运行的 GGUF 模型
 */

import type { Command } from "commander";
import { theme } from "../terminal/theme.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  NSEM_PREDEFINED_MODELS,
  downloadFile,
  isModelValid,
  getModelCacheDir,
} from "../cognitive-core/utils/model-downloader.js";
import { existsSync } from "node:fs";
import { statSync } from "node:fs";

const log = createSubsystemLogger("local-model-cli");

interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

function formatBytes(bytes: number): string {
  const sizes = ["B", "KB", "MB", "GB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

async function downloadWithProgress(modelKey: string) {
  const config = NSEM_PREDEFINED_MODELS[modelKey];
  if (!config) {
    throw new Error(`未知模型: ${modelKey}`);
  }

  // 检查是否已存在
  if (isModelValid(config.localPath, config.expectedSize)) {
    const stats = statSync(config.localPath);
    log.info(`✅ 模型已存在: ${config.name} (${formatBytes(stats.size)})`);
    log.info(`   路径: ${config.localPath}`);
    return;
  }

  log.info(`📥 下载模型: ${config.name}`);
  log.info(`   来源: ${config.url}`);
  log.info(`   目标: ${config.localPath}`);
  if (config.expectedSize) {
    log.info(`   预计大小: ${formatBytes(config.expectedSize)}`);
  }

  let lastProgress = 0;
  await downloadFile(config.url, config.localPath, (progress: DownloadProgress) => {
    if (progress.percentage - lastProgress >= 5) {
      log.info(`   进度: ${progress.percentage}% (${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)})`);
      lastProgress = progress.percentage;
    }
  });

  log.info(`✅ 下载完成: ${config.name}`);
}

export function registerLocalModelCli(program: Command) {
  const localModel = program
    .command("local-model")
    .alias("lm")
    .description("管理本地运行的 GGUF 模型 (embedding, reranker, vision, decision 等)");

  localModel
    .command("list")
    .description("列出所有可用的预定义模型及其状态")
    .action(() => {
      log.info("可用本地模型:");
      log.info("");

      for (const [key, config] of Object.entries(NSEM_PREDEFINED_MODELS)) {
        const exists = existsSync(config.localPath);
        const size = exists ? formatBytes(statSync(config.localPath).size) : "未下载";
        const status = exists ? theme.success("✅ 已安装") : theme.error("❌ 未安装");

        log.info(`${theme.accent(key)}: ${config.name}`);
        log.info(`   状态: ${status} (${size})`);
        log.info(`   路径: ${config.localPath}`);
        log.info("");
      }
    });

  localModel
    .command("download")
    .alias("dl")
    .description("下载指定的本地模型")
    .argument("<model>", "模型名称 (embedding|expansion|reranker|decision|vision|mmproj|all)")
    .option("--progress", "显示下载进度", true)
    .action(async (model: string, opts) => {
      try {
        if (model === "all") {
          for (const key of Object.keys(NSEM_PREDEFINED_MODELS)) {
            await downloadWithProgress(key);
          }
        } else if (NSEM_PREDEFINED_MODELS[model]) {
          await downloadWithProgress(model);
        } else {
          log.error(`未知模型: ${model}`);
          log.info(`可用模型: ${Object.keys(NSEM_PREDEFINED_MODELS).join(", ")}, all`);
          process.exit(1);
        }
      } catch (err) {
        log.error(`下载失败: ${err}`);
        process.exit(1);
      }
    });

  localModel
    .command("status")
    .description("检查所有本地模型的状态")
    .action(() => {
      const cacheDir = getModelCacheDir();
      let totalSize = 0;
      let installedCount = 0;

      log.info(`模型缓存目录: ${cacheDir}`);
      log.info("");

      for (const [key, config] of Object.entries(NSEM_PREDEFINED_MODELS)) {
        const exists = existsSync(config.localPath);
        if (exists) {
          const size = statSync(config.localPath).size;
          totalSize += size;
          installedCount++;
          log.info(`✅ ${key}: ${formatBytes(size)}`);
        } else {
          log.info(`❌ ${key}: 未安装`);
        }
      }

      log.info("");
      log.info(`总计: ${installedCount}/${Object.keys(NSEM_PREDEFINED_MODELS).length} 个模型，占用空间 ${formatBytes(totalSize)}`);
    });

  localModel
    .command("vision")
    .description("一键下载视觉模型套件 (vision + mmproj)")
    .action(async () => {
      try {
        log.info("📥 下载视觉模型套件...");
        await downloadWithProgress("vision");
        await downloadWithProgress("mmproj");
        log.info("✅ 视觉模型套件下载完成");
        log.info("");
        log.info("使用方式:");
        log.info("  1. 通过 MCP Tool: analyze_image");
        log.info("  2. 通过代码: const engine = getVisionModelEngine();");
        log.info("  3. 自动按需加载，空闲5分钟后自动卸载");
      } catch (err) {
        log.error(`下载失败: ${err}`);
        process.exit(1);
      }
    });
}
