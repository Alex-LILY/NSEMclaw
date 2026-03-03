/**
 * 多智能体协作模块 - P3
 *
 * 与 Nsemclaw 子代理系统集成
 */

export {
  MultiAgentCollaborationSystem,
  createMultiAgentCollaborationSystem,
  DEFAULT_STRATEGIES,
  type AgentRole,
  type TaskType,
  type SubagentConfig,
  type CollaborationTask,
  type TaskResult,
  type CollaborationStrategy,
  type CollaborationSession,
  type AgentMessage,
  type CollaborationStats,
} from "./MultiAgentCollaboration.js";

/**
 * 子代理执行适配器 - 集成真实子代理系统
 */
export {
  SubagentExecutionAdapter,
  createSubagentExecutionAdapter,
  type SubagentExecutionOptions,
  type ExecutionContext,
  type SubagentSessionInfo,
  type SendMessageOptions,
} from "./SubagentExecutionAdapter.js";

/**
 * 弹性子代理协调器 - 基于 Agent 长时间运行和纠错优化
 *
 * 集成：断路器、智能重试、超时控制、级联失败处理、死信队列
 */

export {
  // 核心协调器
  ResilientSubagentOrchestrator,
  createResilientSubagentOrchestrator,
  // 弹性组件
  CircuitBreaker,
  SmartRetryExecutor,
  TimeoutManager,
  DependencyGraph,
  DeadLetterQueue,
  // 默认配置
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_CASCADE_CONFIG,
  DEFAULT_DLQ_CONFIG,
  type CircuitBreakerState,
  type CircuitBreakerConfig,
  type RetryPolicy,
  type TimeoutConfig,
  type ErrorCategory,
  type CascadeFailureConfig,
  type DeadLetterQueueConfig,
  type ResilienceConfig,
  type TaskDependency,
  type TaskExecutionContext,
  type ExecutionResult,
  type DeadLetterEntry,
} from "./ResilientSubagentOrchestrator.js";

/**
 * 子代理工作队列 - Work Queue & Pipeline 模式
 *
 * 功能：任务队列、Pipeline 流程、自动分配
 */
export {
  SubagentWorkQueue,
  createSubagentWorkQueue,
  type WorkQueueTask,
  type WorkQueueTaskStatus,
  type PipelineStage,
  type PipelineDefinition,
  type WorkQueueConfig,
  type WorkQueueStats,
} from "./SubagentWorkQueue.js";
