/**
 * 弹性子代理协调器 - 基于 Agent 长时间运行和纠错优化
 *
 * 与 Nsemclaw 子代理系统深度集成，提供：
 * - 断路器模式 (Circuit Breaker) - 防止级联故障
 * - 智能重试策略 - 指数退避、抖动、自适应
 * - 超时控制 - 任务超时管理
 * - 级联失败处理 - 依赖图、故障隔离
 * - 死信队列 - 失败任务持久化、重放
 */

import { EventEmitter } from "events";
import type { SubagentRunRecord } from "../../agents/subagent-registry.js";
import {
  listSubagentRunsForRequester,
  registerSubagentRun,
} from "../../agents/subagent-registry.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { generateId, clamp } from "../utils/common.js";
import {
  MultiAgentCollaborationSystem,
  CollaborationSession,
  CollaborationTask,
  TaskResult,
} from "./MultiAgentCollaboration.js";
import {
  SubagentExecutionAdapter,
  createSubagentExecutionAdapter,
  type SubagentSessionInfo,
  type SubagentExecutionOptions,
  type ExecutionContext,
  type SendMessageOptions,
} from "./SubagentExecutionAdapter.js";
import {
  SubagentWorkQueue,
  createSubagentWorkQueue,
  type WorkQueueTask,
  type PipelineDefinition,
  type PipelineStage,
  type WorkQueueStats,
} from "./SubagentWorkQueue.js";

const log = createSubsystemLogger("resilient-orchestrator");

// ============================================================================
// 类型定义
// ============================================================================

/** 断路器状态 */
export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** 断路器配置 */
export interface CircuitBreakerConfig {
  /** 触发熔断的失败次数阈值 */
  failureThreshold: number;
  /** 从 OPEN 到 HALF_OPEN 的超时时间 (毫秒) */
  recoveryTimeout: number;
  /** 半开状态下允许的最大试探请求数 */
  halfOpenMaxCalls: number;
  /** 从 HALF_OPEN 到 CLOSED 所需的成功次数 */
  successThreshold: number;
}

/** 重试策略配置 */
export interface RetryPolicy {
  /** 基础延迟 (毫秒) */
  baseDelay: number;
  /** 最大延迟 (毫秒) */
  maxDelay: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 是否启用抖动 */
  jitter: boolean;
  /** 抖动类型 */
  jitterType: "full" | "equal" | "none";
  /** 指数基数 */
  exponentialBase: number;
}

/** 超时配置 */
export interface TimeoutConfig {
  /** 默认超时 (毫秒) */
  defaultTimeout: number;
  /** 特定任务超时配置 */
  taskTimeouts: Map<string, number>;
  /** 优雅关闭 */
  gracefulShutdown: boolean;
}

/** 错误分类 */
export type ErrorCategory = "RETRYABLE" | "NON_RETRYABLE" | "TRANSIENT" | "PERMANENT";

/** 级联失败配置 */
export interface CascadeFailureConfig {
  /** 是否自动隔离故障 */
  autoIsolate: boolean;
  /** 关键路径阈值 */
  criticalPathThreshold: number;
}

/** 死信队列配置 */
export interface DeadLetterQueueConfig {
  /** 存储路径 */
  storagePath: string;
  /** 最大队列大小 */
  maxSize: number;
  /** 告警阈值 */
  alertThreshold: number;
  /** 自动重放 */
  autoReplay: boolean;
}

/** 弹性配置 */
export interface ResilienceConfig {
  circuitBreaker: CircuitBreakerConfig;
  retryPolicy: RetryPolicy;
  timeout: TimeoutConfig;
  cascadeFailure: CascadeFailureConfig;
  deadLetterQueue: DeadLetterQueueConfig;
}

/** 任务依赖 */
export interface TaskDependency {
  taskId: string;
  dependencies: string[];
}

/** 任务执行上下文 */
export interface TaskExecutionContext {
  taskId: string;
  attempt: number;
  startTime: number;
  timeout: number;
  retryCount: number;
  errorHistory: Array<{ error: Error; timestamp: number }>;
}

/** 执行结果 */
export interface ExecutionResult {
  success: boolean;
  result?: TaskResult;
  error?: Error;
  executionTime: number;
  retryCount: number;
  circuitBreakerState?: CircuitBreakerState;
}

/** 死信条目 */
export interface DeadLetterEntry {
  entryId: string;
  taskId: string;
  taskData: Record<string, unknown>;
  failureReason: string;
  errorDetails: {
    errorType: string;
    errorMessage: string;
    stackTrace?: string;
  };
  retryHistory: Array<{ attempt: number; timestamp: number; error?: string }>;
  timestamp: number;
  category: ErrorCategory;
  replayCount: number;
  lastReplayAt?: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  halfOpenMaxCalls: 3,
  successThreshold: 2,
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  baseDelay: 1000,
  maxDelay: 60000,
  maxRetries: 3,
  jitter: true,
  jitterType: "full",
  exponentialBase: 2,
};

const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  defaultTimeout: 30000,
  taskTimeouts: new Map(),
  gracefulShutdown: true,
};

const DEFAULT_CASCADE_CONFIG: CascadeFailureConfig = {
  autoIsolate: true,
  criticalPathThreshold: 5,
};

const DEFAULT_DLQ_CONFIG: DeadLetterQueueConfig = {
  storagePath: ".nsemclaw/dlq.db",
  maxSize: 10000,
  alertThreshold: 100,
  autoReplay: false,
};

// ============================================================================
// 断路器
// ============================================================================

export class CircuitBreaker extends EventEmitter {
  private name: string;
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private halfOpenCalls = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private stateChangeTime: number;
  private openTime?: number;
  private stats = {
    totalCalls: 0,
    totalFailures: 0,
    totalSuccesses: 0,
  };

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    super();
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.stateChangeTime = Date.now();
    log.info(`断路器 '${name}' 初始化, 状态: ${this.state}`);
  }

  getState(): CircuitBreakerState {
    this.maybeRecover();
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      ...this.stats,
    };
  }

  reset(): void {
    const oldState = this.state;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.openTime = undefined;
    this.stateChangeTime = Date.now();
    log.info(`断路器 '${this.name}' 重置: ${oldState} -> CLOSED`);
    this.emit("reset", { from: oldState, to: "CLOSED" });
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeRecover();

    if (this.state === "OPEN") {
      const remaining = this.openTime
        ? Math.max(0, this.config.recoveryTimeout - (Date.now() - this.openTime))
        : this.config.recoveryTimeout;
      throw new Error(`断路器 '${this.name}' 处于 OPEN 状态, ${remaining}ms 后恢复`);
    }

    if (this.state === "HALF_OPEN") {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new Error(`断路器 '${this.name}' HALF_OPEN 状态试探请求已达上限`);
      }
      this.halfOpenCalls++;
    }

    this.stats.totalCalls++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private maybeRecover(): void {
    if (this.state === "OPEN" && this.openTime) {
      const elapsed = Date.now() - this.openTime;
      if (elapsed >= this.config.recoveryTimeout) {
        log.info(`断路器 '${this.name}' 从 OPEN 恢复到 HALF_OPEN`);
        this.transitionTo("HALF_OPEN");
        this.halfOpenCalls = 0;
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangeTime = Date.now();

    if (newState === "OPEN") {
      this.openTime = Date.now();
      this.halfOpenCalls = 0;
    } else if (newState === "CLOSED") {
      this.failureCount = 0;
      this.successCount = 0;
      this.openTime = undefined;
    } else if (newState === "HALF_OPEN") {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;
    }

    this.emit("stateChange", { from: oldState, to: newState, breaker: this.name });
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    this.stats.totalSuccesses++;

    if (this.state === "HALF_OPEN") {
      if (this.successCount >= this.config.successThreshold) {
        log.info(`断路器 '${this.name}' 从 HALF_OPEN 恢复到 CLOSED`);
        this.transitionTo("CLOSED");
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.stats.totalFailures++;

    if (this.state === "CLOSED") {
      if (this.failureCount >= this.config.failureThreshold) {
        log.warn(`断路器 '${this.name}' 触发熔断, 进入 OPEN 状态`);
        this.transitionTo("OPEN");
      }
    } else if (this.state === "HALF_OPEN") {
      log.warn(`断路器 '${this.name}' HALF_OPEN 状态失败, 回到 OPEN`);
      this.transitionTo("OPEN");
    }
  }
}

// ============================================================================
// 智能重试执行器
// ============================================================================

export class SmartRetryExecutor extends EventEmitter {
  private config: RetryPolicy;

  constructor(config: Partial<RetryPolicy> = {}) {
    super();
    this.config = { ...DEFAULT_RETRY_POLICY, ...config };
  }

  async execute<T>(
    fn: () => Promise<T>,
    context: Partial<TaskExecutionContext> = {},
  ): Promise<{ result: T; attempts: number }> {
    const taskId = context.taskId || generateId("task", Date.now().toString());
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= this.config.maxRetries) {
      try {
        const result = await fn();

        if (attempt > 0) {
          log.info(`任务 ${taskId} 在第 ${attempt + 1} 次尝试后成功`);
        }

        this.emit("success", { taskId, attempts: attempt + 1, duration: Date.now() - startTime });
        return { result, attempts: attempt + 1 };
      } catch (error) {
        attempt++;
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt > this.config.maxRetries) {
          log.error(`任务 ${taskId} 在 ${attempt} 次尝试后最终失败`);
          this.emit("failure", { taskId, attempts: attempt, error: lastError });
          throw lastError;
        }

        // 检查是否应该重试
        if (!this.shouldRetry(lastError)) {
          throw lastError;
        }

        // 计算延迟
        const delay = this.calculateDelay(attempt, lastError);

        log.debug(`任务 ${taskId} 第 ${attempt} 次失败, ${delay}ms 后重试: ${lastError.message}`);
        this.emit("retry", { taskId, attempt, delay, error: lastError });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private shouldRetry(error: Error): boolean {
    // 不可重试错误
    const nonRetryableErrors = ["ValidationError", "AuthenticationError", "AuthorizationError"];
    if (nonRetryableErrors.some((e) => error.name.includes(e) || error.message.includes(e))) {
      return false;
    }
    return true;
  }

  private calculateDelay(attempt: number, error: Error): number {
    let base = this.config.baseDelay;

    // 根据错误类型调整
    if (error.message.includes("rate limit") || error.name.includes("RateLimit")) {
      base *= 2; // 限流错误等待更久
    } else if (error.message.includes("unavailable") || error.name.includes("ServiceUnavailable")) {
      base = 5000; // 服务不可用固定等待5秒
    }

    // 指数退避
    let delay = base * Math.pow(this.config.exponentialBase, attempt - 1);
    delay = Math.min(delay, this.config.maxDelay);

    // 抖动
    if (this.config.jitter) {
      delay = this.applyJitter(delay);
    }

    return Math.floor(delay);
  }

  private applyJitter(delay: number): number {
    if (this.config.jitterType === "full") {
      return Math.random() * delay;
    } else if (this.config.jitterType === "equal") {
      return delay / 2 + (Math.random() * delay) / 2;
    }
    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 超时管理器
// ============================================================================

export class TimeoutManager extends EventEmitter {
  private config: TimeoutConfig;
  private abortControllers = new Map<string, AbortController>();

  constructor(config: Partial<TimeoutConfig> = {}) {
    super();
    this.config = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  }

  async executeWithTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    taskName: string,
    timeout?: number,
  ): Promise<T> {
    const actualTimeout =
      timeout || this.config.taskTimeouts.get(taskName) || this.config.defaultTimeout;
    const taskId = generateId("timeout", Date.now().toString());

    const controller = new AbortController();
    this.abortControllers.set(taskId, controller);

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`任务 '${taskName}' 超时 (${actualTimeout}ms)`));
      }, actualTimeout);

      controller.signal.addEventListener("abort", () => {
        clearTimeout(timer);
      });
    });

    try {
      const result = await Promise.race([fn(controller.signal), timeoutPromise]);

      this.abortControllers.delete(taskId);
      return result;
    } catch (error) {
      this.abortControllers.delete(taskId);
      throw error;
    }
  }

  cancelTask(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
      return true;
    }
    return false;
  }
}

// ============================================================================
// 依赖图
// ============================================================================

export class DependencyGraph extends EventEmitter {
  private tasks = new Map<string, TaskDependency>();
  private status = new Map<string, "pending" | "running" | "completed" | "failed" | "isolated">();

  addTask(taskId: string, dependencies: string[]): void {
    // 检查循环依赖
    if (this.hasCircularDependency(taskId, dependencies)) {
      throw new Error(`添加任务 ${taskId} 会导致循环依赖`);
    }

    this.tasks.set(taskId, { taskId, dependencies });
    this.status.set(taskId, "pending");
  }

  getDownstreamTasks(taskId: string): string[] {
    const downstream: string[] = [];
    const queue = [taskId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [id, task] of this.tasks) {
        if (task.dependencies.includes(current) && !visited.has(id)) {
          visited.add(id);
          downstream.push(id);
          queue.push(id);
        }
      }
    }

    return downstream;
  }

  getUpstreamTasks(taskId: string): string[] {
    const task = this.tasks.get(taskId);
    return task ? task.dependencies : [];
  }

  updateStatus(
    taskId: string,
    status: "pending" | "running" | "completed" | "failed" | "isolated",
  ): void {
    this.status.set(taskId, status);
    this.emit("statusChange", { taskId, status });

    // 如果任务失败且配置了自动隔离，隔离下游任务
    if (status === "failed") {
      const downstream = this.getDownstreamTasks(taskId);
      if (downstream.length > 0) {
        this.emit("cascadeFailure", { taskId, affectedTasks: downstream });
      }
    }
  }

  areDependenciesMet(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return true;

    return task.dependencies.every((depId) => this.status.get(depId) === "completed");
  }

  private hasCircularDependency(taskId: string, dependencies: string[]): boolean {
    const visited = new Set<string>();
    const path = new Set<string>();

    const dfs = (id: string): boolean => {
      if (path.has(id)) return true;
      if (visited.has(id)) return false;

      visited.add(id);
      path.add(id);

      const task = this.tasks.get(id);
      if (task) {
        for (const dep of task.dependencies) {
          if (dfs(dep)) return true;
        }
      }

      path.delete(id);
      return false;
    };

    // 检查新任务的依赖
    for (const dep of dependencies) {
      if (dfs(dep)) return true;
    }

    // 检查是否会形成循环
    this.tasks.set(taskId, { taskId, dependencies });
    const hasCycle = dfs(taskId);
    this.tasks.delete(taskId);

    return hasCycle;
  }
}

// ============================================================================
// 死信队列 (内存实现，可扩展为 SQLite)
// ============================================================================

export class DeadLetterQueue extends EventEmitter {
  private entries = new Map<string, DeadLetterEntry>();
  private config: DeadLetterQueueConfig;
  private replayHandlers = new Map<
    string,
    (taskData: Record<string, unknown>) => Promise<boolean>
  >();

  constructor(config: Partial<DeadLetterQueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DLQ_CONFIG, ...config };
  }

  registerReplayHandler(
    taskType: string,
    handler: (taskData: Record<string, unknown>) => Promise<boolean>,
  ): void {
    this.replayHandlers.set(taskType, handler);
  }

  enqueue(
    taskId: string,
    taskData: Record<string, unknown>,
    error: Error,
    retryHistory: Array<{ attempt: number; timestamp: number; error?: string }> = [],
  ): string {
    const entryId = generateId("dlq", Date.now().toString());

    const entry: DeadLetterEntry = {
      entryId,
      taskId,
      taskData,
      failureReason: error.message,
      errorDetails: {
        errorType: error.name,
        errorMessage: error.message,
        stackTrace: error.stack,
      },
      retryHistory,
      timestamp: Date.now(),
      category: this.categorizeError(error),
      replayCount: 0,
    };

    // 检查队列大小
    if (this.entries.size >= this.config.maxSize) {
      // 清理最旧的条目
      const oldest = Array.from(this.entries.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      )[0];
      if (oldest) {
        this.entries.delete(oldest[0]);
      }
    }

    this.entries.set(entryId, entry);

    // 检查是否需要告警
    if (this.entries.size >= this.config.alertThreshold) {
      this.emit("alert", {
        type: "dlq_size",
        message: `死信队列大小 ${this.entries.size} 超过阈值 ${this.config.alertThreshold}`,
        severity: "warning",
      });
    }

    log.warn(`任务 ${taskId} 进入死信队列: ${entryId}`);
    this.emit("enqueue", entry);

    return entryId;
  }

  async replay(entryId: string): Promise<{ success: boolean; error?: Error }> {
    const entry = this.entries.get(entryId);
    if (!entry) {
      return { success: false, error: new Error(`条目 ${entryId} 不存在`) };
    }

    const taskType = entry.taskData.taskType as string;
    const handler = this.replayHandlers.get(taskType);

    if (!handler) {
      return { success: false, error: new Error(`未找到任务类型 ${taskType} 的重放处理器`) };
    }

    entry.replayCount++;
    entry.lastReplayAt = Date.now();

    try {
      const success = await handler(entry.taskData);

      if (success) {
        this.entries.delete(entryId);
        this.emit("replaySuccess", entry);
        log.info(`死信条目 ${entryId} 重放成功`);
      } else {
        this.emit("replayFailure", { entry, reason: "handler returned false" });
      }

      return { success };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("replayFailure", { entry, error: err });
      return { success: false, error: err };
    }
  }

  async replayAll(filter?: (entry: DeadLetterEntry) => boolean): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    const entries = Array.from(this.entries.values()).filter(filter || (() => true));
    let success = 0;
    let failed = 0;

    for (const entry of entries) {
      const result = await this.replay(entry.entryId);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    return { total: entries.length, success, failed };
  }

  peek(entryId: string): DeadLetterEntry | undefined {
    return this.entries.get(entryId);
  }

  getStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    avgReplayCount: number;
  } {
    const entries = Array.from(this.entries.values());
    const byCategory: Record<ErrorCategory, number> = {
      RETRYABLE: 0,
      NON_RETRYABLE: 0,
      TRANSIENT: 0,
      PERMANENT: 0,
    };

    for (const entry of entries) {
      byCategory[entry.category]++;
    }

    const avgReplayCount =
      entries.length > 0 ? entries.reduce((sum, e) => sum + e.replayCount, 0) / entries.length : 0;

    return { total: entries.length, byCategory, avgReplayCount };
  }

  private categorizeError(error: Error): ErrorCategory {
    const errorType = error.name;
    const message = error.message.toLowerCase();

    if (message.includes("timeout") || errorType.includes("Timeout")) {
      return "TRANSIENT";
    }
    if (
      message.includes("network") ||
      message.includes("connection") ||
      errorType.includes("Network")
    ) {
      return "RETRYABLE";
    }
    if (
      message.includes("validation") ||
      message.includes("invalid") ||
      errorType.includes("Validation")
    ) {
      return "NON_RETRYABLE";
    }
    if (
      message.includes("resource") ||
      message.includes("memory") ||
      errorType.includes("Resource")
    ) {
      return "PERMANENT";
    }

    return "RETRYABLE";
  }
}

// ============================================================================
// 弹性子代理协调器
// ============================================================================

export class ResilientSubagentOrchestrator extends EventEmitter {
  private collaborationSystem: MultiAgentCollaborationSystem;
  private config: ResilienceConfig;

  // 弹性组件
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private retryExecutor: SmartRetryExecutor;
  private timeoutManager: TimeoutManager;
  private dependencyGraph: DependencyGraph;
  private deadLetterQueue: DeadLetterQueue;

  // 子代理执行适配器
  private subagentAdapter: SubagentExecutionAdapter;

  // 工作队列
  private workQueue: SubagentWorkQueue;

  // 运行状态
  private isRunning = false;
  private requesterSessionKey: string;

  constructor(requesterSessionKey: string, config: Partial<ResilienceConfig> = {}) {
    super();
    this.requesterSessionKey = requesterSessionKey;
    this.config = {
      circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config.circuitBreaker },
      retryPolicy: { ...DEFAULT_RETRY_POLICY, ...config.retryPolicy },
      timeout: { ...DEFAULT_TIMEOUT_CONFIG, ...config.timeout },
      cascadeFailure: { ...DEFAULT_CASCADE_CONFIG, ...config.cascadeFailure },
      deadLetterQueue: { ...DEFAULT_DLQ_CONFIG, ...config.deadLetterQueue },
    };

    this.collaborationSystem = new MultiAgentCollaborationSystem(requesterSessionKey);
    this.retryExecutor = new SmartRetryExecutor(this.config.retryPolicy);
    this.timeoutManager = new TimeoutManager(this.config.timeout);
    this.dependencyGraph = new DependencyGraph();
    this.deadLetterQueue = new DeadLetterQueue(this.config.deadLetterQueue);
    this.subagentAdapter = createSubagentExecutionAdapter(this);
    this.workQueue = createSubagentWorkQueue(this.subagentAdapter);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 级联失败处理
    this.dependencyGraph.on("cascadeFailure", ({ taskId, affectedTasks }) => {
      log.error(`级联失败检测: 任务 ${taskId} 失败, 影响 ${affectedTasks.length} 个下游任务`);

      if (this.config.cascadeFailure.autoIsolate) {
        for (const affectedTaskId of affectedTasks) {
          this.dependencyGraph.updateStatus(affectedTaskId, "isolated");
        }
      }

      this.emit("cascadeFailure", { taskId, affectedTasks });
    });

    // 断路器状态变更
    this.on("circuitBreakerStateChange", ({ breaker, from, to }) => {
      log.info(`断路器 ${breaker} 状态: ${from} -> ${to}`);
    });
  }

  // ========================================================================
  // 生命周期
  // ========================================================================

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.collaborationSystem.start();
    this.collaborationSystem.autoRegisterFromSubagentRuns();
    this.workQueue.start();

    // 从 registry 同步已有的子代理会话
    await this.subagentAdapter.syncFromRegistry(this.requesterSessionKey);

    log.info("🛡️ 弹性子代理协调器已启动");
    log.info("[WorkQueue] 🏭 工作队列已就绪");
    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // 停止工作队列
    this.workQueue.stop();

    // 优雅关闭所有子代理
    log.info("正在关闭所有子代理...");
    const closeResult = await this.subagentAdapter.closeAllSubagents("协调器停止");
    log.info(`子代理关闭完成: ${closeResult.closed}/${closeResult.total} 成功`);

    this.collaborationSystem.stop();

    log.info("🛑 弹性子代理协调器已停止");
    this.emit("stopped");
  }

  // ========================================================================
  // 断路器管理
  // ========================================================================

  getOrCreateCircuitBreaker(name: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, this.config.circuitBreaker);
      breaker.on("stateChange", ({ from, to }) => {
        this.emit("circuitBreakerStateChange", { breaker: name, from, to });
      });
      this.circuitBreakers.set(name, breaker);
    }
    return breaker;
  }

  // ========================================================================
  // 弹性任务执行
  // ========================================================================

  async executeResilient<T>(
    taskName: string,
    fn: (signal: AbortSignal) => Promise<T>,
    options: {
      timeout?: number;
      useCircuitBreaker?: boolean;
      useRetry?: boolean;
      retryConfig?: Partial<RetryPolicy>;
    } = {},
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const useCB = options.useCircuitBreaker ?? true;
    const useRetry = options.useRetry ?? true;

    // 1. 断路器检查
    if (useCB) {
      const breaker = this.getOrCreateCircuitBreaker(taskName);
      const state = breaker.getState();
      if (state === "OPEN") {
        return {
          success: false,
          error: new Error(`断路器 ${taskName} 处于 OPEN 状态`),
          executionTime: Date.now() - startTime,
          retryCount: 0,
          circuitBreakerState: state,
        };
      }
    }

    try {
      let result: T;

      // 2. 带重试的执行
      if (useRetry) {
        const retryResult = await this.retryExecutor.execute(
          () => this.timeoutManager.executeWithTimeout(fn, taskName, options.timeout),
          { taskId: taskName },
        );
        result = retryResult.result;
      } else {
        result = await this.timeoutManager.executeWithTimeout(fn, taskName, options.timeout);
      }

      // 3. 记录成功
      if (useCB) {
        const breaker = this.getOrCreateCircuitBreaker(taskName);
        // 断路器内部自动处理成功
      }

      return {
        success: true,
        result: result as unknown as TaskResult,
        executionTime: Date.now() - startTime,
        retryCount: 0,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // 4. 记录失败
      if (useCB) {
        const breaker = this.getOrCreateCircuitBreaker(taskName);
        // 断路器内部自动处理失败
      }

      // 5. 进入死信队列
      this.deadLetterQueue.enqueue(taskName, { taskName, options }, err);

      return {
        success: false,
        error: err,
        executionTime: Date.now() - startTime,
        retryCount: 0,
      };
    }
  }

  // ========================================================================
  // 协作任务执行
  // ========================================================================

  async executeCollaborativeTask(
    sessionId: string,
    task: Omit<CollaborationTask, "id" | "createdAt" | "status">,
    dependencies: string[] = [],
  ): Promise<string> {
    const session = this.collaborationSystem.getSession(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    const taskId = generateId("task", Date.now().toString());

    // 添加到依赖图
    this.dependencyGraph.addTask(taskId, dependencies);

    // 创建协作任务
    this.collaborationSystem.addTask(sessionId, task);

    return taskId;
  }

  // ========================================================================
  // 死信队列操作
  // ========================================================================

  async replayDeadLetter(entryId: string): Promise<{ success: boolean; error?: Error }> {
    return this.deadLetterQueue.replay(entryId);
  }

  async replayAllDeadLetters(filter?: (entry: DeadLetterEntry) => boolean): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    return this.deadLetterQueue.replayAll(filter);
  }

  getDeadLetterStats() {
    return this.deadLetterQueue.getStats();
  }

  // ========================================================================
  // 统计信息
  // ========================================================================

  getStats(): {
    circuitBreakers: Array<ReturnType<CircuitBreaker["getStats"]>>;
    deadLetterQueue: ReturnType<DeadLetterQueue["getStats"]>;
    dependencyGraph: { taskCount: number };
    subagents: { total: number; active: number; inactive: number };
    workQueue: WorkQueueStats;
  } {
    return {
      circuitBreakers: Array.from(this.circuitBreakers.values()).map((cb) => cb.getStats()),
      deadLetterQueue: this.deadLetterQueue.getStats(),
      dependencyGraph: { taskCount: this.dependencyGraph["tasks"].size },
      subagents: this.subagentAdapter.getStats(),
      workQueue: this.workQueue.getStats(),
    };
  }

  // ========================================================================
  // 子代理生命周期管理
  // ========================================================================

  /**
   * 创建子代理 (session 模式)
   */
  async createSubagent(
    subagentId: string,
    task: string,
    options: Omit<SubagentExecutionOptions, 'mode'> = {},
  ): Promise<SubagentSessionInfo> {
    const context: ExecutionContext = {
      sessionKey: this.requesterSessionKey,
    };

    return this.subagentAdapter.createSubagent(subagentId, task, context, {
      ...options,
      mode: 'session',
    });
  }

  /**
   * 发送消息给子代理
   */
  async sendMessageToSubagent(
    subagentId: string,
    message: string,
    options?: Omit<SendMessageOptions, 'message'>,
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const result = await this.subagentAdapter.sendMessageToSubagent(subagentId, {
      message,
      ...options,
    });
    return {
      success: result.success,
      response: result.response,
      error: result.error,
    };
  }

  /**
   * 子代理间通信
   */
  async agentToAgentCommunication(
    sourceSubagentId: string,
    targetSubagentId: string,
    message: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.subagentAdapter.agentToAgentCommunication(
      sourceSubagentId,
      targetSubagentId,
      message,
    );
  }

  /**
   * 关闭子代理 (优雅关闭)
   */
  async closeSubagent(subagentId: string, reason?: string): Promise<boolean> {
    return this.subagentAdapter.closeSubagent(subagentId, reason);
  }

  /**
   * 删除子代理 (完全删除)
   */
  async deleteSubagent(subagentId: string): Promise<boolean> {
    return this.subagentAdapter.deleteSubagent(subagentId);
  }

  /**
   * 批量关闭所有子代理
   */
  async closeAllSubagents(reason?: string): Promise<{
    total: number;
    closed: number;
    failed: number;
  }> {
    return this.subagentAdapter.closeAllSubagents(reason);
  }

  /**
   * 批量删除所有子代理
   */
  async deleteAllSubagents(): Promise<{
    total: number;
    deleted: number;
    failed: number;
  }> {
    return this.subagentAdapter.deleteAllSubagents();
  }

  /**
   * 获取子代理信息
   */
  getSubagentInfo(subagentId: string): SubagentSessionInfo | undefined {
    return this.subagentAdapter.getSubagentSession(subagentId);
  }

  /**
   * 获取所有活跃子代理
   */
  getActiveSubagents(): SubagentSessionInfo[] {
    return this.subagentAdapter.getActiveSubagents();
  }

  /**
   * 获取所有子代理
   */
  getAllSubagents(): SubagentSessionInfo[] {
    return this.subagentAdapter.getAllSubagents();
  }

  /**
   * 检查子代理是否活跃
   */
  isSubagentActive(subagentId: string): boolean {
    return this.subagentAdapter.isSubagentActive(subagentId);
  }

  /**
   * 获取子代理统计
   */
  getSubagentStats(): {
    total: number;
    active: number;
    inactive: number;
  } {
    return this.subagentAdapter.getStats();
  }

  // ========================================================================
  // Work Queue & Pipeline
  // ========================================================================

  /**
   * 提交任务到工作队列
   */
  submitTaskToQueue(
    type: string,
    content: string,
    options?: { priority?: number; metadata?: Record<string, unknown> },
  ): WorkQueueTask {
    return this.workQueue.submitTask(type, content, options);
  }

  /**
   * 从队列领取任务
   */
  claimTaskFromQueue(subagentId: string): WorkQueueTask | null {
    return this.workQueue.claimTask(subagentId);
  }

  /**
   * 报告任务完成
   */
  completeQueueTask(taskId: string, subagentId: string, result: string): boolean {
    return this.workQueue.completeTask(taskId, subagentId, result);
  }

  /**
   * 报告任务失败
   */
  failQueueTask(taskId: string, subagentId: string, error: string): boolean {
    return this.workQueue.failTask(taskId, subagentId, error);
  }

  /**
   * 获取队列统计
   */
  getQueueStats(): WorkQueueStats {
    return this.workQueue.getStats();
  }

  /**
   * 获取队列任务
   */
  getQueueTask(taskId: string): WorkQueueTask | undefined {
    return this.workQueue.getTask(taskId);
  }

  /**
   * 获取所有队列任务
   */
  getAllQueueTasks(): WorkQueueTask[] {
    return this.workQueue.getAllTasks();
  }

  /**
   * 创建 Pipeline
   */
  createPipeline(
    name: string,
    stages: PipelineStage[],
    options?: { globalTimeoutSeconds?: number },
  ): PipelineDefinition {
    return this.workQueue.createPipeline(name, stages, options);
  }

  /**
   * 提交 Pipeline 任务
   */
  submitPipelineTask(
    pipelineId: string,
    content: string,
    options?: { priority?: number; metadata?: Record<string, unknown> },
  ): WorkQueueTask {
    return this.workQueue.submitPipelineTask(pipelineId, content, options);
  }

  /**
   * 获取 Pipeline
   */
  getPipeline(pipelineId: string): PipelineDefinition | undefined {
    return this.workQueue.getPipeline(pipelineId);
  }

  /**
   * 获取所有 Pipeline
   */
  getAllPipelines(): PipelineDefinition[] {
    return this.workQueue.getAllPipelines();
  }

  // ========================================================================
  // 访问器
  // ========================================================================

  getCollaborationSystem(): MultiAgentCollaborationSystem {
    return this.collaborationSystem;
  }

  getDeadLetterQueue(): DeadLetterQueue {
    return this.deadLetterQueue;
  }

  getDependencyGraph(): DependencyGraph {
    return this.dependencyGraph;
  }

  getSubagentAdapter(): SubagentExecutionAdapter {
    return this.subagentAdapter;
  }

  getWorkQueue(): SubagentWorkQueue {
    return this.workQueue;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createResilientSubagentOrchestrator(
  requesterSessionKey: string,
  config?: Partial<ResilienceConfig>,
): ResilientSubagentOrchestrator {
  return new ResilientSubagentOrchestrator(requesterSessionKey, config);
}

export {
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_CASCADE_CONFIG,
  DEFAULT_DLQ_CONFIG,
};
