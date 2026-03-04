/**
 * 网关启动时自动启动NSEM认知核心记忆系统
 * 支持根据系统资源自动决策加载策略
 *
 * 使用 UnifiedSessionIngestionManager 与 Builtin Memory 共享事件驱动的会话摄入系统
 */

import { totalmem } from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { listAgentIds } from "../agents/agent-scope.js";
import type { NsemclawConfig } from "../config/config.js";
import { getNSEMFusionCore } from "../cognitive-core/NSEMFusionCore.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  getUnifiedSessionIngestionManager,
  type SessionConsumer,
  type SessionIngestionConfig,
} from "../memory/unified-session-ingestion.js";
import type { MemorySyncProgressUpdate } from "../memory/types.js";
import { registerCoreInstance, unregisterCoreInstance } from "../agents/tools/unified-cognitive-tool.js";
import { NSEM_PREDEFINED_MODELS, isModelValid, downloadFile } from "../cognitive-core/utils/model-downloader.js";

const log = createSubsystemLogger("cognitive-core");

const COGNITIVE_CORE_INSTANCES = new Map<string, ReturnType<typeof getNSEMFusionCore>>();
const SESSION_INGESTION_MANAGERS = new Map<string, ReturnType<typeof getUnifiedSessionIngestionManager>>();

/**
 * 检查并下载 NSEM 所需模型
 * 如果模型文件已存在则跳过，否则从 GitHub Release 下载
 */
async function ensureNSEMModels(
  log: { info?: (msg: string) => void; warn: (msg: string) => void },
): Promise<void> {
  log.info?.("📦 检查 NSEM 模型文件...");

  const modelsToCheck = [
    { key: "embedding", name: "Embedding 模型" },
    { key: "expansion", name: "Expansion 模型" },
    { key: "reranker", name: "Reranker 模型" },
  ] as const;

  for (const { key, name } of modelsToCheck) {
    const config = NSEM_PREDEFINED_MODELS[key];
    if (!config) {
      log.warn(`   ⚠️ 未知的模型配置: ${key}`);
      continue;
    }

    // 检查模型是否已存在且有效
    if (isModelValid(config.localPath, config.expectedSize)) {
      log.info?.(`   ✅ ${name} 已存在，跳过下载`);
      continue;
    }

    // 模型不存在或无效，需要下载
    log.info?.(`   ⬇️ ${name} 不存在或无效，开始下载...`);
    log.info?.(`      URL: ${config.url}`);
    log.info?.(`      目标: ${config.localPath}`);

    try {
      await downloadFile(config.url, config.localPath, (progress) => {
        if (progress.total > 0) {
          const percent = Math.round((progress.downloaded / progress.total) * 100);
          process.stdout.write(`      进度: ${percent}% (${(progress.downloaded / 1024 / 1024).toFixed(1)}MB / ${(progress.total / 1024 / 1024).toFixed(1)}MB)\r`);
        }
      });
      process.stdout.write("\n");
      log.info?.(`   ✅ ${name} 下载完成`);
    } catch (err) {
      log.warn(`   ❌ ${name} 下载失败: ${err instanceof Error ? err.message : String(err)}`);
      // 继续尝试其他模型，不中断整个启动流程
    }
  }

  log.info?.("📦 模型检查完成");
}

/** 系统内存配置 (MB) */
interface ResourceThreshold {
  max?: number;
  min?: number;
  models: string[];
  gpu: boolean;
}

/** 自动决策加载策略 */
function resolveAutoLoadingStrategy(cfg: NsemclawConfig, agentId: string): {
  resourceMode: "minimal" | "balanced" | "performance";
  models: string[];
} {
  const systemMemoryMB = Math.floor(totalmem() / 1024 / 1024);

  // 读取网关配置的阈值，或使用默认值
  const thresholds = cfg.gateway?.startup?.memoryThresholds as Record<string, ResourceThreshold> | undefined;

  const minimal = thresholds?.minimal ?? { max: 8192, models: ["embedding"], gpu: false };
  const balanced = thresholds?.balanced ?? { min: 8192, max: 32768, models: ["embedding", "reranker"], gpu: true };
  const performance = thresholds?.performance ?? { min: 32768, models: ["embedding", "expansion", "reranker"], gpu: true };

  // 根据内存自动决策
  if (systemMemoryMB < (minimal.max ?? 0)) {
    return { resourceMode: "minimal", models: minimal.models };
  } else if (systemMemoryMB < (balanced.max ?? Infinity)) {
    return { resourceMode: "balanced", models: balanced.models };
  } else {
    return { resourceMode: "performance", models: performance.models };
  }
}

/** 获取 NSEM 配置 */
function resolveNSEMConfig(cfg: NsemclawConfig, agentId: string) {
  const agentList = cfg.agents?.list as Array<{ id: string; nsem?: any }> | undefined;
  const agentConfig = agentList?.find((a) => a.id === agentId)?.nsem;
  const defaultConfig = (cfg.agents?.defaults as any)?.nsem;

  // 合并配置
  const config = {
    ...defaultConfig,
    ...agentConfig,
  };

  // 处理 auto 资源模式
  if (config?.resourceMode === "auto" || !config?.resourceMode) {
    const auto = resolveAutoLoadingStrategy(cfg, agentId);
    config.resourceMode = auto.resourceMode;
    // 如果用户未指定 models，使用自动决策的
    if (!config.models || config.models.length === 0) {
      config.models = auto.models;
    }
  }

  return config;
}

/**
 * 创建 NSEM 会话消费者
 */
function createNSEMConsumer(
  core: Awaited<ReturnType<typeof getNSEMFusionCore>>,
  agentId: string,
): SessionConsumer {
  return {
    name: `nsem-${agentId}`,

    async consumeDelta(filePath, delta) {
      if (delta.newMessages.length === 0) return;

      log.debug(`NSEM 摄入 ${delta.newMessages.length} 条消息从 ${path.basename(filePath)}`);

      for (const msg of delta.newMessages) {
        try {
          await core.ingest(msg.content, {
            type: msg.role === "user" ? "experience" : "insight",
            source: `session:${path.basename(filePath)}`,
            tags: ["conversation", msg.role, "auto-ingested"],
          });
        } catch (err) {
          log.warn(`NSEM 摄入消息失败: ${err}`);
        }
      }

      log.info(`已摄入 ${delta.newMessages.length} 条消息从 ${path.basename(filePath)}`);
    },

    async syncFull(progress?: (update: MemorySyncProgressUpdate) => void) {
      // 触发全量重新索引
      await core.evolve("all");
      progress?.({ completed: 1, total: 1, label: "Evolution complete" });
    },
  };
}

export async function startGatewayCognitiveCore(params: {
  cfg: NsemclawConfig;
  log: { info?: (msg: string) => void; warn: (msg: string) => void };
}): Promise<void> {
  const agentIds = listAgentIds(params.cfg);
  const systemMemoryGB = (totalmem() / 1024 / 1024 / 1024).toFixed(1);

  params.log.info?.(`🧠 NSEM认知核心自动启动策略 (系统内存: ${systemMemoryGB}GB)`);

  // 确保所有 NSEM 模型文件存在（如果不存在则自动下载）
  await ensureNSEMModels(params.log);

  for (const agentId of agentIds) {
    // 检查是否启用了记忆搜索
    const memoryConfig = resolveMemorySearchConfig(params.cfg, agentId);
    if (!memoryConfig?.enabled) {
      continue;
    }

    // 获取 NSEM 配置
    const nsemConfig = resolveNSEMConfig(params.cfg, agentId);

    // 检查 NSEM 是否被禁用
    if (nsemConfig?.enabled === false) {
      params.log.info?.(`   - agent "${agentId}": NSEM 已禁用，跳过`);
      continue;
    }

    const models = nsemConfig?.models ?? ["embedding"];
    const resourceMode = nsemConfig?.resourceMode ?? "balanced";

    params.log.info?.(`   - agent "${agentId}": 模式=${resourceMode}, 模型=[${models.join(", ")}]`);

    try {
      // 启动NSEM认知核心 (getNSEMFusionCore 内部已调用 initialize，无需再调用 start)
      const core = await getNSEMFusionCore(agentId, {
        storage: {
          mode: "fusion",
        },
        embedding: {
          provider: "smart",
          modelName: memoryConfig.model,
        },
        performance: {
          maxConcurrentOperations: 5,
          cacheSize: 1000,
          prefetchEnabled: false,
        },
      });
      
      // 注册到 UnifiedNSEM2Core 工具系统，使 AI 可以访问
      registerCoreInstance(agentId, core);
      params.log.info?.(`     ✅ NSEM 核心已注册到工具系统`);

      // 启动统一会话摄入（如果启用了对话摄入）
      if (nsemConfig?.ingestConversations !== false) {
        // 获取统一会话摄入管理器（与 Builtin Memory 共享）
        const sessionConfig: SessionIngestionConfig = {
          debounceMs: memoryConfig.sync?.watchDebounceMs ?? 5000,
          deltaBytes: memoryConfig.sync?.sessions?.deltaBytes ?? 4096,
          deltaMessages: memoryConfig.sync?.sessions?.deltaMessages ?? 3,
        };

        const ingestionManager = getUnifiedSessionIngestionManager(agentId, sessionConfig);

        // 注册 NSEM 消费者
        const consumer = createNSEMConsumer(core, agentId);
        const unregister = ingestionManager.registerConsumer(consumer);

        // 存储引用以便清理
        (core as any).sessionConsumerUnregister = unregister;

        // 启动摄入监听
        ingestionManager.start();
        SESSION_INGESTION_MANAGERS.set(agentId, ingestionManager);

        params.log.info?.(`     ✅ 统一会话摄入已启动 (与 Builtin Memory 共享事件系统)`);
      }

      // 同步记忆文件
      const workspaceDir = (params.cfg.agents?.defaults as any)?.workspace ?? process.cwd();
      const memoryFiles = ["MEMORY.md"];
      const memoryDir = path.join(workspaceDir, "memory");

      // 同步 MEMORY.md
      for (const fileName of memoryFiles) {
        const filePath = path.join(workspaceDir, fileName);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          await core.ingest(content, {
            type: "fact",
            source: filePath,
            tags: ["memory-file", fileName],
          });
          params.log.info?.(`     📄 已同步: ${fileName}`);
        } catch (e) {
          // 文件不存在是正常的，不报错
        }
      }

      // 同步 memory/*.md 文件
      try {
        const memoryFiles = await fs.readdir(memoryDir);
        for (const fileName of memoryFiles) {
          if (fileName.endsWith(".md")) {
            const filePath = path.join(memoryDir, fileName);
            try {
              const content = await fs.readFile(filePath, "utf-8");
              await core.ingest(content, {
                type: "fact",
                source: filePath,
                tags: ["memory-file", fileName],
              });
              params.log.info?.(`     📄 已同步: memory/${fileName}`);
            } catch (e) {
              params.log.warn(`     ⚠️  同步失败 memory/${fileName}: ${e}`);
            }
          }
        }
      } catch {
        // memory 目录不存在是正常的
      }

      COGNITIVE_CORE_INSTANCES.set(agentId, Promise.resolve(core));

      params.log.info?.(`     ✅ NSEM认知核心已启动`);

      const status = core.getStatus();
      params.log.info?.(`        记忆: ${status.storage.totalMemories}, 工作记忆: ${status.storage.workingCount}, 向量: ${status.storage.vectorCount}`);

    } catch (err) {
      params.log.warn(`     ⚠️  启动失败: ${String(err)}`);
    }
  }
}

export function getCognitiveCoreInstance(agentId: string): ReturnType<typeof getNSEMFusionCore> | undefined {
  return COGNITIVE_CORE_INSTANCES.get(agentId);
}

export function listCognitiveCoreInstances(): string[] {
  return Array.from(COGNITIVE_CORE_INSTANCES.keys());
}

/**
 * 停止所有NSEM认知核心实例
 */
export async function stopGatewayCognitiveCore(): Promise<void> {
  log.info("停止NSEM认知核心...");

  // 停止所有会话摄入管理器
  for (const [agentId, manager] of SESSION_INGESTION_MANAGERS) {
    manager.stop();
    log.debug(`已停止会话摄入管理器 (agent: ${agentId})`);
  }
  SESSION_INGESTION_MANAGERS.clear();

  // 停止所有NSEM认知核心
  for (const [agentId, corePromise] of COGNITIVE_CORE_INSTANCES) {
    try {
      const core = await corePromise;

      // 注销消费者
      const unregister = (core as any).sessionConsumerUnregister;
      if (unregister) {
        unregister();
      }
      
      // 从工具系统注销
      unregisterCoreInstance(agentId);

      await core.stop();
      log.debug(`已停止NSEM认知核心 (agent: ${agentId})`);
    } catch (err) {
      log.warn(`停止NSEM认知核心失败 (agent: ${agentId}): ${err}`);
    }
  }
  COGNITIVE_CORE_INSTANCES.clear();

  log.info("所有NSEM认知核心已停止");
}
