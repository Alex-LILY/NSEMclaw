/**
 * 子代理工作队列系统 - Work Queue & Pipeline 模式
 *
 * 功能:
 * - Work Queue: 主 Agent 发布任务，子代理竞争/分配领取
 * - Pipeline: 任务按阶段流动，每个阶段由特定子代理处理
 * - 支持任务优先级、状态追踪、结果聚合
 */

import { EventEmitter } from "events";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { generateId } from "../utils/common.js";
import type { SubagentExecutionAdapter, SubagentSessionInfo } from "./SubagentExecutionAdapter.js";

const log = createSubsystemLogger("work-queue");

// ============================================================================
// 类型定义
// ============================================================================

/** 任务状态 */
export type WorkQueueTaskStatus = 
  | "pending"      // 等待领取
  | "assigned"     // 已分配给子代理
  | "processing"   // 处理中
  | "completed"    // 已完成
  | "failed";      // 失败

/** 工作队列任务 */
export interface WorkQueueTask {
  /** 任务ID */
  id: string;
  /** 任务类型 */
  type: string;
  /** 任务内容 */
  content: string;
  /** 优先级 (1-10) */
  priority: number;
  /** 任务状态 */
  status: WorkQueueTaskStatus;
  /** 分配给哪个子代理 */
  assignedTo?: string;
  /** 创建时间 */
  createdAt: number;
  /** 开始处理时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 结果 */
  result?: string;
  /** 错误信息 */
  error?: string;
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** Pipeline 阶段信息 */
  pipelineStage?: {
    /** 当前阶段索引 */
    currentStage: number;
    /** 总阶段数 */
    totalStages: number;
    /** 阶段名称 */
    stageName: string;
  };
}

/** Pipeline 阶段定义 */
export interface PipelineStage {
  /** 阶段名称 */
  name: string;
  /** 阶段描述 */
  description: string;
  /** 负责此阶段的子代理ID */
  subagentId: string;
  /** 超时秒数 */
  timeoutSeconds: number;
  /** 是否阻塞（必须完成才能进入下一阶段） */
  blocking: boolean;
  /** 重试次数 */
  maxRetries: number;
}

/** Pipeline 定义 */
export interface PipelineDefinition {
  /** Pipeline ID */
  id: string;
  /** Pipeline 名称 */
  name: string;
  /** 阶段列表 */
  stages: PipelineStage[];
  /** 全局超时 */
  globalTimeoutSeconds: number;
}

/** 工作队列配置 */
export interface WorkQueueConfig {
  /** 队列最大长度 */
  maxQueueSize: number;
  /** 默认任务超时 */
  defaultTimeoutSeconds: number;
  /** 任务过期时间（毫秒） */
  taskExpiryMs: number;
  /** 是否允许多个子代理竞争 */
  allowCompetition: boolean;
  /** 自动分配策略 */
  assignmentStrategy: "round-robin" | "least-loaded" | "capability-based";
}

/** 队列统计 */
export interface WorkQueueStats {
  /** 等待中 */
  pending: number;
  /** 处理中 */
  processing: number;
  /** 已完成 */
  completed: number;
  /** 失败 */
  failed: number;
  /** 总计 */
  total: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_WORK_QUEUE_CONFIG: WorkQueueConfig = {
  maxQueueSize: 1000,
  defaultTimeoutSeconds: 300,
  taskExpiryMs: 24 * 60 * 60 * 1000, // 24小时
  allowCompetition: true,
  assignmentStrategy: "least-loaded",
};

// ============================================================================
// 子代理工作队列
// ============================================================================

export class SubagentWorkQueue extends EventEmitter {
  private config: WorkQueueConfig;
  private tasks = new Map<string, WorkQueueTask>();
  private taskQueue: string[] = []; // 等待中的任务ID队列
  private pipelines = new Map<string, PipelineDefinition>();
  private adapter: SubagentExecutionAdapter;
  private isRunning = false;
  private processTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  
  // 轮询计数器（用于 round-robin）
  private roundRobinIndex = 0;

  constructor(adapter: SubagentExecutionAdapter, config: Partial<WorkQueueConfig> = {}) {
    super();
    this.adapter = adapter;
    this.config = { ...DEFAULT_WORK_QUEUE_CONFIG, ...config };
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 启动任务处理器
    this.processTimer = setInterval(() => {
      this.processQueue();
    }, 1000);

    // 启动清理器
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTasks();
    }, 60000);

    log.info("[WorkQueue] 🏭 工作队列已启动");
    log.info(`[WorkQueue]    策略: ${this.config.assignmentStrategy}`);
    log.info(`[WorkQueue]    竞争模式: ${this.config.allowCompetition ? "开启" : "关闭"}`);
    this.emit("started");
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    log.info("[WorkQueue] 🛑 工作队列已停止");
    this.emit("stopped");
  }

  // ========================================================================
  // 任务管理 (Work Queue)
  // ========================================================================

  /**
   * 提交任务到队列
   */
  submitTask(
    type: string,
    content: string,
    options: {
      priority?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): WorkQueueTask {
    // 检查队列容量
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error(`队列已满，最大容量: ${this.config.maxQueueSize}`);
    }

    const task: WorkQueueTask = {
      id: generateId("task", Date.now().toString()),
      type,
      content,
      priority: options.priority ?? 5,
      status: "pending",
      createdAt: Date.now(),
      metadata: options.metadata ?? {},
    };

    this.tasks.set(task.id, task);
    
    // 按优先级插入队列
    this.insertByPriority(task.id, task.priority);

    log.info(`[WorkQueue] 📥 任务入队: ${task.id.slice(0, 8)}... (类型: ${type}, 优先级: ${task.priority})`);
    this.emit("taskSubmitted", task);

    return task;
  }

  /**
   * 子代理领取任务
   */
  claimTask(subagentId: string): WorkQueueTask | null {
    // 获取子代理信息
    const subagent = this.adapter.getSubagentSession(subagentId);
    if (!subagent || !subagent.isActive) {
      log.warn(`[WorkQueue] 子代理 ${subagentId} 不存在或未激活，无法领取任务`);
      return null;
    }

    // 找到最高优先级的待处理任务
    const taskId = this.findBestTaskForSubagent(subagentId);
    if (!taskId) {
      log.debug(`[WorkQueue] 没有适合 ${subagentId} 的任务`);
      return null;
    }

    const task = this.tasks.get(taskId);
    if (!task || task.status !== "pending") {
      return null;
    }

    // 分配任务
    task.status = "assigned";
    task.assignedTo = subagentId;
    
    // 从等待队列移除
    const queueIndex = this.taskQueue.indexOf(taskId);
    if (queueIndex > -1) {
      this.taskQueue.splice(queueIndex, 1);
    }

    log.info(`[WorkQueue] 🎯 任务分配: ${task.id.slice(0, 8)}... -> ${subagentId}`);
    this.emit("taskClaimed", { task, subagentId });

    return task;
  }

  /**
   * 开始处理任务
   */
  async startTask(taskId: string, subagentId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.assignedTo !== subagentId) {
      return false;
    }

    task.status = "processing";
    task.startedAt = Date.now();

    log.info(`[WorkQueue] ▶️ 开始处理: ${task.id.slice(0, 8)}... (${subagentId})`);
    this.emit("taskStarted", { task, subagentId });

    // 发送任务内容给子代理
    try {
      const result = await this.adapter.sendMessageToSubagent(subagentId, {
        message: `[WorkQueue 任务] ${task.type}\n\n${task.content}`,
        timeoutSeconds: this.config.defaultTimeoutSeconds,
        waitForReply: false, // 异步处理，子代理完成后报告
      });

      if (!result.success) {
        log.error(`[WorkQueue] 发送任务给 ${subagentId} 失败: ${result.error}`);
        task.status = "failed";
        task.error = result.error;
        this.emit("taskFailed", { task, error: result.error });
        return false;
      }

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[WorkQueue] 启动任务失败: ${err.message}`);
      task.status = "failed";
      task.error = err.message;
      this.emit("taskFailed", { task, error: err.message });
      return false;
    }
  }

  /**
   * 报告任务完成
   */
  completeTask(taskId: string, subagentId: string, result: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.assignedTo !== subagentId) {
      return false;
    }

    task.status = "completed";
    task.result = result;
    task.completedAt = Date.now();

    log.info(`[WorkQueue] ✅ 任务完成: ${task.id.slice(0, 8)}... (${subagentId})`);
    log.debug(`[WorkQueue] 结果: ${result.slice(0, 100)}...`);
    
    this.emit("taskCompleted", { task, subagentId, result });

    // 检查是否是 Pipeline 任务，自动推进到下一阶段
    if (task.pipelineStage && task.pipelineStage.currentStage < task.pipelineStage.totalStages - 1) {
      this.advancePipeline(task);
    }

    return true;
  }

  /**
   * 报告任务失败
   */
  failTask(taskId: string, subagentId: string, error: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.assignedTo !== subagentId) {
      return false;
    }

    task.status = "failed";
    task.error = error;
    task.completedAt = Date.now();

    log.warn(`[WorkQueue] ❌ 任务失败: ${task.id.slice(0, 8)}... (${subagentId}): ${error}`);
    this.emit("taskFailed", { task, subagentId, error });

    return true;
  }

  // ========================================================================
  // Pipeline 管理
  // ========================================================================

  /**
   * 创建 Pipeline
   */
  createPipeline(
    name: string,
    stages: Array<{
      name: string;
      description: string;
      subagentId: string;
      timeoutSeconds?: number;
      blocking?: boolean;
      maxRetries?: number;
    }>,
    options: { globalTimeoutSeconds?: number } = {},
  ): PipelineDefinition {
    const pipelineStages: PipelineStage[] = stages.map((s, i) => ({
      name: s.name || `stage-${i}`,
      description: s.description || "",
      subagentId: s.subagentId,
      timeoutSeconds: s.timeoutSeconds ?? 300,
      blocking: s.blocking ?? true,
      maxRetries: s.maxRetries ?? 3,
    }));

    const pipeline: PipelineDefinition = {
      id: generateId("pipeline", Date.now().toString()),
      name,
      stages: pipelineStages,
      globalTimeoutSeconds: options.globalTimeoutSeconds ?? 600,
    };

    this.pipelines.set(pipeline.id, pipeline);

    log.info(`[Pipeline] 🔧 创建 Pipeline: ${name}`);
    stages.forEach((stage, i) => {
      log.info(`[Pipeline]    阶段 ${i + 1}: ${stage.name} -> ${stage.subagentId}`);
    });

    this.emit("pipelineCreated", pipeline);
    return pipeline;
  }

  /**
   * 提交 Pipeline 任务
   */
  submitPipelineTask(
    pipelineId: string,
    content: string,
    options: { priority?: number; metadata?: Record<string, unknown> } = {},
  ): WorkQueueTask {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} 不存在`);
    }

    const task = this.submitTask(
      `pipeline:${pipeline.name}`,
      content,
      { ...options, metadata: { ...options.metadata, pipelineId } },
    );

    // 设置 Pipeline 阶段信息
    task.pipelineStage = {
      currentStage: 0,
      totalStages: pipeline.stages.length,
      stageName: pipeline.stages[0]!.name,
    };

    // 分配给第一个阶段
    const firstStage = pipeline.stages[0]!;
    task.assignedTo = firstStage.subagentId;

    log.info(`[Pipeline] 🚀 Pipeline 任务: ${task.id.slice(0, 8)}... -> ${pipeline.name}`);
    
    // 立即启动第一阶段
    this.startTask(task.id, firstStage.subagentId);

    return task;
  }

  /**
   * 推进到 Pipeline 下一阶段
   */
  private advancePipeline(task: WorkQueueTask): void {
    if (!task.pipelineStage) return;

    const pipeline = this.pipelines.get(task.metadata.pipelineId as string);
    if (!pipeline) return;

    const currentIdx = task.pipelineStage.currentStage;
    const nextIdx = currentIdx + 1;

    if (nextIdx >= pipeline.stages.length) {
      // Pipeline 完成
      log.info(`[Pipeline] 🎉 Pipeline 完成: ${task.id.slice(0, 8)}...`);
      this.emit("pipelineCompleted", { task, pipeline });
      return;
    }

    // 推进到下一阶段
    const nextStage = pipeline.stages[nextIdx]!;
    task.pipelineStage.currentStage = nextIdx;
    task.pipelineStage.stageName = nextStage.name;
    task.status = "assigned";
    task.assignedTo = nextStage.subagentId;

    log.info(`[Pipeline] ⏭️ 阶段 ${nextIdx + 1}/${pipeline.stages.length}: ${nextStage.name} -> ${nextStage.subagentId}`);
    
    // 发送前一阶段结果给下一阶段
    const message = `前一阶段 (${pipeline.stages[currentIdx]!.name}) 结果:\n${task.result}\n\n` +
                    `当前阶段任务: ${nextStage.description}`;
    
    this.adapter.sendMessageToSubagent(nextStage.subagentId, {
      message,
      timeoutSeconds: nextStage.timeoutSeconds,
      waitForReply: false,
    }).then(() => {
      task.status = "processing";
      this.emit("pipelineStageStarted", { task, stage: nextStage });
    });
  }

  // ========================================================================
  // 查询和统计
  // ========================================================================

  /**
   * 获取任务
   */
  getTask(taskId: string): WorkQueueTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): WorkQueueTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取待处理任务
   */
  getPendingTasks(): WorkQueueTask[] {
    return this.getAllTasks().filter(t => t.status === "pending");
  }

  /**
   * 获取子代理的当前任务
   */
  getSubagentTask(subagentId: string): WorkQueueTask | undefined {
    return this.getAllTasks().find(t => 
      t.assignedTo === subagentId && 
      (t.status === "assigned" || t.status === "processing")
    );
  }

  /**
   * 获取队列统计
   */
  getStats(): WorkQueueStats {
    const all = this.getAllTasks();
    return {
      pending: all.filter(t => t.status === "pending").length,
      processing: all.filter(t => t.status === "processing").length,
      completed: all.filter(t => t.status === "completed").length,
      failed: all.filter(t => t.status === "failed").length,
      total: all.length,
    };
  }

  /**
   * 获取 Pipeline 定义
   */
  getPipeline(pipelineId: string): PipelineDefinition | undefined {
    return this.pipelines.get(pipelineId);
  }

  /**
   * 获取所有 Pipeline
   */
  getAllPipelines(): PipelineDefinition[] {
    return Array.from(this.pipelines.values());
  }

  // ========================================================================
  // 内部方法
  // ========================================================================

  /**
   * 按优先级插入队列
   */
  private insertByPriority(taskId: string, priority: number): void {
    // 找到第一个优先级小于等于当前任务的位置
    let insertIndex = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      const existingTask = this.tasks.get(this.taskQueue[i]);
      if (existingTask && existingTask.priority < priority) {
        insertIndex = i;
        break;
      }
    }
    this.taskQueue.splice(insertIndex, 0, taskId);
  }

  /**
   * 为子代理找到最佳任务
   */
  private findBestTaskForSubagent(subagentId: string): string | null {
    // 简单实现：返回最高优先级的待处理任务
    // 未来可以扩展为基于子代理能力的匹配
    for (const taskId of this.taskQueue) {
      const task = this.tasks.get(taskId);
      if (task && task.status === "pending") {
        return taskId;
      }
    }
    return null;
  }

  /**
   * 处理队列
   */
  private processQueue(): void {
    // 自动分配任务给空闲的子代理
    if (this.config.assignmentStrategy !== "least-loaded") return;

    const activeSubagents = this.adapter.getActiveSubagents();
    
    for (const subagent of activeSubagents) {
      // 检查子代理是否已有任务
      const existingTask = this.getSubagentTask(subagent.subagentId);
      if (existingTask) continue;

      // 分配新任务
      const task = this.claimTask(subagent.subagentId);
      if (task) {
        this.startTask(task.id, subagent.subagentId);
      }
    }
  }

  /**
   * 清理过期任务
   */
  private cleanupExpiredTasks(): void {
    const now = Date.now();
    const expiredTasks: string[] = [];

    for (const [id, task] of this.tasks) {
      const age = now - task.createdAt;
      if (age > this.config.taskExpiryMs) {
        expiredTasks.push(id);
      }
    }

    for (const id of expiredTasks) {
      this.tasks.delete(id);
      const queueIndex = this.taskQueue.indexOf(id);
      if (queueIndex > -1) {
        this.taskQueue.splice(queueIndex, 1);
      }
    }

    if (expiredTasks.length > 0) {
      log.debug(`[WorkQueue] 清理 ${expiredTasks.length} 个过期任务`);
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createSubagentWorkQueue(
  adapter: SubagentExecutionAdapter,
  config?: Partial<WorkQueueConfig>,
): SubagentWorkQueue {
  return new SubagentWorkQueue(adapter, config);
}
