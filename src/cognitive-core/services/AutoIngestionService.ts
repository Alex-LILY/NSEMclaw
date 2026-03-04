/**
 * 自动摄入服务 - P2 功能
 *
 * 功能:
 * - 对话结束自动检测
 * - 内容提取与总结
 * - 重要信息识别
 * - 自动摄入到记忆系统
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { NSEMFusionCore } from "../NSEMFusionCore.js";
import type { MemoryScope, ContentType } from "../types/index.js";

/** 将通用 MemoryScope 转换为 NSEMFusionCore MemoryScope */
function toCoreMemoryScope(scope: MemoryScope): "personal" | "shared" | "inherited" | "all" {
  const scopeMap: Record<MemoryScope, "personal" | "shared" | "inherited" | "all"> = {
    local: "personal",
    shared: "shared",
    global: "all",
    personal: "personal",
  };
  return scopeMap[scope] ?? "personal";
}
import { generateId } from "../utils/common.js";

const log = createSubsystemLogger("auto-ingestion");

// ============================================================================
// 类型定义
// ============================================================================

/** 对话消息 */
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** 对话会话 */
export interface ConversationSession {
  id: string;
  messages: ConversationMessage[];
  startTime: number;
  endTime?: number;
  metadata: {
    agentId: string;
    workspace?: string;
    channel?: string;
    [key: string]: unknown;
  };
}

/** 自动摄入规则 */
export interface AutoIngestionRule {
  /** 规则ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 触发条件 */
  trigger: {
    /** 触发类型 */
    type: "conversation-end" | "time-interval" | "message-count" | "manual";
    /** 最小消息数 */
    minMessages?: number;
    /** 最小对话时长 (毫秒) */
    minDurationMs?: number;
    /** 消息数阈值 */
    messageCountThreshold?: number;
    /** 时间间隔 (毫秒) */
    intervalMs?: number;
  };
  /** 内容提取配置 */
  extraction: {
    /** 是否提取事实 */
    extractFacts: boolean;
    /** 是否提取洞察 */
    extractInsights: boolean;
    /** 是否总结 */
    summarize: boolean;
    /** 是否包含上下文 */
    includeContext: boolean;
    /** 上下文消息数 */
    contextMessageCount?: number;
  };
  /** 摄入策略 */
  ingestion: {
    /** 作用域 */
    scope: MemoryScope;
    /** 默认重要性 (0-1 或 'auto') */
    importance: number | "auto";
    /** 默认标签 */
    tags: string[];
    /** 是否去重 */
    deduplicate: boolean;
    /** 去重相似度阈值 */
    dedupThreshold?: number;
  };
  /** 是否启用 */
  enabled: boolean;
}

/** 提取的记忆项 */
export interface ExtractedMemory {
  content: string;
  type: ContentType;
  importance: number;
  tags: string[];
  source: {
    messageIds: string[];
    timestamp: number;
  };
}

/** 摄入结果 */
export interface IngestionResult {
  ruleId: string;
  sessionId: string;
  extracted: ExtractedMemory[];
  ingested: number;
  failed: number;
  durationMs: number;
}

// ============================================================================
// 默认规则
// ============================================================================

export const DEFAULT_AUTO_INGESTION_RULES: AutoIngestionRule[] = [
  {
    id: "default-conversation-end",
    name: "默认对话结束摄入",
    trigger: {
      type: "conversation-end",
      minMessages: 3,
      minDurationMs: 60000, // 1分钟
    },
    extraction: {
      extractFacts: true,
      extractInsights: true,
      summarize: true,
      includeContext: true,
      contextMessageCount: 5,
    },
    ingestion: {
      scope: "personal",
      importance: "auto",
      tags: ["auto-ingested", "conversation"],
      deduplicate: true,
      dedupThreshold: 0.85,
    },
    enabled: true,
  },
  {
    id: "important-messages",
    name: "重要消息实时摄入",
    trigger: {
      type: "message-count",
      messageCountThreshold: 1,
    },
    extraction: {
      extractFacts: true,
      extractInsights: false,
      summarize: false,
      includeContext: false,
    },
    ingestion: {
      scope: "personal",
      importance: 0.8, // 高重要性
      tags: ["auto-ingested", "important"],
      deduplicate: true,
      dedupThreshold: 0.9,
    },
    enabled: false, // 默认关闭，避免过于频繁
  },
];

// ============================================================================
// 自动摄入服务
// ============================================================================

export class AutoIngestionService {
  private core: NSEMFusionCore;
  private rules: Map<string, AutoIngestionRule> = new Map();
  private activeSessions: Map<string, ConversationSession> = new Map();
  private ingestionHistory: Map<string, IngestionResult[]> = new Map();
  private _isRunning = false;

  constructor(core: NSEMFusionCore) {
    this.core = core;

    // 加载默认规则
    for (const rule of DEFAULT_AUTO_INGESTION_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    log.info("Auto ingestion service started");
  }

  stop(): void {
    this._isRunning = false;
    log.info("Auto ingestion service stopped");
  }

  /**
   * 检查服务是否正在运行（测试兼容）
   */
  isRunning(): boolean {
    return this._isRunning;
  }

  // ========================================================================
  // 规则管理
  // ========================================================================

  addRule(rule: AutoIngestionRule): void {
    this.rules.set(rule.id, rule);
    log.info(`Added auto ingestion rule: ${rule.name} (${rule.id})`);
  }

  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      log.info(`Removed auto ingestion rule: ${ruleId}`);
    }
    return deleted;
  }

  updateRule(ruleId: string, updates: Partial<AutoIngestionRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    Object.assign(rule, updates);
    log.info(`Updated auto ingestion rule: ${ruleId}`);
    return true;
  }

  getRule(ruleId: string): AutoIngestionRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): AutoIngestionRule[] {
    return Array.from(this.rules.values());
  }

  enableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: true });
  }

  disableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: false });
  }

  // ========================================================================
  // 会话管理
  // ========================================================================

  startSession(sessionId: string, metadata: ConversationSession["metadata"]): void {
    if (this.activeSessions.has(sessionId)) {
      log.warn(`Session ${sessionId} already exists`);
      return;
    }

    const session: ConversationSession = {
      id: sessionId,
      messages: [],
      startTime: Date.now(),
      metadata,
    };

    this.activeSessions.set(sessionId, session);
    log.debug(`Started conversation session: ${sessionId}`);
  }

  addMessage(sessionId: string, message: Omit<ConversationMessage, "id" | "timestamp">): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      log.warn(`Session ${sessionId} not found`);
      return;
    }

    const fullMessage: ConversationMessage = {
      ...message,
      id: generateId("msg", message.content ?? Date.now().toString()),
      timestamp: Date.now(),
    };

    session.messages.push(fullMessage);

    // 检查是否需要实时摄入
    this.checkRealtimeIngestion(session, fullMessage);
  }

  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      log.warn(`Session ${sessionId} not found`);
      return;
    }

    session.endTime = Date.now();

    // 触发对话结束摄入
    this.processConversationEnd(session).catch((err) => {
      log.error(`Failed to process conversation end for ${sessionId}: ${err}`);
    });

    // 移除活跃会话
    this.activeSessions.delete(sessionId);
    log.debug(`Ended conversation session: ${sessionId}`);
  }

  getSession(sessionId: string): ConversationSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getActiveSessions(): ConversationSession[] {
    return Array.from(this.activeSessions.values());
  }

  // ========================================================================
  // 摄入处理
  // ========================================================================

  private async checkRealtimeIngestion(
    session: ConversationSession,
    message: ConversationMessage,
  ): Promise<void> {
    // 查找 message-count 类型的规则
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.trigger.type !== "message-count") continue;

      const threshold = rule.trigger.messageCountThreshold ?? 1;
      if (session.messages.length % threshold === 0) {
        // 提取并摄入
        const extracted = await this.extractFromMessages([message], rule);
        await this.ingestExtracted(extracted, rule, session.id);
      }
    }
  }

  private async processConversationEnd(session: ConversationSession): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.trigger.type !== "conversation-end") continue;

      // 检查触发条件
      const minMessages = rule.trigger.minMessages ?? 1;
      const minDuration = rule.trigger.minDurationMs ?? 0;
      const duration = (session.endTime ?? Date.now()) - session.startTime;

      if (session.messages.length < minMessages) {
        log.debug(
          `Skipping rule ${rule.id}: not enough messages (${session.messages.length} < ${minMessages})`,
        );
        continue;
      }

      if (duration < minDuration) {
        log.debug(
          `Skipping rule ${rule.id}: duration too short (${duration}ms < ${minDuration}ms)`,
        );
        continue;
      }

      // 执行摄入
      const result = await this.executeIngestion(session, rule);
      results.push(result);
    }

    // 保存历史
    this.ingestionHistory.set(session.id, results);

    return results;
  }

  private async executeIngestion(
    session: ConversationSession,
    rule: AutoIngestionRule,
  ): Promise<IngestionResult> {
    const startTime = Date.now();

    // 提取记忆
    const extracted = await this.extractFromSession(session, rule);

    // 摄入到核心
    const ingested = await this.ingestExtracted(extracted, rule, session.id);

    const durationMs = Date.now() - startTime;

    const result: IngestionResult = {
      ruleId: rule.id,
      sessionId: session.id,
      extracted,
      ingested: ingested.success,
      failed: ingested.failed,
      durationMs,
    };

    log.info(
      `Auto ingestion completed for session ${session.id} using rule ${rule.id}: ` +
        `${result.ingested} ingested, ${result.failed} failed in ${durationMs}ms`,
    );

    return result;
  }

  private async extractFromSession(
    session: ConversationSession,
    rule: AutoIngestionRule,
  ): Promise<ExtractedMemory[]> {
    const extracted: ExtractedMemory[] = [];
    const extraction = rule.extraction;

    // 获取要处理的消息
    let messages = session.messages;
    if (extraction.contextMessageCount && extraction.includeContext) {
      const startIdx = Math.max(0, messages.length - extraction.contextMessageCount);
      messages = messages.slice(startIdx);
    }

    // 提取事实
    if (extraction.extractFacts) {
      const facts = await this.extractFacts(messages, rule);
      extracted.push(...facts);
    }

    // 提取洞察
    if (extraction.extractInsights) {
      const insights = await this.extractInsights(messages, rule);
      extracted.push(...insights);
    }

    // 生成总结
    if (extraction.summarize) {
      const summary = await this.generateSummary(messages, rule);
      if (summary) {
        extracted.push(summary);
      }
    }

    return extracted;
  }

  private async extractFromMessages(
    messages: ConversationMessage[],
    rule: AutoIngestionRule,
  ): Promise<ExtractedMemory[]> {
    return this.extractFromSession(
      { id: "temp", messages, startTime: Date.now(), metadata: { agentId: "" } },
      rule,
    );
  }

  private async extractFacts(
    messages: ConversationMessage[],
    rule: AutoIngestionRule,
  ): Promise<ExtractedMemory[]> {
    const facts: ExtractedMemory[] = [];

    // 简单的启发式事实提取
    // 实际实现中可以使用LLM进行更精确的提取
    for (const message of messages) {
      const content = message.content;

      // 识别包含关键信息的消息
      const factPatterns = [
        /我的?(.+?)是(.+?)[。.]/,
        /(.+?)叫(.+?)[。.]/,
        /记住(.+?)[。.]/,
        /重要[的是](.+?)[。.]/,
      ];

      for (const pattern of factPatterns) {
        const match = content.match(pattern);
        if (match) {
          const factContent = match[0].trim();
          facts.push({
            content: factContent,
            type: "fact",
            importance: this.calculateImportance(factContent, rule),
            tags: [...rule.ingestion.tags, "fact"],
            source: {
              messageIds: [message.id],
              timestamp: message.timestamp,
            },
          });
        }
      }
    }

    return facts;
  }

  private async extractInsights(
    messages: ConversationMessage[],
    rule: AutoIngestionRule,
  ): Promise<ExtractedMemory[]> {
    const insights: ExtractedMemory[] = [];

    // 启发式洞察提取
    for (const message of messages) {
      const content = message.content;

      // 识别洞察模式
      const insightPatterns = [
        /发现(.+?)[。.]/,
        /意识[到](.+?)[。.]/,
        /明白(.+?)[。.]/,
        /(.+?)意味[着](.+?)[。.]/,
      ];

      for (const pattern of insightPatterns) {
        const match = content.match(pattern);
        if (match) {
          const insightContent = match[0].trim();
          insights.push({
            content: insightContent,
            type: "insight",
            importance: this.calculateImportance(insightContent, rule) * 1.2, // 洞察重要性更高
            tags: [...rule.ingestion.tags, "insight"],
            source: {
              messageIds: [message.id],
              timestamp: message.timestamp,
            },
          });
        }
      }
    }

    return insights;
  }

  private async generateSummary(
    messages: ConversationMessage[],
    rule: AutoIngestionRule,
  ): Promise<ExtractedMemory | null> {
    if (messages.length < 3) return null;

    // 简化版总结生成
    // 实际实现中可以使用LLM生成更好的总结
    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role === "assistant");

    if (userMessages.length === 0) return null;

    const summary =
      `对话总结: 用户提出了 ${userMessages.length} 个问题，助手提供了 ${assistantMessages.length} 个回答。` +
      `主要话题涉及: ${userMessages[0]?.content.slice(0, 50)}...`;

    return {
      content: summary,
      type: "narrative",
      importance: 0.6,
      tags: [...rule.ingestion.tags, "summary"],
      source: {
        messageIds: messages.map((m) => m.id),
        timestamp: Date.now(),
      },
    };
  }

  private async ingestExtracted(
    extracted: ExtractedMemory[],
    rule: AutoIngestionRule,
    sessionId: string,
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const memory of extracted) {
      try {
        // 检查去重
        if (rule.ingestion.deduplicate) {
          const isDuplicate = await this.checkDuplicate(memory, rule);
          if (isDuplicate) {
            log.debug(`Skipping duplicate memory: ${memory.content.slice(0, 50)}...`);
            continue;
          }
        }

        // 确定重要性
        const importance =
          rule.ingestion.importance === "auto" ? memory.importance : rule.ingestion.importance;

        // 摄入到核心
        const scopeValue = rule.ingestion.scope ?? "local";
        await this.core.ingest(memory.content, {
          type: memory.type,
          scope: toCoreMemoryScope(scopeValue),
          tags: memory.tags,
          strength: importance,
        });

        success++;
      } catch (err) {
        log.error(`Failed to ingest memory: ${memory.content.slice(0, 50)}...: ${err}`);
        failed++;
      }
    }

    return { success, failed };
  }

  private async checkDuplicate(memory: ExtractedMemory, rule: AutoIngestionRule): Promise<boolean> {
    // 使用核心检索检查相似内容
    const result = await this.core.activate(memory.content, {
      maxResults: 5,
      minScore: rule.ingestion.dedupThreshold ?? 0.85,
    });
    return (
      result.length > 0 &&
      (result[0].importance ?? 0) >= (rule.ingestion.dedupThreshold ?? 0.85)
    );
  }

  private calculateImportance(content: string, rule: AutoIngestionRule): number {
    let importance = 0.5;

    // 基于内容长度调整
    if (content.length > 100) importance += 0.1;
    if (content.length > 200) importance += 0.1;

    // 基于关键词调整
    const highImportanceKeywords = ["重要", "关键", "必须", "remember", "critical", "essential"];
    for (const keyword of highImportanceKeywords) {
      if (content.includes(keyword)) {
        importance += 0.1;
        break;
      }
    }

    return Math.min(1, importance);
  }

  // ========================================================================
  // 历史查询
  // ========================================================================

  getIngestionHistory(sessionId: string): IngestionResult[] | undefined {
    return this.ingestionHistory.get(sessionId);
  }

  getAllIngestionHistory(): Map<string, IngestionResult[]> {
    return new Map(this.ingestionHistory);
  }

  clearHistory(): void {
    this.ingestionHistory.clear();
    log.info("Cleared ingestion history");
  }

  // ========================================================================
  // 统计
  // ========================================================================

  getStats() {
    const history = Array.from(this.ingestionHistory.values()).flat();

    return {
      rules: {
        total: this.rules.size,
        enabled: Array.from(this.rules.values()).filter((r) => r.enabled).length,
      },
      sessions: {
        active: this.activeSessions.size,
        totalProcessed: this.ingestionHistory.size,
      },
      ingestion: {
        total: history.length,
        totalExtracted: history.reduce((sum, h) => sum + h.extracted.length, 0),
        totalIngested: history.reduce((sum, h) => sum + h.ingested, 0),
        avgDurationMs:
          history.length > 0
            ? history.reduce((sum, h) => sum + h.durationMs, 0) / history.length
            : 0,
      },
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createAutoIngestionService(core: NSEMFusionCore): AutoIngestionService {
  return new AutoIngestionService(core);
}
