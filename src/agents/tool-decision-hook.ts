/**
 * 工具调用决策钩子 - 将决策系统集成到工具调用流程
 *
 * 集成点:
 * - before_tool_call: 决策是否允许工具、选择执行策略
 * - after_tool_call: 收集反馈
 */

import type { HookContext } from "./pi-tools.before-tool-call.js";
import { getDecisionIntegration, type ToolDecisionContext } from "../cognitive-core/integration/DecisionIntegration.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { normalizeToolName } from "./tool-policy.js";

const log = createSubsystemLogger("tool-decision");

// ============================================================================
// 配置
// ============================================================================

/** 是否启用工具决策 - 默认禁用，避免干扰正常工具调用 */
const ENABLE_TOOL_DECISION = process.env.NSEM_ENABLE_TOOL_DECISION === "true";

/** 需要确认的危险工具 */
const DANGEROUS_TOOLS = new Set([
  "exec", "bash", "shell",
  "write", "edit", 
  "delete", "remove",
  "docker", "container",
]);

/** 工具调用历史（用于上下文） */
const toolCallHistory = new Map<string, Array<{ toolName: string; success: boolean; duration: number }>>();
const MAX_HISTORY_PER_SESSION = 50;

// ============================================================================
// 决策钩子
// ============================================================================

/**
 * 工具调用前决策
 * @returns { blocked: true, reason } 阻止调用
 * @returns { blocked: false, params, strategy } 允许调用，可能修改参数
 */
export async function decideToolCall(args: {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  ctx?: HookContext;
}): Promise<
  | { blocked: true; reason: string }
  | { blocked: false; params: unknown; strategy: "direct" | "sandbox" | "dry_run"; decisionId: string }
> {
  if (!ENABLE_TOOL_DECISION) {
    return { blocked: false, params: args.params, strategy: "direct", decisionId: "" };
  }

  const toolName = normalizeToolName(args.toolName || "tool");
  const sessionKey = args.ctx?.sessionKey || "unknown";

  try {
    const integration = getDecisionIntegration();
    
    // 构建决策上下文
    const decisionContext: ToolDecisionContext = {
      toolName,
      toolParams: args.params,
      sessionKey,
      agentId: args.ctx?.agentId || "unknown",
      recentToolCalls: getToolCallHistory(sessionKey),
      loopDetected: false, // 由调用方提供
      userIntent: undefined,
    };

    // 1. 决策：是否允许工具
    const allowDecision = await integration.decideToolAllow(decisionContext);
    
    if (!allowDecision.allow) {
      log.info(`决策阻止工具调用: ${toolName} (decisionId: ${allowDecision.decisionId})`);
      
      // 记录阻止决策，等待后续反馈（如用户覆盖）
      recordPendingFeedback(allowDecision.decisionId, "tool_allow", toolName);
      
      return {
        blocked: true,
        reason: allowDecision.requireConfirm
          ? `决策系统建议确认后再执行 ${toolName}`
          : `决策系统阻止了 ${toolName} 的调用`,
      };
    }

    // 2. 决策：执行策略
    const strategyDecision = await integration.decideToolStrategy(decisionContext);
    
    // 3. 可能修改参数（根据策略）
    let modifiedParams = args.params;
    if (strategyDecision.strategy === "dry_run") {
      modifiedParams = addDryRunFlag(args.params);
    } else if (strategyDecision.strategy === "sandbox" && toolName === "exec") {
      modifiedParams = ensureSandboxExecution(args.params);
    }

    // 记录决策，等待执行后反馈
    recordPendingFeedback(strategyDecision.decisionId, "tool_strategy", toolName);

    log.debug(`工具决策: ${toolName} -> ${strategyDecision.strategy} (decisionId: ${strategyDecision.decisionId})`);

    return {
      blocked: false,
      params: modifiedParams,
      strategy: (strategyDecision.strategy || "direct") as "direct" | "sandbox" | "dry_run",
      decisionId: strategyDecision.decisionId,
    };
  } catch (err) {
    log.error(`工具决策失败: ${toolName} - ${err instanceof Error ? err.message : String(err)}`);
    // 失败时允许调用，避免阻塞
    return { blocked: false, params: args.params, strategy: "direct", decisionId: "" };
  }
}

/**
 * 工具调用后反馈
 */
export function submitToolCallFeedback(args: {
  toolName: string;
  decisionId: string;
  success: boolean;
  duration: number;
  error?: string;
  sessionKey?: string;
}): void {
  if (!ENABLE_TOOL_DECISION || !args.decisionId) {
    return;
  }

  try {
    const integration = getDecisionIntegration();
    
    integration.submitToolFeedback(
      args.decisionId,
      args.toolName,
      args.success,
      args.duration,
      args.error,
    );

    // 更新历史
    addToolCallHistory(args.sessionKey || "unknown", {
      toolName: args.toolName,
      success: args.success,
      duration: args.duration,
    });

    log.debug(`工具反馈已提交: ${args.toolName} success=${args.success}`);
  } catch (err) {
    log.debug(`提交工具反馈失败: ${args.toolName}`);
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 待处理反馈记录 */
const pendingFeedback = new Map<string, { type: string; toolName: string; timestamp: number }>();

function recordPendingFeedback(decisionId: string, type: string, toolName: string): void {
  pendingFeedback.set(decisionId, { type, toolName, timestamp: Date.now() });
  
  // 清理过期记录
  const now = Date.now();
  for (const [id, data] of pendingFeedback) {
    if (now - data.timestamp > 300000) { // 5分钟过期
      pendingFeedback.delete(id);
    }
  }
}

function getToolCallHistory(sessionKey: string): Array<{ toolName: string; success: boolean; duration: number }> {
  return toolCallHistory.get(sessionKey) || [];
}

function addToolCallHistory(
  sessionKey: string, 
  call: { toolName: string; success: boolean; duration: number }
): void {
  let history = toolCallHistory.get(sessionKey);
  if (!history) {
    history = [];
    toolCallHistory.set(sessionKey, history);
  }
  
  history.push(call);
  if (history.length > MAX_HISTORY_PER_SESSION) {
    history.shift();
  }
}

function addDryRunFlag(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return { dry_run: true, original: params };
  }
  return { ...params, dry_run: true };
}

function ensureSandboxExecution(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return { sandbox: true, original: params };
  }
  return { ...params, sandbox: true };
}

// ============================================================================
// 统计和监控
// ============================================================================

export function getToolDecisionStats() {
  const integration = getDecisionIntegration();
  return {
    ...integration.getStats(),
    pendingFeedback: pendingFeedback.size,
  };
}

export function resetToolDecisionHistory(sessionKey?: string): void {
  if (sessionKey) {
    toolCallHistory.delete(sessionKey);
  } else {
    toolCallHistory.clear();
  }
}
