/**
 * 统一会话摄入管理器
 *
 * 将 Builtin Memory 和 NSEM 的会话摄入逻辑统一，提供：
 * 1. 单一事件源：基于 onSessionTranscriptUpdate 事件
 * 2. 增量同步：只读取新增内容，避免重复解析
 * 3. 多消费者支持：同时向 Builtin Memory 和 NSEM 分发更新
 */

import fs from "node:fs/promises";
import path from "node:path";
import { onSessionTranscriptUpdate } from "../sessions/transcript-events.js";
import { resolveSessionTranscriptsDirForAgent } from "../config/sessions/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { MemorySyncProgressUpdate } from "./types.js";

const log = createSubsystemLogger("unified-session");

/** 会话摄入配置 */
export interface SessionIngestionConfig {
  /** 防抖时间（毫秒） */
  debounceMs: number;
  /** 字节阈值，达到此值触发同步 */
  deltaBytes: number;
  /** 消息数阈值，达到此值触发同步 */
  deltaMessages: number;
}

/** 会话消费者接口 */
export interface SessionConsumer {
  /** 消费者名称 */
  readonly name: string;
  /** 消费会话增量 */
  consumeDelta(
    sessionFile: string,
    delta: {
      newContent: string;
      startOffset: number;
      endOffset: number;
      newMessages: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp?: number;
      }>;
    },
  ): Promise<void>;
  /** 全量同步（用于初始化或强制刷新） */
  syncFull?(progress?: (update: MemorySyncProgressUpdate) => void): Promise<void>;
}

/** 会话文件追踪状态 */
interface SessionFileState {
  lastSize: number;
  pendingBytes: number;
  pendingMessages: number;
  lastSyncTime: number;
}

/** 统一会话摄入管理器 */
export class UnifiedSessionIngestionManager {
  private agentId: string;
  private config: SessionIngestionConfig;
  private consumers: Map<string, SessionConsumer> = new Map();
  private fileStates: Map<string, SessionFileState> = new Map();
  private pendingFiles: Set<string> = new Set();
  private unsubscribe: (() => void) | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(agentId: string, config?: Partial<SessionIngestionConfig>) {
    this.agentId = agentId;
    this.config = {
      debounceMs: config?.debounceMs ?? 5000,
      deltaBytes: config?.deltaBytes ?? 4096,
      deltaMessages: config?.deltaMessages ?? 3,
    };
  }

  /**
   * 启动会话摄入监听
   */
  start(): void {
    if (this.unsubscribe || this.closed) {
      return;
    }

    log.info(`启动统一会话摄入管理器 (agent: ${this.agentId})`);

    this.unsubscribe = onSessionTranscriptUpdate((update) => {
      if (this.closed) return;

      const sessionFile = update.sessionFile;
      if (!this.isSessionFileForAgent(sessionFile)) {
        return;
      }

      this.pendingFiles.add(sessionFile);
      this.scheduleDebounce();
    });
  }

  /**
   * 停止会话摄入监听
   */
  stop(): void {
    this.closed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.pendingFiles.clear();
    log.info("停止统一会话摄入管理器");
  }

  /**
   * 注册消费者
   */
  registerConsumer(consumer: SessionConsumer): () => void {
    this.consumers.set(consumer.name, consumer);
    log.debug(`注册会话消费者: ${consumer.name}`);

    return () => {
      this.consumers.delete(consumer.name);
      log.debug(`注销会话消费者: ${consumer.name}`);
    };
  }

  /**
   * 触发全量同步（所有消费者）
   */
  async syncAll(progress?: (update: MemorySyncProgressUpdate) => void): Promise<void> {
    const consumers = Array.from(this.consumers.values()).filter((c) => c.syncFull);
    if (consumers.length === 0) return;

    log.info(`触发全量同步 for ${consumers.length} 个消费者`);

    for (const consumer of consumers) {
      try {
        await consumer.syncFull?.(progress);
      } catch (err) {
        log.warn(`消费者 ${consumer.name} 全量同步失败: ${err}`);
      }
    }
  }

  /**
   * 检查文件是否属于当前 agent
   */
  private isSessionFileForAgent(sessionFile: string): boolean {
    if (!sessionFile) return false;
    const sessionsDir = resolveSessionTranscriptsDirForAgent(this.agentId);
    const resolvedFile = path.resolve(sessionFile);
    const resolvedDir = path.resolve(sessionsDir);
    return resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
  }

  /**
   * 安排防抖处理
   */
  private scheduleDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.processPendingFiles().catch((err) => {
        log.warn(`处理 pending files 失败: ${err}`);
      });
    }, this.config.debounceMs);
  }

  /**
   * 处理待处理的文件
   */
  private async processPendingFiles(): Promise<void> {
    if (this.pendingFiles.size === 0) return;

    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();

    for (const filePath of files) {
      await this.processFile(filePath);
    }
  }

  /**
   * 处理单个文件
   */
  private async processFile(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats) {
        this.fileStates.delete(filePath);
        return;
      }

      const currentSize = stats.size;
      const state = this.fileStates.get(filePath);

      if (!state) {
        // 首次看到文件，初始化状态
        this.fileStates.set(filePath, {
          lastSize: currentSize,
          pendingBytes: 0,
          pendingMessages: 0,
          lastSyncTime: Date.now(),
        });
        return;
      }

      // 计算增量
      const deltaBytes = currentSize - state.lastSize;
      if (deltaBytes <= 0) {
        // 文件没有增长或缩小了，重置状态
        if (currentSize < state.lastSize) {
          state.lastSize = currentSize;
          state.pendingBytes = 0;
          state.pendingMessages = 0;
        }
        return;
      }

      // 读取新增内容
      const newContent = await this.readFileRange(filePath, state.lastSize, currentSize);
      if (!newContent) return;

      // 解析新增消息
      const newMessages = this.parseMessagesFromContent(newContent);

      // 更新状态
      state.pendingBytes += deltaBytes;
      state.pendingMessages += newMessages.length;

      // 检查是否达到同步阈值
      const bytesHit = state.pendingBytes >= this.config.deltaBytes;
      const messagesHit = state.pendingMessages >= this.config.deltaMessages;

      if (bytesHit || messagesHit) {
        // 分发到所有消费者
        await this.distributeToConsumers(filePath, {
          newContent,
          startOffset: state.lastSize,
          endOffset: currentSize,
          newMessages,
        });

        // 重置 pending 计数
        state.lastSize = currentSize;
        state.pendingBytes = 0;
        state.pendingMessages = 0;
        state.lastSyncTime = Date.now();
      }

      this.fileStates.set(filePath, state);
    } catch (err) {
      log.warn(`处理文件失败 ${filePath}: ${err}`);
    }
  }

  /**
   * 读取文件指定范围
   */
  private async readFileRange(
    filePath: string,
    start: number,
    end: number,
  ): Promise<string | null> {
    const handle = await fs.open(filePath, "r").catch(() => null);
    if (!handle) return null;

    try {
      const length = end - start;
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      if (bytesRead <= 0) return null;
      return buffer.slice(0, bytesRead).toString("utf-8");
    } finally {
      await handle.close();
    }
  }

  /**
   * 从内容中解析消息
   */
  private parseMessagesFromContent(content: string): Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: number;
  }> {
    const messages: Array<{
      role: "user" | "assistant";
      content: string;
      timestamp?: number;
    }> = [];

    const lines = content.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.type !== "message" || !record.message) continue;

        const { role, content: msgContent, timestamp } = record.message;
        if (role !== "user" && role !== "assistant") continue;

        const text = this.extractTextFromContent(msgContent);
        if (!text || text.length < 10) continue;

        messages.push({
          role,
          content: text,
          timestamp,
        });
      } catch {
        // 忽略解析错误
      }
    }

    return messages;
  }

  /**
   * 从消息内容中提取文本
   */
  private extractTextFromContent(content: unknown): string | null {
    if (typeof content === "string") {
      return this.normalizeText(content);
    }

    if (!Array.isArray(content)) return null;

    const parts: string[] = [];
    for (const block of content) {
      if (block?.type === "text" && typeof block.text === "string") {
        const normalized = this.normalizeText(block.text);
        if (normalized) parts.push(normalized);
      }
    }

    return parts.length > 0 ? parts.join(" ") : null;
  }

  /**
   * 规范化文本
   */
  private normalizeText(text: string): string | null {
    const normalized = text
      .replace(/\s*\n+\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized || null;
  }

  /**
   * 分发到所有消费者
   */
  private async distributeToConsumers(
    filePath: string,
    delta: {
      newContent: string;
      startOffset: number;
      endOffset: number;
      newMessages: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp?: number;
      }>;
    },
  ): Promise<void> {
    if (this.consumers.size === 0) return;

    log.debug(`分发增量到 ${this.consumers.size} 个消费者: ${path.basename(filePath)}`);

    for (const consumer of this.consumers.values()) {
      try {
        await consumer.consumeDelta(filePath, delta);
      } catch (err) {
        log.warn(`消费者 ${consumer.name} 处理失败: ${err}`);
      }
    }
  }
}

/** 全局管理器缓存 */
const MANAGER_CACHE = new Map<string, UnifiedSessionIngestionManager>();

/**
 * 获取或创建统一会话摄入管理器
 */
export function getUnifiedSessionIngestionManager(
  agentId: string,
  config?: Partial<SessionIngestionConfig>,
): UnifiedSessionIngestionManager {
  const key = `${agentId}:${JSON.stringify(config)}`;
  let manager = MANAGER_CACHE.get(key);
  if (!manager) {
    manager = new UnifiedSessionIngestionManager(agentId, config);
    MANAGER_CACHE.set(key, manager);
  }
  return manager;
}

/**
 * 清理管理器缓存
 */
export function clearUnifiedSessionIngestionCache(): void {
  for (const manager of MANAGER_CACHE.values()) {
    manager.stop();
  }
  MANAGER_CACHE.clear();
}
