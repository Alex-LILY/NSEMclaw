/**
 * 进化记忆系统配置
 *
 * 集成到Nsemclaw配置体系:
 * ~/.nsemclaw/config.json
 *
 * ```json
 * {
 *   "evolution": {
 *     "memory": {
 *       "enabled": true,
 *       "autoStart": true,
 *       "evolutionInterval": 86400000,
 *       "syncWithMarkdown": true,
 *       "maxMemoryAtoms": 100000
 *     }
 *   }
 * }
 * ```
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface EvolutionMemoryConfig {
  /** 是否启用进化记忆 */
  enabled: boolean;

  /** 是否自动启动 */
  autoStart: boolean;

  /** 自动进化间隔 (ms) */
  evolutionInterval: number;

  /** 是否与md/qmd文件同步 */
  syncWithMarkdown: boolean;

  /** 最大记忆原子数 */
  maxMemoryAtoms: number;

  /** 压缩配置 */
  compression: {
    enabled: boolean;
    triggerAtomCount: number;
    minAgeDays: number;
  };

  /** 查询配置 */
  query: {
    defaultStrategy: "precise" | "exploratory" | "creative" | "associative";
    maxDepth: number;
    activationThreshold: number;
  };

  /** 嵌入配置 */
  embedding: {
    dimension: number;
    useExternalAPI: boolean;
    externalModel?: string;
  };
}

export const DEFAULT_EVOLUTION_MEMORY_CONFIG: EvolutionMemoryConfig = {
  enabled: false,
  autoStart: false,
  evolutionInterval: 24 * 60 * 60 * 1000, // 1天
  syncWithMarkdown: true,
  maxMemoryAtoms: 100000,
  compression: {
    enabled: true,
    triggerAtomCount: 1000,
    minAgeDays: 7,
  },
  query: {
    defaultStrategy: "exploratory",
    maxDepth: 3,
    activationThreshold: 0.3,
  },
  embedding: {
    dimension: 384,
    useExternalAPI: false,
  },
};

let cachedConfig: EvolutionMemoryConfig | null = null;

export function loadEvolutionConfig(): EvolutionMemoryConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = join(homedir(), ".nsemclaw", "config.json");

  if (!existsSync(configPath)) {
    cachedConfig = DEFAULT_EVOLUTION_MEMORY_CONFIG;
    return cachedConfig as EvolutionMemoryConfig;
  }

  try {
    const userConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    cachedConfig = {
      ...DEFAULT_EVOLUTION_MEMORY_CONFIG,
      ...userConfig.evolution?.memory,
      compression: {
        ...DEFAULT_EVOLUTION_MEMORY_CONFIG.compression,
        ...userConfig.evolution?.memory?.compression,
      },
      query: {
        ...DEFAULT_EVOLUTION_MEMORY_CONFIG.query,
        ...userConfig.evolution?.memory?.query,
      },
      embedding: {
        ...DEFAULT_EVOLUTION_MEMORY_CONFIG.embedding,
        ...userConfig.evolution?.memory?.embedding,
      },
    };
  } catch {
    cachedConfig = DEFAULT_EVOLUTION_MEMORY_CONFIG;
  }

  return cachedConfig ?? DEFAULT_EVOLUTION_MEMORY_CONFIG;
}

export function resetEvolutionConfig(): void {
  cachedConfig = null;
}

export function isEvolutionMemoryEnabled(): boolean {
  return loadEvolutionConfig().enabled;
}

export function shouldAutoStartEvolution(): boolean {
  const config = loadEvolutionConfig();
  return config.enabled && config.autoStart;
}
