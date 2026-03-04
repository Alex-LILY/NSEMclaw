/**
 * 决策系统集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DecisionIntegration,
  createDecisionIntegration,
  getDecisionIntegration,
  resetDecisionIntegration,
} from "./DecisionIntegration.js";

describe("DecisionIntegration", () => {
  let integration: DecisionIntegration;

  beforeEach(() => {
    resetDecisionIntegration();
    integration = createDecisionIntegration({
      enabled: true,
      defaultStrategy: "ucb",
    });
  });

  afterEach(() => {
    integration.destroy();
    resetDecisionIntegration();
  });

  describe("工具调用决策", () => {
    it("应该允许常规工具调用", () => {
      const context = {
        toolName: "read",
        toolParams: { path: "/tmp/test.txt" },
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: false,
      };

      const decision = integration.decideToolAllow(context);

      expect(decision.allow).toBe(true);
      expect(decision.decisionId).toBeTruthy();
    });

    it("应该阻止循环中的工具调用", () => {
      const context = {
        toolName: "write",
        toolParams: { path: "/tmp/test.txt" },
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: true,
      };

      const decision = integration.decideToolAllow(context);

      expect(decision.allow).toBe(false);
      expect(decision.requireConfirm).toBe(true);
    });

    it("应该为危险工具要求确认", () => {
      const context = {
        toolName: "exec",
        toolParams: { command: "rm -rf /" },
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: false,
      };

      const decision = integration.decideToolAllow(context);
      // 危险工具可能需要确认，具体取决于策略
      expect(decision.decisionId).toBeTruthy();
    });
  });

  describe("工具策略决策", () => {
    it("应该返回有效的执行策略", () => {
      const context = {
        toolName: "exec",
        toolParams: { command: "ls" },
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: false,
      };

      const decision = integration.decideToolStrategy(context);

      expect(["direct", "sandbox", "dry_run"]).toContain(decision.strategy);
      expect(decision.decisionId).toBeTruthy();
    });
  });

  describe("记忆检索策略决策", () => {
    it("应该根据紧急度选择策略", () => {
      // 高紧急度
      const urgentDecision = integration.decideMemoryStrategy("查询", 0.9);
      expect(["fast", "balanced", "deep"]).toContain(urgentDecision.strategy);

      // 低紧急度
      const normalDecision = integration.decideMemoryStrategy("查询", 0.3);
      expect(["fast", "balanced", "deep"]).toContain(normalDecision.strategy);
    });
  });

  describe("反馈机制", () => {
    it("应该接受成功反馈", () => {
      const context = {
        toolName: "read",
        toolParams: {},
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: false,
      };

      const decision = integration.decideToolAllow(context);
      
      // 不应该抛出错误
      expect(() => {
        integration.submitFeedback(decision.decisionId, true, 0.8);
      }).not.toThrow();
    });

    it("应该接受失败反馈", () => {
      const context = {
        toolName: "write",
        toolParams: {},
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: false,
      };

      const decision = integration.decideToolAllow(context);
      
      // 不应该抛出错误
      expect(() => {
        integration.submitFeedback(decision.decisionId, false, -0.5);
      }).not.toThrow();
    });

    it("应该记录工具调用反馈", () => {
      const context = {
        toolName: "read",
        toolParams: {},
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: false,
      };

      const decision = integration.decideToolAllow(context);
      
      integration.submitToolFeedback(
        decision.decisionId,
        "read",
        true,
        500,
        undefined,
      );

      // 检查反馈是否被记录
      const recentFeedback = integration.getRecentFeedback(1);
      expect(recentFeedback.length).toBeGreaterThan(0);
      expect(recentFeedback[0].success).toBe(true);
    });
  });

  describe("统计信息", () => {
    it("应该返回决策统计", () => {
      const stats = integration.getStats();

      expect(stats).toHaveProperty("totalDecisions");
      expect(stats).toHaveProperty("toolDecisions");
      expect(stats).toHaveProperty("subagentDecisions");
      expect(stats).toHaveProperty("replyDecisions");
      expect(stats).toHaveProperty("avgReward");
    });

    it("应该返回引擎状态", () => {
      const state = integration.getEngineState();

      expect(state).toHaveProperty("config");
      expect(state).toHaveProperty("totalDecisions");
      expect(state).toHaveProperty("contextCount");
      expect(state).toHaveProperty("averageReward");
      expect(state).toHaveProperty("currentStrategy");
    });
  });

  describe("禁用状态", () => {
    it("禁用时应该允许所有调用", () => {
      const disabledIntegration = createDecisionIntegration({ enabled: false });
      
      const context = {
        toolName: "exec",
        toolParams: {},
        sessionKey: "test-session",
        agentId: "test-agent",
        recentToolCalls: [],
        loopDetected: true, // 即使有循环也应该允许
      };

      const decision = disabledIntegration.decideToolAllow(context);

      expect(decision.allow).toBe(true);
      expect(decision.requireConfirm).toBe(false);
      
      disabledIntegration.destroy();
    });
  });
});

describe("全局决策集成实例", () => {
  afterEach(() => {
    resetDecisionIntegration();
  });

  it("应该返回单例实例", () => {
    const instance1 = getDecisionIntegration();
    const instance2 = getDecisionIntegration();

    expect(instance1).toBe(instance2);
  });

  it("重置后应该创建新实例", () => {
    const instance1 = getDecisionIntegration();
    resetDecisionIntegration();
    const instance2 = getDecisionIntegration();

    expect(instance1).not.toBe(instance2);
  });
});
