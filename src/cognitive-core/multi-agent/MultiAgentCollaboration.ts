/**
 * 多智能体协作系统 - P3 实现
 *
 * 与 Nsemclaw 现有子代理模式深度集成:
 * - 复用 subagent-registry 管理子代理生命周期
 * - 复用 subagents-tool 进行 list/kill/steer 操作
 * - 复用 session 管理进行状态隔离
 * - 增强智能任务分配、协作策略和结果聚合
 */

import { EventEmitter } from "events";
import type { SubagentRunRecord } from "../../agents/subagent-registry.js";
import { listSubagentRunsForRequester } from "../../agents/subagent-registry.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { generateId, clamp } from "../utils/common.js";
import {
  SubagentExecutionAdapter,
  createSubagentExecutionAdapter,
  type ExecutionContext,
} from "./SubagentExecutionAdapter.js";

const log = createSubsystemLogger("multi-agent");

// ============================================================================
// 类型定义
// ============================================================================

/** 智能体角色 */
export type AgentRole =
  | "orchestrator" // 协调者 - 负责任务分配
  | "worker" // 工作者 - 执行具体任务
  | "specialist" // 专家 - 特定领域处理
  | "reviewer" // 审查者 - 检查结果质量
  | "coordinator"; // 协调者 - 多智能体间通信

/** 任务类型 */
export type TaskType =
  | "analysis" // 分析任务
  | "generation" // 生成任务
  | "research" // 研究任务
  | "review" // 审查任务
  | "integration"; // 集成任务

/** 子代理配置 */
export interface SubagentConfig {
  /** 子代理ID */
  id: string;
  /** 角色 */
  role: AgentRole;
  /** 专长领域 */
  specialties: string[];
  /** 能力评分 (0-1) */
  capabilities: Record<string, number>;
  /** 当前负载 (0-1) */
  currentLoad: number;
  /** 最大并发任务数 */
  maxConcurrentTasks: number;
  /** 配置元数据 */
  metadata: {
    model?: string;
    provider?: string;
    timeoutSeconds?: number;
  };
}

/** 协作任务 */
export interface CollaborationTask {
  /** 任务ID */
  id: string;
  /** 任务类型 */
  type: TaskType;
  /** 任务描述 */
  description: string;
  /** 任务内容 */
  content: string;
  /** 优先级 (1-10) */
  priority: number;
  /** 依赖的任务ID */
  dependencies: string[];
  /** 分配给的子代理 */
  assignedTo?: string;
  /** 任务状态 */
  status: "pending" | "assigned" | "running" | "completed" | "failed";
  /** 结果 */
  result?: TaskResult;
  /** 创建时间 */
  createdAt: number;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
}

/** 任务结果 */
export interface TaskResult {
  /** 结果内容 */
  content: string;
  /** 质量评分 (0-1) */
  qualityScore: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 使用的token数 */
  tokenUsage?: number;
  /** 执行时间 (毫秒) */
  executionTimeMs: number;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/** 协作策略 */
export interface CollaborationStrategy {
  /** 策略ID */
  id: string;
  /** 策略名称 */
  name: string;
  /** 策略类型 */
  type: "parallel" | "sequential" | "hierarchical" | "adaptive";
  /** 任务分配算法 */
  assignmentAlgorithm: "round-robin" | "capability-based" | "load-balanced" | "auction";
  /** 结果聚合方法 */
  aggregationMethod: "concatenate" | "summarize" | "vote" | "merge" | "best";
  /** 配置参数 */
  parameters: {
    maxParallelTasks: number;
    timeoutSeconds: number;
    retryAttempts: number;
    qualityThreshold: number;
  };
}

/** 协作会话 */
export interface CollaborationSession {
  /** 会话ID */
  id: string;
  /** 父会话/请求者 */
  requesterSessionKey: string;
  /** 参与的子代理 */
  participants: Map<string, SubagentConfig>;
  /** 任务列表 */
  tasks: Map<string, CollaborationTask>;
  /** 策略 */
  strategy: CollaborationStrategy;
  /** 状态 */
  status: "initializing" | "running" | "pausing" | "paused" | "completing" | "completed" | "failed";
  /** 最终结果 */
  finalResult?: string;
  /** 创建时间 */
  createdAt: number;
  /** 完成时间 */
  completedAt?: number;
  /** 元数据 */
  metadata: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
  };
}

/** 子代理间消息 */
export interface AgentMessage {
  /** 消息ID */
  id: string;
  /** 发送者 */
  from: string;
  /** 接收者 (broadcast 表示广播) */
  to: string;
  /** 消息类型 */
  type: "task" | "result" | "query" | "response" | "broadcast" | "control";
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 关联的任务ID */
  taskId?: string;
  /** 优先级 */
  priority: number;
}

/** 协作统计 */
export interface CollaborationStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalTasks: number;
  averageTaskCompletionTime: number;
  averageResultQuality: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_STRATEGIES: CollaborationStrategy[] = [
  {
    id: "parallel-fast",
    name: "并行快速",
    type: "parallel",
    assignmentAlgorithm: "load-balanced",
    aggregationMethod: "concatenate",
    parameters: {
      maxParallelTasks: 5,
      timeoutSeconds: 60,
      retryAttempts: 1,
      qualityThreshold: 0.6,
    },
  },
  {
    id: "sequential-quality",
    name: "顺序质量",
    type: "sequential",
    assignmentAlgorithm: "capability-based",
    aggregationMethod: "merge",
    parameters: {
      maxParallelTasks: 1,
      timeoutSeconds: 120,
      retryAttempts: 3,
      qualityThreshold: 0.85,
    },
  },
  {
    id: "hierarchical-adaptive",
    name: "分层自适应",
    type: "hierarchical",
    assignmentAlgorithm: "auction",
    aggregationMethod: "summarize",
    parameters: {
      maxParallelTasks: 3,
      timeoutSeconds: 180,
      retryAttempts: 2,
      qualityThreshold: 0.75,
    },
  },
];

// ============================================================================
// 多智能体协作系统
// ============================================================================

export class MultiAgentCollaborationSystem extends EventEmitter {
  private sessions = new Map<string, CollaborationSession>();
  private subagentConfigs = new Map<string, SubagentConfig>();
  private messageQueue: AgentMessage[] = [];
  private stats: CollaborationStats = {
    totalSessions: 0,
    activeSessions: 0,
    completedSessions: 0,
    failedSessions: 0,
    totalTasks: 0,
    averageTaskCompletionTime: 0,
    averageResultQuality: 0,
  };

  private isRunning = false;
  private monitorTimer?: NodeJS.Timeout;
  private messageProcessorTimer?: NodeJS.Timeout;

  /** 请求者会话键 (用于与现有子代理系统集成) */
  private requesterSessionKey: string;

  /** 子代理执行适配器 */
  private subagentAdapter: SubagentExecutionAdapter;
  /** 是否使用真实子代理执行 */
  private useRealSubagents: boolean;

  constructor(
    requesterSessionKey: string,
    options: { useRealSubagents?: boolean } = {},
  ) {
    super();
    this.requesterSessionKey = requesterSessionKey;
    this.useRealSubagents = options.useRealSubagents ?? true;
    this.subagentAdapter = createSubagentExecutionAdapter();
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    // 启动监控
    this.monitorTimer = setInterval(() => {
      this.monitorSessions();
    }, 5000);

    // 启动消息处理器
    this.messageProcessorTimer = setInterval(() => {
      this.processMessages();
    }, 100);

    log.info("🤝 多智能体协作系统已启动");
    log.info(`   请求者: ${this.requesterSessionKey}`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }

    if (this.messageProcessorTimer) {
      clearInterval(this.messageProcessorTimer);
      this.messageProcessorTimer = undefined;
    }

    // 结束所有活跃会话
    for (const session of this.sessions.values()) {
      if (session.status === "running") {
        this.completeSession(session.id, "会话系统停止");
      }
    }

    // 关闭所有子代理会话
    log.info("正在关闭所有子代理...");
    const closeResult = await this.subagentAdapter.closeAllSubagents("协作系统停止");
    log.info(`子代理关闭完成: ${closeResult.closed}/${closeResult.total} 成功`);

    log.info("🛑 多智能体协作系统已停止");
  }

  // ========================================================================
  // 子代理配置管理
  // ========================================================================

  /**
   * 注册子代理配置
   */
  registerSubagent(config: SubagentConfig): void {
    this.subagentConfigs.set(config.id, config);
    log.debug(`子代理已注册: ${config.id} (${config.role})`);
  }

  /**
   * 从现有子代理运行记录自动注册
   */
  autoRegisterFromSubagentRuns(): void {
    const runs = listSubagentRunsForRequester(this.requesterSessionKey);

    for (const run of runs) {
      if (!run.endedAt && !this.subagentConfigs.has(run.childSessionKey)) {
        this.registerSubagent({
          id: run.childSessionKey,
          role: "worker",
          specialties: [],
          capabilities: {},
          currentLoad: 0,
          maxConcurrentTasks: 3,
          metadata: {
            model: run.model,
            timeoutSeconds: run.runTimeoutSeconds,
          },
        });
      }
    }
  }

  /**
   * 更新子代理负载
   */
  updateSubagentLoad(subagentId: string, load: number): void {
    const config = this.subagentConfigs.get(subagentId);
    if (config) {
      config.currentLoad = clamp(load, 0, 1);
    }
  }

  /**
   * 获取可用子代理
   */
  getAvailableSubagents(minCapability?: string): SubagentConfig[] {
    const available = Array.from(this.subagentConfigs.values()).filter((s) => s.currentLoad < 0.8);

    if (minCapability) {
      return available
        .filter((s) => (s.capabilities[minCapability] ?? 0) > 0.5)
        .sort(
          (a, b) => (b.capabilities[minCapability] ?? 0) - (a.capabilities[minCapability] ?? 0),
        );
    }

    return available.sort((a, b) => a.currentLoad - b.currentLoad);
  }

  // ========================================================================
  // 协作会话管理
  // ========================================================================

  /**
   * 创建协作会话
   */
  createSession(
    strategy: CollaborationStrategy = DEFAULT_STRATEGIES[0]!,
    participants?: string[],
  ): CollaborationSession {
    const sessionId = generateId("collab", Date.now().toString());

    // 确定参与者
    const participantMap = new Map<string, SubagentConfig>();

    if (participants && participants.length > 0) {
      for (const id of participants) {
        const config = this.subagentConfigs.get(id);
        if (config) {
          participantMap.set(id, config);
        }
      }
    } else {
      // 自动选择参与者
      const available = this.getAvailableSubagents();
      for (const config of available.slice(0, strategy.parameters.maxParallelTasks)) {
        participantMap.set(config.id, config);
      }
    }

    const session: CollaborationSession = {
      id: sessionId,
      requesterSessionKey: this.requesterSessionKey,
      participants: participantMap,
      tasks: new Map(),
      strategy,
      status: "initializing",
      createdAt: Date.now(),
      metadata: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
      },
    };

    this.sessions.set(sessionId, session);
    this.stats.totalSessions++;
    this.stats.activeSessions++;

    log.info(`🤝 协作会话创建: ${sessionId}`);
    log.info(`   策略: ${strategy.name}`);
    log.info(`   参与者: ${participantMap.size}`);

    this.emit("sessionCreated", session);

    return session;
  }

  /**
   * 添加任务到会话
   */
  addTask(
    sessionId: string,
    task: Omit<CollaborationTask, "id" | "createdAt" | "status">,
  ): CollaborationTask {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const fullTask: CollaborationTask = {
      ...task,
      id: generateId("task", sessionId + Date.now()),
      createdAt: Date.now(),
      status: "pending",
    };

    session.tasks.set(fullTask.id, fullTask);
    session.metadata.totalTasks++;
    this.stats.totalTasks++;

    this.emit("taskAdded", { sessionId, task: fullTask });

    return fullTask;
  }

  /**
   * 启动会话执行
   */
  async startSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    session.status = "running";

    log.info(`▶️ 协作会话启动: ${sessionId}`);

    // 根据策略执行任务分配
    switch (session.strategy.type) {
      case "parallel":
        await this.executeParallel(session);
        break;
      case "sequential":
        await this.executeSequential(session);
        break;
      case "hierarchical":
        await this.executeHierarchical(session);
        break;
      case "adaptive":
        await this.executeAdaptive(session);
        break;
    }
  }

  /**
   * 完成会话
   */
  completeSession(sessionId: string, finalResult: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "completed";
    session.finalResult = finalResult;
    session.completedAt = Date.now();
    session.metadata.completedTasks = session.tasks.size;

    this.stats.activeSessions--;
    this.stats.completedSessions++;

    // 更新平均统计
    this.updateAverageStats();

    log.info(`✅ 协作会话完成: ${sessionId}`);

    this.emit("sessionCompleted", session);
  }

  /**
   * 暂停会话
   */
  pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.status === "running") {
      session.status = "pausing";
      log.info(`⏸️ 协作会话暂停中: ${sessionId}`);
    }
  }

  /**
   * 恢复会话
   */
  resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.status === "paused") {
      session.status = "running";
      log.info(`▶️ 协作会话恢复: ${sessionId}`);
      this.emit("sessionResumed", session);
    }
  }

  // ========================================================================
  // 执行策略
  // ========================================================================

  /**
   * 并行执行 - 同时分配多个任务
   */
  private async executeParallel(session: CollaborationSession): Promise<void> {
    const pendingTasks = Array.from(session.tasks.values()).filter((t) => t.status === "pending");

    // 按负载分配任务
    const assignments = this.assignTasksByLoad(session, pendingTasks);

    // 同时启动所有任务
    const promises = assignments.map(async ({ task, subagentId }) => {
      await this.executeTask(session, task, subagentId);
    });

    await Promise.all(promises);

    // 聚合结果
    const finalResult = this.aggregateResults(session);
    this.completeSession(session.id, finalResult);
  }

  /**
   * 顺序执行 - 一个接一个
   */
  private async executeSequential(session: CollaborationSession): Promise<void> {
    // 按依赖排序
    const sortedTasks = this.topologicalSort(session.tasks);

    for (const task of sortedTasks) {
      if (task.status !== "pending") continue;

      // 等待依赖完成
      await this.waitForDependencies(session, task);

      // 基于能力选择最佳子代理
      const subagentId = this.selectBestSubagentForTask(session, task);

      await this.executeTask(session, task, subagentId);

      // 检查是否需要暂停
      if (session.status === "pausing") {
        session.status = "paused";
        this.emit("sessionPaused", session);
        return;
      }
    }

    // 合并结果
    const finalResult = this.aggregateResults(session);
    this.completeSession(session.id, finalResult);
  }

  /**
   * 分层执行 - 协调者分配，工作者执行
   */
  private async executeHierarchical(session: CollaborationSession): Promise<void> {
    // 选择协调者 (orchestrator 或 coordinator 角色)
    let coordinator = Array.from(session.participants.values()).find(
      (p) => p.role === "orchestrator" || p.role === "coordinator",
    );

    if (!coordinator) {
      // 如果没有专门的协调者，选择负载最低的作为协调者
      coordinator = Array.from(session.participants.values()).sort(
        (a, b) => a.currentLoad - b.currentLoad,
      )[0];
    }

    log.debug(`协调者: ${coordinator?.id}`);

    // 协调者负责任务分配
    const pendingTasks = Array.from(session.tasks.values()).filter((t) => t.status === "pending");

    for (const task of pendingTasks) {
      // 通过消息机制让协调者分配任务
      this.sendMessage({
        id: generateId("msg", Date.now().toString()),
        from: session.id,
        to: coordinator!.id,
        type: "task",
        content: `分配任务: ${task.description}`,
        timestamp: Date.now(),
        taskId: task.id,
        priority: task.priority,
      });
    }

    // 等待所有任务完成
    await this.waitForAllTasks(session);

    // 汇总结果
    const finalResult = this.aggregateResults(session);
    this.completeSession(session.id, finalResult);
  }

  /**
   * 自适应执行 - 根据情况动态调整
   */
  private async executeAdaptive(session: CollaborationSession): Promise<void> {
    // 初始使用并行策略
    await this.executeParallel(session);

    // 如果结果质量不达标，重新分配任务
    const avgQuality = this.calculateAverageQuality(session);
    if (avgQuality < session.strategy.parameters.qualityThreshold) {
      log.info(`质量不足 (${avgQuality.toFixed(2)})，重新执行低质量任务`);

      // 找出低质量任务重新执行
      for (const task of session.tasks.values()) {
        if (
          task.result &&
          task.result.qualityScore < session.strategy.parameters.qualityThreshold
        ) {
          task.status = "pending";
          task.result = undefined;
        }
      }

      // 切换到顺序策略重新执行
      session.strategy = { ...session.strategy, type: "sequential" };
      await this.executeSequential(session);
    }
  }

  // ========================================================================
  // 任务分配算法
  // ========================================================================

  /**
   * 按负载分配任务
   */
  private assignTasksByLoad(
    session: CollaborationSession,
    tasks: CollaborationTask[],
  ): Array<{ task: CollaborationTask; subagentId: string }> {
    const assignments: Array<{ task: CollaborationTask; subagentId: string }> = [];
    const participants = Array.from(session.participants.values());

    // 按负载排序
    participants.sort((a, b) => a.currentLoad - b.currentLoad);

    let participantIndex = 0;
    for (const task of tasks) {
      const subagent = participants[participantIndex];
      if (subagent) {
        assignments.push({ task, subagentId: subagent.id });
        participantIndex = (participantIndex + 1) % participants.length;
      }
    }

    return assignments;
  }

  /**
   * 基于能力选择最佳子代理
   */
  private selectBestSubagentForTask(
    session: CollaborationSession,
    task: CollaborationTask,
  ): string {
    let bestSubagent: SubagentConfig | null = null;
    let bestScore = -1;

    for (const participant of session.participants.values()) {
      // 计算匹配分数
      let score = 0;

      // 能力匹配
      const taskTypeCapability = participant.capabilities[task.type] ?? 0;
      score += taskTypeCapability * 0.4;

      // 负载权重
      score += (1 - participant.currentLoad) * 0.3;

      // 专业领域匹配
      const specialtyMatch = participant.specialties.some((s) =>
        task.description.toLowerCase().includes(s.toLowerCase()),
      );
      if (specialtyMatch) score += 0.2;

      // 角色权重
      if (participant.role === "specialist") score += 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestSubagent = participant;
      }
    }

    return bestSubagent?.id ?? Array.from(session.participants.keys())[0]!;
  }

  // ========================================================================
  // 任务执行
  // ========================================================================

  /**
   * 执行单个任务
   */
  private async executeTask(
    session: CollaborationSession,
    task: CollaborationTask,
    subagentId: string,
  ): Promise<void> {
    task.status = "running";
    task.assignedTo = subagentId;
    task.startedAt = Date.now();

    log.info(`执行任务: ${task.id} -> ${subagentId} (${this.useRealSubagents ? "真实子代理" : "模拟"})`);

    try {
      // 发送任务消息给子代理
      this.sendMessage({
        id: generateId("msg", Date.now().toString()),
        from: session.id,
        to: subagentId,
        type: "task",
        content: task.content,
        timestamp: Date.now(),
        taskId: task.id,
        priority: task.priority,
      });

      // 更新子代理负载
      const subagent = session.participants.get(subagentId);
      if (subagent) {
        subagent.currentLoad = Math.min(1, subagent.currentLoad + 0.2);
      }

      // 执行子代理任务
      let result: TaskResult;
      if (this.useRealSubagents) {
        // 使用真实子代理系统
        result = await this.executeSubagentTask(session, task, subagentId);
      } else {
        // 使用模拟执行
        result = await this.simulateTaskExecution(task);
      }

      task.result = result;
      task.status = result.qualityScore > 0 ? "completed" : "failed";
      task.completedAt = Date.now();

      if (task.status === "completed") {
        session.metadata.completedTasks++;
        this.emit("taskCompleted", { sessionId: session.id, task, result });
      } else {
        session.metadata.failedTasks++;
        this.emit("taskFailed", { sessionId: session.id, task, error: new Error("任务质量评分过低") });
      }

      // 更新子代理负载
      if (subagent) {
        subagent.currentLoad = Math.max(0, subagent.currentLoad - 0.2);
      }
    } catch (error) {
      task.status = "failed";
      session.metadata.failedTasks++;

      log.error(`任务执行失败: ${task.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit("taskFailed", { sessionId: session.id, task, error });
    }
  }

  /**
   * 执行子代理任务 - 使用真实子代理系统
   * 支持 session 模式 (长时间运行) 和 run 模式 (单次执行)
   */
  private async executeSubagentTask(
    session: CollaborationSession,
    task: CollaborationTask,
    subagentId: string,
  ): Promise<TaskResult> {
    // 构建执行上下文
    const context: ExecutionContext = {
      sessionKey: this.requesterSessionKey,
    };

    // 检查是否已有活跃的子代理会话
    const existingSession = this.subagentAdapter.getSubagentSession(subagentId);
    
    if (existingSession?.isActive) {
      // session 模式: 发送消息给已存在的子代理
      log.debug(`使用现有子代理会话: ${subagentId} -> ${existingSession.sessionKey}`);
      
      const sendResult = await this.subagentAdapter.sendMessageToSubagent(subagentId, {
        message: task.content,
        timeoutSeconds: session.strategy.parameters.timeoutSeconds,
        waitForReply: true,
      });

      return {
        content: sendResult.response ?? "任务已发送",
        qualityScore: sendResult.success ? 0.85 : 0.3,
        confidence: sendResult.success ? 0.9 : 0.4,
        executionTimeMs: sendResult.executionTimeMs ?? 0,
        metadata: {
          subagentId,
          sessionKey: existingSession.sessionKey,
          mode: "session",
          sendResult,
        },
      };
    }

    // run 模式或首次创建 session: 执行完整任务
    const options = {
      parentAgentId: this.requesterSessionKey,
      memoryInheritanceStrategy: "filtered" as const,
      minInheritedImportance: 0.3,
      timeoutSeconds: session.strategy.parameters.timeoutSeconds,
      cleanup: "delete" as const,
      mode: "run" as const, // 默认使用 run 模式
    };

    // 调用适配器执行真实子代理
    return this.subagentAdapter.executeTask(task, subagentId, context, options);
  }

  /**
   * 创建子代理会话 (session 模式)
   * 用于需要长时间运行和多次交互的场景
   */
  async createSubagentSession(
    subagentId: string,
    initialTask: string,
    options?: {
      model?: string;
      timeoutSeconds?: number;
    },
  ): Promise<import("./SubagentExecutionAdapter.js").SubagentSessionInfo> {
    const context: ExecutionContext = {
      sessionKey: this.requesterSessionKey,
    };

    return this.subagentAdapter.createSubagent(subagentId, initialTask, context, {
      mode: "session",
      thread: true,
      cleanup: "keep",
      ...options,
    });
  }

  /**
   * 发送消息给子代理 (用于 session 模式)
   */
  async sendMessageToSubagent(
    subagentId: string,
    message: string,
    timeoutSeconds?: number,
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const result = await this.subagentAdapter.sendMessageToSubagent(subagentId, {
      message,
      timeoutSeconds: timeoutSeconds ?? 30,
      waitForReply: true,
    });

    return {
      success: result.success,
      response: result.response,
      error: result.error,
    };
  }

  /**
   * 关闭子代理会话 (优雅关闭)
   */
  async closeSubagent(subagentId: string, reason?: string): Promise<boolean> {
    return this.subagentAdapter.closeSubagent(subagentId, reason);
  }

  /**
   * 删除子代理会话 (完全删除)
   */
  async deleteSubagent(subagentId: string): Promise<boolean> {
    return this.subagentAdapter.deleteSubagent(subagentId);
  }

  /**
   * 获取子代理信息
   */
  getSubagentInfo(subagentId: string): import("./SubagentExecutionAdapter.js").SubagentSessionInfo | undefined {
    return this.subagentAdapter.getSubagentSession(subagentId);
  }

  /**
   * 获取所有活跃子代理
   */
  getActiveSubagents(): import("./SubagentExecutionAdapter.js").SubagentSessionInfo[] {
    return this.subagentAdapter.getActiveSubagents();
  }

  /**
   * 模拟任务执行 (后备方案)
   */
  private async simulateTaskExecution(task: CollaborationTask): Promise<TaskResult> {
    // 模拟执行时间
    const executionTime = 1000 + Math.random() * 4000;
    await new Promise((resolve) => setTimeout(resolve, executionTime));

    return {
      content: `任务 ${task.id} 完成 (模拟)`,
      qualityScore: 0.7 + Math.random() * 0.3,
      confidence: 0.8,
      executionTimeMs: executionTime,
      metadata: {},
    };
  }

  // ========================================================================
  // 结果聚合
  // ========================================================================

  /**
   * 聚合会话结果
   */
  private aggregateResults(session: CollaborationSession): string {
    const results = Array.from(session.tasks.values())
      .filter((t) => t.result)
      .map((t) => t.result!);

    switch (session.strategy.aggregationMethod) {
      case "concatenate":
        return results.map((r) => r.content).join("\n\n---\n\n");

      case "summarize":
        return this.summarizeResults(results);

      case "vote":
        return this.voteResults(results);

      case "merge":
        return this.mergeResults(results);

      case "best":
        const best = results.sort((a, b) => b.qualityScore - a.qualityScore)[0];
        return best?.content ?? "";

      default:
        return results.map((r) => r.content).join("\n");
    }
  }

  private summarizeResults(results: TaskResult[]): string {
    // 简化实现：选择置信度最高的结果作为摘要
    const best = results.sort((a, b) => b.confidence - a.confidence)[0];
    return `汇总 (${results.length} 个结果):\n${best?.content ?? ""}`;
  }

  private voteResults(results: TaskResult[]): string {
    // 简化实现：按内容分组投票
    const votes = new Map<string, number>();
    for (const result of results) {
      votes.set(result.content, (votes.get(result.content) ?? 0) + result.confidence);
    }

    let bestContent = "";
    let bestScore = 0;
    for (const [content, score] of votes) {
      if (score > bestScore) {
        bestScore = score;
        bestContent = content;
      }
    }

    return bestContent;
  }

  private mergeResults(results: TaskResult[]): string {
    // 简化实现：智能合并 (去重 + 排序)
    const uniqueResults = [...new Set(results.map((r) => r.content))];
    return uniqueResults.join("\n\n");
  }

  // ========================================================================
  // 消息系统
  // ========================================================================

  /**
   * 发送消息
   */
  sendMessage(message: AgentMessage): void {
    this.messageQueue.push(message);
    this.emit("messageSent", message);
  }

  /**
   * 处理消息队列
   */
  private processMessages(): void {
    if (this.messageQueue.length === 0) return;

    // 按优先级排序
    this.messageQueue.sort((a, b) => b.priority - a.priority);

    // 处理一批消息
    const batchSize = Math.min(10, this.messageQueue.length);
    for (let i = 0; i < batchSize; i++) {
      const message = this.messageQueue.shift();
      if (message) {
        this.handleMessage(message);
      }
    }
  }

  /**
   * 处理单个消息
   */
  private handleMessage(message: AgentMessage): void {
    // 广播消息
    if (message.to === "broadcast") {
      this.emit("broadcast", message);
      return;
    }

    // 查找目标会话
    for (const session of this.sessions.values()) {
      if (session.participants.has(message.to) || message.to === session.id) {
        this.emit("messageReceived", { sessionId: session.id, message });
        break;
      }
    }
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 拓扑排序任务
   */
  private topologicalSort(tasks: Map<string, CollaborationTask>): CollaborationTask[] {
    const sorted: CollaborationTask[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (task: CollaborationTask) => {
      if (visited.has(task.id)) return;
      if (visiting.has(task.id)) {
        throw new Error(`任务依赖循环: ${task.id}`);
      }

      visiting.add(task.id);

      for (const depId of task.dependencies) {
        const dep = tasks.get(depId);
        if (dep) visit(dep);
      }

      visiting.delete(task.id);
      visited.add(task.id);
      sorted.push(task);
    };

    for (const task of tasks.values()) {
      visit(task);
    }

    return sorted;
  }

  /**
   * 等待依赖完成
   */
  private async waitForDependencies(
    session: CollaborationSession,
    task: CollaborationTask,
  ): Promise<void> {
    const checkInterval = 100;
    const maxWaitTime = 60000; // 60秒
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const allCompleted = task.dependencies.every((depId) => {
        const dep = session.tasks.get(depId);
        return dep?.status === "completed";
      });

      if (allCompleted) return;

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    throw new Error(`等待依赖超时: ${task.id}`);
  }

  /**
   * 等待所有任务完成
   */
  private async waitForAllTasks(session: CollaborationSession): Promise<void> {
    const checkInterval = 500;
    const maxWaitTime = session.strategy.parameters.timeoutSeconds * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const allCompleted = Array.from(session.tasks.values()).every(
        (t) => t.status === "completed" || t.status === "failed",
      );

      if (allCompleted) return;

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    throw new Error("等待任务完成超时");
  }

  /**
   * 计算平均质量
   */
  private calculateAverageQuality(session: CollaborationSession): number {
    const results = Array.from(session.tasks.values())
      .filter((t) => t.result)
      .map((t) => t.result!);

    if (results.length === 0) return 0;

    return results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;
  }

  /**
   * 监控会话
   */
  private monitorSessions(): void {
    for (const session of this.sessions.values()) {
      if (session.status !== "running") continue;

      const runningTime = Date.now() - session.createdAt;
      const timeoutMs = session.strategy.parameters.timeoutSeconds * 1000;

      // 检查超时
      if (runningTime > timeoutMs) {
        log.warn(`会话超时: ${session.id}`);
        this.completeSession(session.id, "会话超时");
      }
    }
  }

  /**
   * 更新平均统计
   */
  private updateAverageStats(): void {
    const completedTasks = Array.from(this.sessions.values())
      .flatMap((s) => Array.from(s.tasks.values()))
      .filter((t) => t.status === "completed" && t.result);

    if (completedTasks.length > 0) {
      this.stats.averageTaskCompletionTime =
        completedTasks.reduce((sum, t) => sum + (t.result?.executionTimeMs ?? 0), 0) /
        completedTasks.length;

      this.stats.averageResultQuality =
        completedTasks.reduce((sum, t) => sum + (t.result?.qualityScore ?? 0), 0) /
        completedTasks.length;
    }
  }

  // ========================================================================
  // 查询接口
  // ========================================================================

  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === "running");
  }

  getStats(): CollaborationStats {
    return { ...this.stats };
  }

  getStrategies(): CollaborationStrategy[] {
    return [...DEFAULT_STRATEGIES];
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createMultiAgentCollaborationSystem(
  requesterSessionKey: string,
  options?: { useRealSubagents?: boolean },
): MultiAgentCollaborationSystem {
  return new MultiAgentCollaborationSystem(requesterSessionKey, options);
}

/** @deprecated 使用 MultiAgentCollaborationSystem 替代 */
export const MultiAgentCollaboration = MultiAgentCollaborationSystem;

/** @deprecated 使用 createMultiAgentCollaborationSystem 替代 */
export const createMultiAgentCollaboration = createMultiAgentCollaborationSystem;

export { DEFAULT_STRATEGIES };
