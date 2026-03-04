/**
 * Unified Core V2 搜索适配器
 *
 * 将 NSEMFusionCore 包装为 MemorySearchManager 接口
 * 使其可以无缝集成到现有 search-manager.ts
 */

import type {
  MemorySearchManager,
  MemorySearchResult,
  MemorySyncProgressUpdate,
} from "./types.js";
import type { NsemclawConfig } from "../config/config.js";
import type { ResolvedMemorySearchConfig } from "../agents/memory-search.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  createNSEMFusionCore,
  type NSEMFusionCore,
  type FusionCoreConfig,
} from "../cognitive-core/NSEMFusionCore.js";

const log = createSubsystemLogger("unified-core-v2-adapter");

/** @deprecated 使用 NSEMFusionCoreAdapterConfig 替代 */
export type UnifiedCoreV2AdapterConfig = NSEMFusionCoreAdapterConfig;

export interface NSEMFusionCoreAdapterConfig {
  /** 存储模式 */
  storageMode?: FusionCoreConfig["storage"]["mode"];
  /** 是否启用 8类提取 */
  enableExtraction?: boolean;
  /** 是否启用 SessionManager */
  enableSessionManager?: boolean;
  /** ThreeTier 工作记忆容量 */
  workingMemoryCapacity?: number;
}

/**
 * Unified Core V2 搜索适配器
 */
export class NSEMFusionCoreAdapter implements MemorySearchManager {
  private core: NSEMFusionCore;
  private config: NSEMFusionCoreAdapterConfig;
  private agentId: string;

  constructor(agentId: string, config: NSEMFusionCoreAdapterConfig = {}) {
    this.agentId = agentId;
    this.config = config;

    // 构建 NSEMFusionCore 配置
    const coreConfig: Partial<FusionCoreConfig> = {
      storage: {
        mode: config.storageMode ?? "three-tier",
        threeTier: {
          workingMemoryCapacity: config.workingMemoryCapacity ?? 15,
          autoTierTransition: true,
        },
      },
      extraction: {
        enabled: config.enableExtraction ?? true,
        autoExtract: config.enableSessionManager ?? true,
        sections: {
          user: true,
          agent: true,
          tool: false,
        },
        thresholds: {
          minMessages: 2,
          minContentLength: 100,
          importanceThreshold: 0.5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.85,
        },
      },
      session: {
        enabled: config.enableSessionManager ?? true,
        maxMessages: 50,
        maxDurationMs: 30 * 60 * 1000,
        idleTimeoutMs: 5 * 60 * 1000,
        autoExtractOnEnd: true,
      },
      retrieval: {
        mode: "tiered",
        weights: {
          dense: 0.4,
          sparse: 0.2,
          temporal: 0.15,
          importance: 0.15,
          hotness: 0.1,
        },
        tierWeights: {
          working: 1.0,
          shortTerm: 0.8,
          longTerm: 0.6,
        },
        reranking: {
          enabled: true,
          diversityBoost: 0.1,
          contextAwareness: 0.2,
        },
        intentAnalysis: {
          enabled: true,
          expandQueries: true,
        },
      },
    };

    this.core = createNSEMFusionCore({ agentId, ...coreConfig });
    log.info(`NSEMFusionCoreAdapter created (agent: ${agentId}, mode: ${coreConfig.storage?.mode})`);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await this.core.initialize();
    log.info(`NSEMFusionCoreAdapter initialized (agent: ${this.agentId})`);
  }

  /**
   * 搜索记忆
   */
  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string }
  ): Promise<MemorySearchResult[]> {
    const result = await this.core.retrieve(query, {
      maxResults: options?.maxResults ?? 10,
      minScore: options?.minScore ?? 0.35,
    });

    return result.items.map((item) => ({
      path: item.metadata.source || item.id,
      snippet: item.content.l1_overview.slice(0, 500),
      startLine: 1,
      endLine: 1,
      score: item.importance,
      timestamp: item.metadata.timestamp,
      source: "memory" as const,
    }));
  }

  /**
   * 读取文件
   */
  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    // 通过 ID 查找记忆
    const item = await this.core.access(params.relPath);

    if (!item) {
      return { text: "", path: params.relPath };
    }

    // content 是分层结构，使用 l1_overview 作为主要内容
    const contentText = typeof item.content === 'string' 
      ? item.content 
      : item.content.l1_overview ?? '';

    let content = contentText;

    // 应用行范围
    if (params.from !== undefined || params.lines !== undefined) {
      const lines = content.split("\n");
      const start = (params.from ?? 1) - 1;
      const end = params.lines !== undefined ? start + params.lines : lines.length;
      content = lines.slice(start, end).join("\n");
    }

    return { text: content, path: params.relPath };
  }

  /**
   * 获取状态
   */
  status() {
    const coreStatus = this.core.getStatus();

    return {
      provider: "unified-core-v2",
      backend: "unified-core-v2" as const,
      model: "n/a",
      custom: {
        ...coreStatus,
        config: this.config,
      },
    };
  }

  /**
   * 同步
   */
  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    // NSEMFusionCore 内部处理同步
    log.debug(`Sync called (reason: ${params?.reason ?? "unknown"})`);
  }

  /**
   * 摄入内容（用于记忆同步）
   */
  async ingest(content: string, embedding?: number[]): Promise<void> {
    await this.core.ingest(content, {
      type: "fact",
      source: "ingest",
    });
  }

  /**
   * 开始会话（用于 SessionManager 集成）
   */
  startSession(userId: string, metadata?: Record<string, unknown>): string {
    return this.core.startSession(userId, metadata);
  }

  /**
   * 记录消息
   */
  recordMessage(
    sessionId: string,
    message: { role: "user" | "assistant"; content: string }
  ): void {
    this.core.recordMessage(sessionId, message);
  }

  /**
   * 记录工具调用
   */
  recordToolCall(
    sessionId: string,
    toolCall: {
      toolName: string;
      input: Record<string, unknown>;
      output?: string;
      durationMs?: number;
    }
  ): void {
    this.core.recordToolCall(sessionId, toolCall);
  }

  /**
   * 结束会话（触发记忆提取）
   */
  async endSession(sessionId: string): Promise<void> {
    await this.core.endSession(sessionId);
  }

  /**
   * 检查嵌入可用性
   */
  async probeEmbeddingAvailability() {
    return { ok: true };
  }

  /**
   * 检查向量可用性
   */
  async probeVectorAvailability() {
    return true;
  }

  /**
   * 关闭
   */
  async close(): Promise<void> {
    await this.core.shutdown();
    log.info(`NSEMFusionCoreAdapter closed (agent: ${this.agentId})`);
  }
}

/**
 * 创建 NSEM Fusion Core 适配器
 */
export function createNSEMFusionCoreAdapter(
  agentId: string,
  config?: NSEMFusionCoreAdapterConfig
): NSEMFusionCoreAdapter {
  return new NSEMFusionCoreAdapter(agentId, config);
}

/**
 * @deprecated 使用 NSEMFusionCoreAdapter 替代
 */
export const UnifiedCoreV2Adapter = NSEMFusionCoreAdapter;

/**
 * @deprecated 使用 createNSEMFusionCoreAdapter 替代
 */
export const createUnifiedCoreV2Adapter = createNSEMFusionCoreAdapter;
