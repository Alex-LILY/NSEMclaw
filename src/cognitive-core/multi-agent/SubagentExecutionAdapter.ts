/**
 * 子代理执行适配器 - 将 NSEM 多智能体协作与现有子代理系统集成
 *
 * 功能:
 * - 调用 sessions-spawn-tool 创建真实子代理 (支持 run/session 模式)
 * - 支持子代理间直接通信 (sessions_send)
 * - 子代理生命周期管理 (关闭、删除)
 * - 监听子代理执行结果
 * - 支持记忆继承
 * - 集成断路器和重试逻辑
 */

import { spawnSubagentDirect, type SpawnSubagentParams, type SpawnSubagentResult, type SpawnSubagentContext, type SpawnSubagentMode } from "../../agents/subagent-spawn.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { CollaborationTask, TaskResult } from "./MultiAgentCollaboration.js";
import type { ResilientSubagentOrchestrator } from "./ResilientSubagentOrchestrator.js";
import { generateId } from "../utils/common.js";
import { callGateway } from "../../gateway/call.js";
import { listSubagentRunsForRequester, type SubagentRunRecord } from "../../agents/subagent-registry.js";
import { loadConfig } from "../../config/config.js";
import { loadSessionStore } from "../../config/sessions.js";

const log = createSubsystemLogger("subagent-adapter");

/** 子代理执行模式 */
export type SubagentExecutionMode = SpawnSubagentMode;

/** 子代理会话信息 */
export interface SubagentSessionInfo {
  /** 子代理ID */
  subagentId: string;
  /** 会话键 */
  sessionKey: string;
  /** 运行ID */
  runId: string;
  /** 执行模式 */
  mode: SubagentExecutionMode;
  /** 标签 */
  label?: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动时间 */
  lastActiveAt: number;
  /** 是否活跃 */
  isActive: boolean;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/** 子代理执行选项 */
export interface SubagentExecutionOptions {
  /** 父 Agent ID (用于记忆继承) */
  parentAgentId?: string;
  /** 记忆继承策略 */
  memoryInheritanceStrategy?: "full" | "filtered" | "summarized" | "referenced" | "none";
  /** 最小继承重要性 */
  minInheritedImportance?: number;
  /** 模型覆盖 */
  model?: string;
  /** 思考模式 */
  thinking?: string;
  /** 超时秒数 */
  timeoutSeconds?: number;
  /** 清理模式 */
  cleanup?: "delete" | "keep";
  /** 执行模式: run=单次, session=持久 */
  mode?: SubagentExecutionMode;
  /** 是否绑定到线程 (session 模式需要) */
  thread?: boolean;
  /** 是否期待完成消息 */
  expectsCompletionMessage?: boolean;
}

/** 执行上下文 */
export interface ExecutionContext {
  /** 会话键 */
  sessionKey: string;
  /** 请求者信息 */
  requester?: {
    agentSessionKey?: string;
    agentChannel?: string;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
  };
}

/** 发送消息选项 */
export interface SendMessageOptions {
  /** 消息内容 */
  message: string;
  /** 超时秒数 (0=异步发送不等待) */
  timeoutSeconds?: number;
  /** 是否等待回复 */
  waitForReply?: boolean;
}

/**
 * 子代理执行适配器
 */
export class SubagentExecutionAdapter {
  private orchestrator?: ResilientSubagentOrchestrator;
  private activeExecutions = new Map<string, AbortController>();
  /** 子代理会话映射 (subagentId -> SubagentSessionInfo) */
  private subagentSessions = new Map<string, SubagentSessionInfo>();
  /** 子代理会话映射 (sessionKey -> subagentId) */
  private sessionKeyToSubagentId = new Map<string, string>();

  constructor(orchestrator?: ResilientSubagentOrchestrator) {
    this.orchestrator = orchestrator;
  }

  // ========================================================================
  // 子代理生命周期管理
  // ========================================================================

  /**
   * 创建子代理 (session 模式 - 长时间运行)
   * @returns 子代理会话信息
   */
  async createSubagent(
    subagentId: string,
    task: string,
    context: ExecutionContext,
    options: SubagentExecutionOptions = {},
  ): Promise<SubagentSessionInfo> {
    const executionId = generateId("exec", Date.now().toString());
    const startTime = Date.now();

    const mode = options.mode ?? "session";
    const taskPreview = task.length > 80 ? `${task.slice(0, 80)}...` : task;
    log.info(`[Subagent] 🆕 创建子代理: ${subagentId} (模式: ${mode})`);
    log.info(`[Subagent] 📝 任务: "${taskPreview}"`);
    if (options.model) {
      log.info(`[Subagent] 🤖 模型: ${options.model}`);
    }

    // 构建子代理参数 - 默认使用 session 模式以支持长时间运行和通信
    const spawnParams: SpawnSubagentParams = {
      task,
      label: subagentId,
      agentId: subagentId,
      model: options.model,
      thinking: options.thinking,
      runTimeoutSeconds: options.timeoutSeconds ?? 300,
      mode: options.mode ?? "session", // 默认 session 模式支持长时间运行
      thread: options.thread ?? true, // session 模式需要 thread
      cleanup: options.cleanup ?? "keep", // session 模式默认 keep
      expectsCompletionMessage: options.expectsCompletionMessage ?? false, // session 模式不期待完成消息
    };

    // 构建上下文
    const spawnContext: SpawnSubagentContext = {
      agentSessionKey: context.requester?.agentSessionKey ?? context.sessionKey,
      agentChannel: context.requester?.agentChannel,
      agentAccountId: context.requester?.agentAccountId,
      agentTo: context.requester?.agentTo,
      agentThreadId: context.requester?.agentThreadId,
    };

    // 调用子代理系统创建
    const result = await spawnSubagentDirect(spawnParams, spawnContext);

    if (result.status !== "accepted" || !result.childSessionKey) {
      throw new Error(`创建子代理失败: ${result.error ?? "未知错误"}`);
    }

    // 保存子代理会话信息
    const sessionInfo: SubagentSessionInfo = {
      subagentId,
      sessionKey: result.childSessionKey,
      runId: result.runId ?? executionId,
      mode: result.mode ?? "session",
      label: subagentId,
      createdAt: startTime,
      lastActiveAt: startTime,
      isActive: true,
      metadata: {
        model: options.model,
        thinking: options.thinking,
        parentSessionKey: context.sessionKey,
        spawnResult: result,
      },
    };

    this.subagentSessions.set(subagentId, sessionInfo);
    this.sessionKeyToSubagentId.set(result.childSessionKey, subagentId);

    const duration = Date.now() - startTime;
    log.info(`[Subagent] ✅ 子代理创建成功: ${subagentId}`);
    log.info(`[Subagent]    会话: ${result.childSessionKey}`);
    log.info(`[Subagent]    RunId: ${result.runId ?? executionId}`);
    log.info(`[Subagent]    耗时: ${duration}ms`);

    return sessionInfo;
  }

  /**
   * 执行协作任务 - 支持 run 和 session 模式
   */
  async executeTask(
    task: CollaborationTask,
    subagentId: string,
    context: ExecutionContext,
    options: SubagentExecutionOptions = {},
  ): Promise<TaskResult> {
    const mode = options.mode ?? "run";

    // session 模式: 先创建子代理，然后发送任务
    if (mode === "session") {
      // 检查是否已有活跃会话
      let sessionInfo = this.getSubagentSession(subagentId);
      
      if (!sessionInfo || !sessionInfo.isActive) {
        // 创建新的子代理会话
        sessionInfo = await this.createSubagent(
          subagentId,
          task.content,
          context,
          options,
        );
      }

      // 发送任务消息给子代理
      const sendResult = await this.sendMessageToSubagent(
        subagentId,
        {
          message: task.content,
          timeoutSeconds: options.timeoutSeconds ?? 300,
          waitForReply: true,
        },
      );

      return {
        content: sendResult.response ?? "任务已发送",
        qualityScore: sendResult.success ? 0.85 : 0.3,
        confidence: sendResult.success ? 0.9 : 0.4,
        executionTimeMs: sendResult.executionTimeMs ?? 0,
        metadata: {
          subagentId,
          sessionKey: sessionInfo.sessionKey,
          runId: sessionInfo.runId,
          mode: "session",
          sendResult,
        },
      };
    }

    // run 模式: 单次执行
    return this.executeRunMode(task, subagentId, context, options);
  }

  /**
   * 发送消息给子代理 (支持子代理间通信)
   * @param targetSubagentId 目标子代理ID
   * @param options 消息选项
   * @returns 发送结果
   */
  async sendMessageToSubagent(
    targetSubagentId: string,
    options: SendMessageOptions,
  ): Promise<{
    success: boolean;
    response?: string;
    error?: string;
    executionTimeMs?: number;
  }> {
    const sessionInfo = this.getSubagentSession(targetSubagentId);
    if (!sessionInfo) {
      log.warn(`[Subagent] 发送失败: 子代理 ${targetSubagentId} 不存在`);
      return { success: false, error: `子代理 ${targetSubagentId} 不存在` };
    }

    if (!sessionInfo.isActive) {
      log.warn(`[Subagent] 发送失败: 子代理 ${targetSubagentId} 已关闭`);
      return { success: false, error: `子代理 ${targetSubagentId} 已关闭` };
    }

    const startTime = Date.now();
    const timeoutSeconds = options.timeoutSeconds ?? 30;
    const timeoutMs = timeoutSeconds * 1000;

    const messagePreview = options.message.length > 60 ? `${options.message.slice(0, 60)}...` : options.message;
    const waitMode = options.waitForReply ? `等待回复 (${timeoutSeconds}s)` : "异步发送";
    
    try {
      log.info(`[Subagent] 📤 -> ${targetSubagentId} [${waitMode}]: "${messagePreview}"`);
      log.debug(`[Subagent] 目标会话: ${sessionInfo.sessionKey}, 模式: ${sessionInfo.mode}`);

      // 使用 agent.wait 等待回复
      const response = await callGateway<{ runId: string }>({
        method: "agent",
        params: {
          message: options.message,
          sessionKey: sessionInfo.sessionKey,
          timeoutMs,
          deliver: false,
        },
        timeoutMs: timeoutMs + 5000,
      });

      // 更新最后活动时间
      sessionInfo.lastActiveAt = Date.now();

      if (options.waitForReply && timeoutSeconds > 0) {
        log.debug(`[Subagent] ⏳ 等待 ${targetSubagentId} 回复 (runId: ${response?.runId})...`);
        
        // 等待执行完成并获取结果
        const waitResult = await callGateway<{ status?: string; error?: string }>({
          method: "agent.wait",
          params: {
            runId: response?.runId,
            timeoutMs,
          },
          timeoutMs: timeoutMs + 2000,
        });

        if (waitResult?.status === "error") {
          log.warn(`[Subagent] ❌ ${targetSubagentId} 执行失败: ${waitResult.error}`);
          return {
            success: false,
            error: waitResult.error ?? "执行失败",
            executionTimeMs: Date.now() - startTime,
          };
        }

        // 获取历史记录中的回复
        log.debug(`[Subagent] 📥 获取 ${targetSubagentId} 回复...`);
        const history = await callGateway<{ messages: Array<{ role: string; content: string }> }>({
          method: "chat.history",
          params: { sessionKey: sessionInfo.sessionKey, limit: 10 },
        });

        const lastAssistantMessage = history?.messages
          ?.reverse()
          .find(m => m.role === "assistant");

        const responsePreview = lastAssistantMessage?.content 
          ? `"${lastAssistantMessage.content.slice(0, 60)}..."` 
          : "(无内容)";
        const duration = Date.now() - startTime;
        log.info(`[Subagent] ✅ <- ${targetSubagentId} 回复 (${duration}ms): ${responsePreview}`);

        return {
          success: true,
          response: lastAssistantMessage?.content ?? "已执行",
          executionTimeMs: duration,
        };
      }

      // 异步发送，不等待回复
      log.debug(`[Subagent] ✅ 异步消息已发送给 ${targetSubagentId}`);
      return {
        success: true,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`发送消息给子代理 ${targetSubagentId} 失败: ${err.message}`);
      return {
        success: false,
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 子代理间通信 - 从源子代理发送消息到目标子代理
   * @param sourceSubagentId 源子代理ID
   * @param targetSubagentId 目标子代理ID
   * @param message 消息内容
   */
  async agentToAgentCommunication(
    sourceSubagentId: string,
    targetSubagentId: string,
    message: string,
  ): Promise<{ success: boolean; error?: string }> {
    // 验证源子代理存在且活跃
    const sourceSession = this.getSubagentSession(sourceSubagentId);
    if (!sourceSession) {
      log.warn(`[A2A] 源子代理 ${sourceSubagentId} 不存在，无法发送消息给 ${targetSubagentId}`);
      return { success: false, error: `源子代理 ${sourceSubagentId} 不存在` };
    }

    // 验证目标子代理存在且活跃
    const targetSession = this.getSubagentSession(targetSubagentId);
    if (!targetSession) {
      log.warn(`[A2A] 目标子代理 ${targetSubagentId} 不存在，无法接收来自 ${sourceSubagentId} 的消息`);
      return { success: false, error: `目标子代理 ${targetSubagentId} 不存在` };
    }

    if (!targetSession.isActive) {
      log.warn(`[A2A] 目标子代理 ${targetSubagentId} 已关闭，无法接收消息`);
      return { success: false, error: `目标子代理 ${targetSubagentId} 已关闭` };
    }

    // 记录 A2A 通信日志 (带消息预览)
    const messagePreview = message.length > 80 ? `${message.slice(0, 80)}...` : message;
    log.info(`[A2A] 📨 ${sourceSubagentId} -> ${targetSubagentId}: "${messagePreview}"`);
    log.debug(`[A2A] 完整消息内容 (${message.length} 字符): ${message.slice(0, 200)}...`);

    // 构造带上下文的消息
    const enrichedMessage = `[来自 ${sourceSubagentId}] ${message}`;

    // 发送给目标子代理
    const startTime = Date.now();
    const result = await this.sendMessageToSubagent(targetSubagentId, {
      message: enrichedMessage,
      timeoutSeconds: 0, // 异步发送
      waitForReply: false,
    });

    const duration = Date.now() - startTime;
    if (result.success) {
      log.info(`[A2A] ✅ ${sourceSubagentId} -> ${targetSubagentId} 发送成功 (${duration}ms)`);
    } else {
      log.error(`[A2A] ❌ ${sourceSubagentId} -> ${targetSubagentId} 发送失败: ${result.error}`);
    }

    return { success: result.success, error: result.error };
  }

  /**
   * 关闭子代理会话 (优雅关闭，保留会话)
   * @param subagentId 子代理ID
   * @param reason 关闭原因
   * @returns 是否成功关闭
   */
  async closeSubagent(subagentId: string, reason?: string): Promise<boolean> {
    const sessionInfo = this.getSubagentSession(subagentId);
    if (!sessionInfo) {
      log.warn(`[Subagent] 关闭失败: ${subagentId} 不存在`);
      return false;
    }

    if (!sessionInfo.isActive) {
      log.debug(`[Subagent] ${subagentId} 已经关闭`);
      return true;
    }

    try {
      log.info(`[Subagent] 🛑 关闭子代理: ${subagentId} (原因: ${reason ?? "正常关闭"})`);
      log.info(`[Subagent]    会话: ${sessionInfo.sessionKey}`);

      // 发送关闭通知消息
      await callGateway({
        method: "agent",
        params: {
          message: `[系统通知] 子代理将被关闭。原因: ${reason ?? "任务完成"}`,
          sessionKey: sessionInfo.sessionKey,
          deliver: false,
        },
      });

      // 标记为不活跃
      sessionInfo.isActive = false;
      this.subagentSessions.set(subagentId, sessionInfo);

      log.info(`[Subagent] ✅ ${subagentId} 已关闭 (会话保留)`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`关闭子代理 ${subagentId} 失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 删除子代理会话 (完全删除，清理资源)
   * @param subagentId 子代理ID
   * @returns 是否成功删除
   */
  async deleteSubagent(subagentId: string): Promise<boolean> {
    const sessionInfo = this.getSubagentSession(subagentId);
    if (!sessionInfo) {
      log.warn(`[Subagent] 删除失败: ${subagentId} 不存在`);
      return false;
    }

    try {
      log.info(`[Subagent] 🗑️ 删除子代理: ${subagentId}`);
      log.info(`[Subagent]    会话: ${sessionInfo.sessionKey}`);

      // 如果还在活跃，先关闭
      if (sessionInfo.isActive) {
        await this.closeSubagent(subagentId, "即将删除");
      }

      // 删除会话
      await callGateway({
        method: "sessions.delete",
        params: {
          sessionKey: sessionInfo.sessionKey,
          deleteTranscript: true,
        },
      });

      // 清理本地映射
      this.sessionKeyToSubagentId.delete(sessionInfo.sessionKey);
      this.subagentSessions.delete(subagentId);

      log.info(`[Subagent] ✅ ${subagentId} 已删除`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`删除子代理 ${subagentId} 失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 批量关闭所有子代理
   * @param reason 关闭原因
   * @returns 关闭结果统计
   */
  async closeAllSubagents(reason?: string): Promise<{
    total: number;
    closed: number;
    failed: number;
  }> {
    const results = { total: 0, closed: 0, failed: 0 };

    for (const [subagentId, sessionInfo] of this.subagentSessions) {
      if (sessionInfo.isActive) {
        results.total++;
        const success = await this.closeSubagent(subagentId, reason);
        if (success) {
          results.closed++;
        } else {
          results.failed++;
        }
      }
    }

    log.info(`批量关闭子代理完成: ${results.closed}/${results.total} 成功`);
    return results;
  }

  /**
   * 批量删除所有子代理
   * @returns 删除结果统计
   */
  async deleteAllSubagents(): Promise<{
    total: number;
    deleted: number;
    failed: number;
  }> {
    const results = { total: 0, deleted: 0, failed: 0 };

    // 复制 keys 避免在迭代中修改
    const subagentIds = Array.from(this.subagentSessions.keys());

    for (const subagentId of subagentIds) {
      results.total++;
      const success = await this.deleteSubagent(subagentId);
      if (success) {
        results.deleted++;
      } else {
        results.failed++;
      }
    }

    log.info(`批量删除子代理完成: ${results.deleted}/${results.total} 成功`);
    return results;
  }

  // ========================================================================
  // 查询和管理
  // ========================================================================

  /**
   * 获取子代理会话信息
   */
  getSubagentSession(subagentId: string): SubagentSessionInfo | undefined {
    return this.subagentSessions.get(subagentId);
  }

  /**
   * 通过会话键获取子代理ID
   */
  getSubagentIdBySessionKey(sessionKey: string): string | undefined {
    return this.sessionKeyToSubagentId.get(sessionKey);
  }

  /**
   * 获取所有活跃子代理
   */
  getActiveSubagents(): SubagentSessionInfo[] {
    return Array.from(this.subagentSessions.values()).filter(s => s.isActive);
  }

  /**
   * 获取所有子代理
   */
  getAllSubagents(): SubagentSessionInfo[] {
    return Array.from(this.subagentSessions.values());
  }

  /**
   * 检查子代理是否活跃
   */
  isSubagentActive(subagentId: string): boolean {
    const session = this.subagentSessions.get(subagentId);
    return session?.isActive ?? false;
  }

  /**
   * 从 registry 同步子代理状态
   * 用于恢复已存在的子代理会话
   */
  async syncFromRegistry(requesterSessionKey: string): Promise<number> {
    const runs = listSubagentRunsForRequester(requesterSessionKey);
    let synced = 0;

    for (const run of runs) {
      if (!run.endedAt && run.childSessionKey) {
        const subagentId = run.label ?? run.childSessionKey;
        
        // 如果还没有记录，添加到本地映射
        if (!this.subagentSessions.has(subagentId)) {
          const sessionInfo: SubagentSessionInfo = {
            subagentId,
            sessionKey: run.childSessionKey,
            runId: run.runId,
            mode: "session",
            label: run.label,
            createdAt: run.startedAt ?? Date.now(),
            lastActiveAt: Date.now(),
            isActive: true,
            metadata: {
              model: run.model,
              restoredFromRegistry: true,
            },
          };

          this.subagentSessions.set(subagentId, sessionInfo);
          this.sessionKeyToSubagentId.set(run.childSessionKey, subagentId);
          synced++;
        }
      }
    }

    if (synced > 0) {
      log.info(`从 registry 同步了 ${synced} 个子代理会话`);
    }

    return synced;
  }

  // ========================================================================
  // 内部方法
  // ========================================================================

  /**
   * run 模式执行 - 单次执行
   */
  private async executeRunMode(
    task: CollaborationTask,
    subagentId: string,
    context: ExecutionContext,
    options: SubagentExecutionOptions = {},
  ): Promise<TaskResult> {
    const executionId = generateId("exec", Date.now().toString());
    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

    const startTime = Date.now();

    try {
      log.info(`开始执行子代理任务 (run模式): ${task.id} -> ${subagentId}`);

      const spawnParams: SpawnSubagentParams = {
        task: task.content,
        label: task.description?.slice(0, 50),
        agentId: subagentId,
        model: options.model,
        thinking: options.thinking,
        runTimeoutSeconds: options.timeoutSeconds ?? 300,
        mode: "run",
        cleanup: options.cleanup ?? "delete",
        expectsCompletionMessage: options.expectsCompletionMessage ?? true,
      };

      const spawnContext: SpawnSubagentContext = {
        agentSessionKey: context.requester?.agentSessionKey ?? context.sessionKey,
        agentChannel: context.requester?.agentChannel,
        agentAccountId: context.requester?.agentAccountId,
        agentTo: context.requester?.agentTo,
        agentThreadId: context.requester?.agentThreadId,
      };

      const result = await spawnSubagentDirect(spawnParams, spawnContext);
      const taskResult = this.convertToTaskResult(result, subagentId, executionId, startTime);

      log.info(`子代理任务完成: ${task.id}, 质量评分: ${taskResult.qualityScore.toFixed(2)}`);

      return taskResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`子代理任务失败: ${task.id}`, { error: err.message });

      return {
        content: `任务执行失败: ${err.message}`,
        qualityScore: 0,
        confidence: 0,
        executionTimeMs: Date.now() - startTime,
        metadata: {
          subagentId,
          executionId,
          error: err.message,
        },
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * 将 SpawnSubagentResult 转换为 TaskResult
   */
  private convertToTaskResult(
    result: SpawnSubagentResult,
    subagentId: string,
    executionId: string,
    startTime: number,
  ): TaskResult {
    const executionTimeMs = Date.now() - startTime;
    const isSuccess = result.status === "accepted";
    const hasError = result.status === "error" || result.status === "forbidden";

    let content = "";
    if (hasError && result.error) {
      content = `任务执行失败: ${result.error}`;
    } else if (isSuccess) {
      content = `任务已${result.mode === "session" ? "启动会话" : "执行"}`;
      if (result.childSessionKey) {
        content += `\n子会话: ${result.childSessionKey}`;
      }
      if (result.note) {
        content += `\n备注: ${result.note}`;
      }
    } else {
      content = "任务状态未知";
    }

    const qualityScore = this.calculateQualityScore(result);

    return {
      content,
      qualityScore,
      confidence: isSuccess ? 0.9 : hasError ? 0.1 : 0.5,
      executionTimeMs,
      metadata: {
        subagentId,
        executionId,
        status: result.status,
        childSessionKey: result.childSessionKey,
        runId: result.runId,
        mode: result.mode,
        error: result.error,
      },
    };
  }

  /**
   * 计算任务质量评分
   */
  private calculateQualityScore(result: SpawnSubagentResult): number {
    if (result.status === "error") return 0;
    if (result.status === "forbidden") return 0.1;
    if (result.status !== "accepted") return 0.3;

    let score = 0.7;
    if (result.childSessionKey) score += 0.1;
    if (result.modelApplied) score += 0.1;
    if (result.runId) score += 0.1;

    return Math.min(1, score);
  }

  /**
   * 批量执行多个任务
   */
  async executeBatch(
    tasks: Array<{ task: CollaborationTask; subagentId: string }>,
    context: ExecutionContext,
    options?: SubagentExecutionOptions,
  ): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();

    const promises = tasks.map(async ({ task, subagentId }) => {
      const result = await this.executeTask(task, subagentId, context, options);
      results.set(task.id, result);
      return result;
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 中止正在执行的任务
   */
  abortTask(taskId: string): boolean {
    for (const [execId, controller] of this.activeExecutions) {
      if (execId.includes(taskId)) {
        controller.abort();
        log.info(`已中止任务: ${taskId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * 获取活跃执行数量
   */
  getActiveExecutionCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * 获取子代理数量统计
   */
  getStats(): {
    total: number;
    active: number;
    inactive: number;
  } {
    const all = this.getAllSubagents();
    return {
      total: all.length,
      active: all.filter(s => s.isActive).length,
      inactive: all.filter(s => !s.isActive).length,
    };
  }
}

/**
 * 创建子代理执行适配器
 */
export function createSubagentExecutionAdapter(
  orchestrator?: ResilientSubagentOrchestrator,
): SubagentExecutionAdapter {
  return new SubagentExecutionAdapter(orchestrator);
}
