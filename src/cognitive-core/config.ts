/**
 * Cognitive Core 配置
 *
 * Zod schema 验证和配置加载
 * 支持自动注入 NSEM 默认配置
 */

import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { NsemclawConfig } from "../config/config.js";

// ============================================================================
// Zod Schema 定义
// ============================================================================

export const NSEM2UserConfigSchema = z.object({
  enabled: z.boolean().default(true),
  resourceMode: z.enum(["minimal", "balanced", "performance"]).default("balanced"),
  evolutionIntervalMinutes: z.number().min(1).max(1440).default(60),
  maxAtoms: z.number().min(1000).max(1000000).default(50000),
  ingestConversations: z.boolean().default(true),
  rerankerModel: z.string().optional(),
  expansionModel: z.string().optional(),
  /** 模型加载配置：指定加载哪些模型，空数组表示只加载 embedding */
  models: z.array(z.enum(["embedding", "expansion", "reranker"])).default(["embedding", "expansion", "reranker"]),
  /** 是否自动下载缺失的模型 */
  autoDownloadModels: z.boolean().default(true),
  compressionTrigger: z
    .object({
      atomCount: z.number().min(100).default(1000),
      ageDays: z.number().min(1).default(7),
      strengthThreshold: z.number().min(0).max(1).default(0.3),
    })
    .optional(),
});

export const CognitiveCoreConfigSchema = z.object({
  nsem: NSEM2UserConfigSchema.optional(),
});

// ============================================================================
// 类型导出
// ============================================================================

/** @deprecated 使用 NSEM2UserConfig */
export type NSEM2Config = z.infer<typeof NSEM2UserConfigSchema>;
export type NSEM2UserConfig = z.infer<typeof NSEM2UserConfigSchema>;
export type CognitiveCoreConfig = z.infer<typeof CognitiveCoreConfigSchema>;

// ============================================================================
// NSEM 默认配置常量
// ============================================================================

/** NSEM 模型缓存目录 */
export const NSEM_MODEL_CACHE_DIR = path.join(homedir(), ".nsemclaw", "models");

/** NSEM 预定义模型路径 (使用本地缓存的文件名) */
export const NSEM_MODELS = {
  embedding: {
    hfPath: "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf",
    localFile: "hf_ggml-org_embeddinggemma-300M-Q8_0.gguf",
  },
  expansion: {
    hfPath: "hf:tobil/qmd-query-expansion-1.7B-GGUF/qmd-query-expansion-1.7B-q4_k_m.gguf",
    localFile: "hf_tobil_qmd-query-expansion-1.7B-q4_k_m.gguf",
  },
  reranker: {
    url: "https://github.com/Alex-LILY/alex-lily-profile/releases/download/v1.0.0/bge-reranker-v2-m3-q4_k_m.gguf",
    localFile: "bge-reranker-v2-m3-q4_k_m.gguf",
  },
};

/** 完整的 NSEM 默认配置（用于自动注入） */
export const NSEM_COMPLETE_DEFAULTS = {
  memorySearch: {
    provider: "local" as const,
    local: {
      modelPath: NSEM_MODELS.embedding.hfPath,
      modelCacheDir: NSEM_MODEL_CACHE_DIR,
    },
  },
  compaction: {
    mode: "safeguard" as const,
  },
  maxConcurrent: 4,
  subagents: {
    maxConcurrent: 8,
  },
  nsem: {
    enabled: true,
    resourceMode: "balanced" as const,
    evolutionIntervalMinutes: 60,
    maxAtoms: 50000,
    ingestConversations: true,
    rerankerModel: path.join(NSEM_MODEL_CACHE_DIR, NSEM_MODELS.reranker.localFile),
    expansionModel: NSEM_MODELS.expansion.hfPath,
  },
};

// ============================================================================
// 配置加载函数
// ============================================================================

/**
 * 获取 NSEM 2.0 配置
 */
export function getNSEM2Config(cfg: NsemclawConfig, agentId: string): NSEM2UserConfig {
  // 尝试 agent 特定配置
  const agentConfig = (cfg.agents?.[agentId as keyof typeof cfg.agents] as { nsem?: unknown })
    ?.nsem;
  if (agentConfig) {
    return NSEM2UserConfigSchema.parse(agentConfig);
  }

  // 尝试默认配置
  const defaultConfig = (cfg.agents?.defaults as { nsem?: unknown })?.nsem;
  if (defaultConfig) {
    return NSEM2UserConfigSchema.parse(defaultConfig);
  }

  // 尝试旧版 evolution 配置 (向后兼容)
  const evolutionConfig = (cfg as any).evolution?.memory;
  if (evolutionConfig) {
    return NSEM2UserConfigSchema.parse({
      enabled: evolutionConfig.enabled,
      resourceMode: evolutionConfig.autoStart ? "balanced" : "minimal",
      evolutionIntervalMinutes: Math.floor((evolutionConfig.evolutionInterval || 86400000) / 60000),
      maxAtoms: evolutionConfig.maxAtoms,
    });
  }

  // 返回默认配置
  return NSEM2UserConfigSchema.parse({});
}

/**
 * 检查是否启用 NSEM
 */
export function isNSEMEnabled(cfg: NsemclawConfig, agentId: string): boolean {
  const config = getNSEM2Config(cfg, agentId);
  return config.enabled;
}

/**
 * 验证完整配置
 */
export function validateCognitiveCoreConfig(config: unknown): CognitiveCoreConfig {
  return CognitiveCoreConfigSchema.parse(config);
}

/**
 * 生成 NSEM 自动配置
 *
 * 当用户启用 NSEM 但未提供完整配置时，自动填充默认值
 */
export function generateNSEMAutoConfig(existingConfig?: Partial<NSEM2UserConfig>): NSEM2UserConfig {
  return NSEM2UserConfigSchema.parse({
    ...NSEM_COMPLETE_DEFAULTS.nsem,
    ...existingConfig,
  });
}

/**
 * 注入 NSEM 完整配置到 agents.defaults
 *
 * 用于系统启动时自动配置
 * 默认启用 NSEM（用户未明确禁用时）
 */
export function injectNSEMDefaults(cfg: NsemclawConfig): NsemclawConfig {
  // 检查用户是否明确禁用了 NSEM
  const userExplicitlyDisabled = (cfg.agents?.defaults as any)?.nsem?.enabled === false ||
    (cfg.agents?.list as any[])?.some((a) => a.nsem?.enabled === false);

  if (userExplicitlyDisabled) {
    return cfg;
  }

  const defaults = cfg.agents?.defaults || {};

  // 合并 memorySearch 配置
  const memorySearch = {
    ...NSEM_COMPLETE_DEFAULTS.memorySearch,
    ...(defaults.memorySearch || {}),
    local: {
      ...NSEM_COMPLETE_DEFAULTS.memorySearch.local,
      ...(defaults.memorySearch?.local || {}),
    },
  };

  // 合并 compaction 配置
  const compaction = {
    ...NSEM_COMPLETE_DEFAULTS.compaction,
    ...(defaults.compaction || {}),
  };

  // 合并 subagents 配置
  const subagents = {
    ...NSEM_COMPLETE_DEFAULTS.subagents,
    ...(defaults.subagents || {}),
  };

  // 合并 nsem 配置
  const existingNsem = (defaults as any).nsem || {};
  const nsem = {
    ...NSEM_COMPLETE_DEFAULTS.nsem,
    ...existingNsem,
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...defaults,
        memorySearch,
        compaction,
        maxConcurrent: defaults.maxConcurrent || NSEM_COMPLETE_DEFAULTS.maxConcurrent,
        subagents,
        // @ts-expect-error - nsem is an extended property
        nsem: nsem as unknown,
      },
    },
  };
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_NSEM2_USER_CONFIG: NSEM2UserConfig = {
  enabled: false,
  resourceMode: "balanced",
  evolutionIntervalMinutes: 60,
  maxAtoms: 50000,
  ingestConversations: true,
  models: ["embedding", "expansion", "reranker"],
  autoDownloadModels: true,
};

/** @deprecated 使用 DEFAULT_NSEM2_USER_CONFIG */
export const DEFAULT_NSEM2_CONFIG: NSEM2UserConfig = {
  enabled: false,
  resourceMode: "balanced",
  evolutionIntervalMinutes: 60,
  maxAtoms: 50000,
  ingestConversations: true,
  models: ["embedding", "expansion", "reranker"],
  autoDownloadModels: true,
};
