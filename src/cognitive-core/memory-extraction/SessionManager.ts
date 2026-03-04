/**
 * 会话管理器 (Session Manager)
 * 
 * 管理会话生命周期，收集消息和工具调用
 * 会话结束时自动触发记忆提取
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import type {
  Session,
  SessionMessage,
  ToolCallInfo,
  SessionEvent,
} from "./types.js";

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 最大消息数阈值 (默认 50) */
  maxMessages: number;
  /** 最大持续时间 ms (默认 30分钟) */
  maxDurationMs: number;
  /** 最小内容长度 (默认 100字符) */
  minContentLength: number;
  /** 空闲超时 ms (默认 5分钟) */
  idleTimeoutMs: number;
  /** 自动提取 (默认 true) */
  autoExtract: boolean;
}

/**
 * 会话统计
 */
export interface SessionStats {
  messageCount: number;
  toolCallCount: number;
  durationMs: number;
  totalContentLength: number;
}

/**
 * 输入消息
 */
export interface SessionMessageInput {
  role: SessionMessage["role"];
  content: string;
  parts?: SessionMessage["parts"];
  metadata?: Record<string, unknown>;
}

/**
 * 会话管理器
 * 
 * 对应 OpenViking 的会话管理逻辑
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private config: SessionConfig;
  private checkInterval?: NodeJS.Timeout;

  constructor(config: Partial<SessionConfig> = {}) {
    super();
    this.config = {
      maxMessages: 50,
      maxDurationMs: 30 * 60 * 1000, // 30分钟
      minContentLength: 100,
      idleTimeoutMs: 5 * 60 * 1000, // 5分钟
      autoExtract: true,
      ...config,
    };
    this.startIdleCheck();
  }

  /**
   * 开始新会话
   */
  startSession(
    userId: string,
    agentId: string,
    accountId: string = "default",
    metadata?: Record<string, unknown>
  ): Session {
    const session: Session = {
      id: randomUUID(),
      userId,
      agentId,
      accountId,
      messages: [],
      toolCalls: [],
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      metadata: metadata || {},
    };

    this.sessions.set(session.id, session);
    
    this.emit("sessionStarted", {
      type: "started",
      sessionId: session.id,
      timestamp: Date.now(),
      data: { userId, agentId, accountId },
    } as SessionEvent);

    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 记录消息
   */
  recordMessage(sessionId: string, input: SessionMessageInput): SessionMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.emit("error", { error: new Error(`Session not found: ${sessionId}`) });
      return null;
    }

    const message: SessionMessage = {
      id: randomUUID(),
      role: input.role,
      content: input.content,
      parts: input.parts || [],
      timestamp: Date.now(),
      metadata: input.metadata || {},
    };

    session.messages.push(message);
    session.lastActivityTime = Date.now();

    // 提取引用的资源/技能
    this.extractReferencedUris(session, message);

    this.emit("messageRecorded", {
      type: "message",
      sessionId,
      timestamp: Date.now(),
      data: { messageId: message.id, role: message.role },
    } as SessionEvent);

    // 检查是否达到提取阈值
    this.checkExtractionThresholds(session);

    return message;
  }

  /**
   * 记录工具调用
   */
  recordToolCall(sessionId: string, toolCall: Omit<ToolCallInfo, "id" | "timestamp">): ToolCallInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.emit("error", { error: new Error(`Session not found: ${sessionId}`) });
      return null;
    }

    const fullToolCall: ToolCallInfo = {
      ...toolCall,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    session.toolCalls.push(fullToolCall);
    session.lastActivityTime = Date.now();

    // 记录使用的技能
    if (fullToolCall.skillUri) {
      if (!session.metadata.usedSkills) {
        session.metadata.usedSkills = [];
      }
      if (!session.metadata.usedSkills.includes(fullToolCall.skillUri)) {
        session.metadata.usedSkills.push(fullToolCall.skillUri);
      }
    }

    this.emit("toolCallRecorded", {
      type: "tool_call",
      sessionId,
      timestamp: Date.now(),
      data: { 
        toolCallId: fullToolCall.id,
        toolName: fullToolCall.toolName,
        skillUri: fullToolCall.skillUri,
      },
    } as SessionEvent);

    return fullToolCall;
  }

  /**
   * 更新会话压缩摘要
   */
  updateCompressionSummary(sessionId: string, summary: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata.compressionSummary = summary;
      session.lastActivityTime = Date.now();
    }
  }

  /**
   * 结束会话
   * 
   * 触发记忆提取流程
   */
  async endSession(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // 检查是否满足最小提取条件
    if (!this.shouldExtract(session)) {
      this.sessions.delete(sessionId);
      return session;
    }

    this.emit("sessionEnding", {
      type: "ended",
      sessionId,
      timestamp: Date.now(),
      data: this.getSessionStats(session),
    } as SessionEvent);

    // 触发记忆提取
    if (this.config.autoExtract) {
      this.emit("extractMemories", session);
    }

    // 不移除会话，等待提取完成
    return session;
  }

  /**
   * 完成提取后清理会话
   */
  cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 获取会话统计
   */
  getSessionStats(session: Session): SessionStats {
    const totalContentLength = session.messages.reduce(
      (sum, m) => sum + m.content.length,
      0
    );

    return {
      messageCount: session.messages.length,
      toolCallCount: session.toolCalls.length,
      durationMs: Date.now() - session.startTime,
      totalContentLength,
    };
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.sessions.clear();
    this.removeAllListeners();
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 提取消息中引用的 URIs
   */
  private extractReferencedUris(session: Session, message: SessionMessage): void {
    if (!message.parts) return;

    for (const part of message.parts) {
      if (part.type === "context" && part.uri && part.contextType) {
        if (!session.metadata.usedResources) {
          session.metadata.usedResources = [];
        }
        const uri = part.uri;
        if (!session.metadata.usedResources.includes(uri)) {
          session.metadata.usedResources.push(uri);
        }
      }
    }
  }

  /**
   * 检查是否满足提取条件
   */
  private shouldExtract(session: Session): boolean {
    const stats = this.getSessionStats(session);
    
    // 检查消息数
    if (stats.messageCount < 2) return false;
    
    // 检查内容长度
    if (stats.totalContentLength < this.config.minContentLength) return false;
    
    return true;
  }

  /**
   * 检查提取阈值
   */
  private checkExtractionThresholds(session: Session): void {
    const stats = this.getSessionStats(session);

    // 消息数阈值
    if (stats.messageCount >= this.config.maxMessages) {
      this.emit("thresholdReached", {
        sessionId: session.id,
        reason: "max_messages",
        stats,
      });
      // 不自动结束，等待显式调用 endSession
    }

    // 持续时间阈值
    if (stats.durationMs >= this.config.maxDurationMs) {
      this.emit("thresholdReached", {
        sessionId: session.id,
        reason: "max_duration",
        stats,
      });
    }
  }

  /**
   * 启动空闲检查
   */
  private startIdleCheck(): void {
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [sessionId, session] of this.sessions) {
        const idleTime = now - session.lastActivityTime;
        
        if (idleTime >= this.config.idleTimeoutMs) {
          this.emit("idleTimeout", {
            sessionId,
            idleTime,
            session,
          });
          
          // 可选：自动结束空闲会话
          // this.endSession(sessionId);
        }
      }
    }, 60000); // 每分钟检查一次
  }
}

/**
 * 创建会话管理器
 */
export function createSessionManager(config?: Partial<SessionConfig>): SessionManager {
  return new SessionManager(config);
}
