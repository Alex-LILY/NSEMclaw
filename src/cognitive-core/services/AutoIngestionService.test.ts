/**
 * AutoIngestionService 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AutoIngestionService, createAutoIngestionService } from "./AutoIngestionService.js";

// Mock NSEM2Core
const mockIngest = vi.fn();
const mockActivate = vi.fn();

const mockCore = {
  ingest: mockIngest,
  activate: mockActivate,
};

describe("AutoIngestionService", () => {
  let service: AutoIngestionService;

  beforeEach(() => {
    mockIngest.mockReset();
    mockActivate.mockReset();

    mockIngest.mockImplementation((content: string, meta: any) =>
      Promise.resolve({
        id: `atom-${Date.now()}`,
        content,
        contentType: meta.type,
        createdAt: Date.now(),
      }),
    );

    mockActivate.mockResolvedValue({ atoms: [] });

    service = createAutoIngestionService(mockCore as any);
  });

  afterEach(() => {
    service.stop();
  });

  describe("生命周期", () => {
    it("应该成功创建服务", () => {
      expect(service).toBeDefined();
      expect(service.start).toBeDefined();
      expect(service.stop).toBeDefined();
    });

    it("应该启动服务", () => {
      service.start();
      expect(service.isRunning()).toBe(true);
    });

    it("应该停止服务", () => {
      service.start();
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it("重复启动应该安全", () => {
      service.start();
      expect(() => service.start()).not.toThrow();
    });
  });

  describe("会话管理", () => {
    it("应该开始新会话", () => {
      service.start();
      service.startSession("session-1", { agentId: "test-agent" });

      const session = service.getSession("session-1");
      expect(session).toBeDefined();
      expect(session?.id).toBe("session-1");
    });

    it("应该结束会话", () => {
      service.start();
      service.startSession("session-end", { agentId: "test" });

      service.endSession("session-end");

      // 会话结束后应该被移除
      const session = service.getSession("session-end");
      expect(session).toBeUndefined();
    });

    it("应该获取会话", () => {
      service.start();
      service.startSession("session-get", { agentId: "test" });

      const session = service.getSession("session-get");
      expect(session).toBeDefined();
      expect(session?.id).toBe("session-get");
    });

    it("获取不存在的会话应该返回undefined", () => {
      const session = service.getSession("non-existent");
      expect(session).toBeUndefined();
    });

    it("应该获取所有活跃会话", () => {
      service.start();
      service.startSession("s1", { agentId: "a1" });
      service.startSession("s2", { agentId: "a2" });

      const sessions = service.getActiveSessions();
      expect(sessions.length).toBe(2);
    });
  });

  describe("消息处理", () => {
    beforeEach(() => {
      service.start();
      service.startSession("msg-session", { agentId: "test" });
    });

    it("应该添加消息到会话", () => {
      service.addMessage("msg-session", {
        role: "user",
        content: "你好",
      });

      const session = service.getSession("msg-session");
      expect(session?.messages.length).toBeGreaterThan(0);
    });

    it("应该添加多条消息", () => {
      service.addMessage("msg-session", { role: "user", content: "问题1" });
      service.addMessage("msg-session", { role: "assistant", content: "回答1" });
      service.addMessage("msg-session", { role: "user", content: "问题2" });

      const session = service.getSession("msg-session");
      expect(session?.messages.length).toBe(3);
    });

    it("添加消息到不存在的会话应该不抛出错误", () => {
      expect(() => {
        service.addMessage("non-existent", {
          role: "user",
          content: "测试",
        });
      }).not.toThrow();
    });

    it("应该支持不同角色", () => {
      const roles = ["user", "assistant", "system"] as const;

      roles.forEach((role, i) => {
        service.addMessage("msg-session", {
          role,
          content: `消息${i}`,
        });
      });

      const session = service.getSession("msg-session");
      expect(session?.messages.length).toBe(3);
    });
  });

  describe("规则管理", () => {
    it("应该获取所有默认规则", () => {
      const rules = service.getAllRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it("应该添加新规则", () => {
      const newRule = {
        id: "test-rule",
        name: "测试规则",
        trigger: {
          type: "conversation-end" as const,
          minMessages: 2,
        },
        extraction: {
          extractFacts: true,
          extractInsights: false,
          summarize: true,
          includeContext: false,
        },
        ingestion: {
          scope: "local" as const,
          importance: "auto" as const,
          tags: ["test"],
          deduplicate: true,
        },
        enabled: true,
      };

      service.addRule(newRule);
      const rule = service.getRule("test-rule");
      expect(rule).toBeDefined();
      expect(rule?.name).toBe("测试规则");
    });

    it("应该删除规则", () => {
      const newRule = {
        id: "rule-to-remove",
        name: "待删除规则",
        trigger: {
          type: "conversation-end" as const,
        },
        extraction: {
          extractFacts: true,
          extractInsights: false,
          summarize: false,
          includeContext: false,
        },
        ingestion: {
          scope: "local" as const,
          importance: "auto" as const,
          tags: ["test"],
          deduplicate: true,
        },
        enabled: true,
      };

      service.addRule(newRule);
      expect(service.getRule("rule-to-remove")).toBeDefined();

      const deleted = service.removeRule("rule-to-remove");
      expect(deleted).toBe(true);
      expect(service.getRule("rule-to-remove")).toBeUndefined();
    });

    it("应该更新规则", () => {
      const ruleId = "default-conversation-end";
      const updated = service.updateRule(ruleId, { enabled: false });

      expect(updated).toBe(true);
      const rule = service.getRule(ruleId);
      expect(rule?.enabled).toBe(false);
    });

    it("应该启用/禁用规则", () => {
      const ruleId = "default-conversation-end";

      service.disableRule(ruleId);
      expect(service.getRule(ruleId)?.enabled).toBe(false);

      service.enableRule(ruleId);
      expect(service.getRule(ruleId)?.enabled).toBe(true);
    });
  });

  describe("自动摄入", () => {
    beforeEach(() => {
      service.start();
    });

    it("会话结束时应该触发摄入", async () => {
      // 启用默认规则并设置较低阈值
      service.updateRule("default-conversation-end", {
        enabled: true,
        trigger: {
          type: "conversation-end",
          minMessages: 1,
          minDurationMs: 0,
        },
      });

      service.startSession("ingest-session", { agentId: "test" });

      // 添加包含事实模式的消息以触发摄入
      service.addMessage("ingest-session", {
        role: "user",
        content: "我的名字是张三。请记住这个重要信息。",
      });

      // 添加助手回复
      service.addMessage("ingest-session", {
        role: "assistant",
        content: "好的，我会记住你的名字是张三。",
      });

      // 添加第三条消息以满足最小消息数
      service.addMessage("ingest-session", {
        role: "user",
        content: "谢谢你的帮助。",
      });

      service.endSession("ingest-session");

      // 等待异步处理
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 验证摄入被调用（因为消息中包含事实模式）
      expect(mockIngest).toHaveBeenCalled();
    });

    it("应该处理摄入失败", async () => {
      mockIngest.mockRejectedValueOnce(new Error("Ingestion failed"));

      service.updateRule("default-conversation-end", {
        enabled: true,
        trigger: {
          type: "conversation-end",
          minMessages: 1,
          minDurationMs: 0,
        },
      });

      service.startSession("fail-session", { agentId: "test" });
      service.addMessage("fail-session", { role: "user", content: "内容" });

      // 不应该抛出未处理错误
      expect(() => {
        service.endSession("fail-session");
      }).not.toThrow();

      // 等待异步处理
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe("历史记录", () => {
    beforeEach(() => {
      service.start();
    });

    it("应该清空历史记录", async () => {
      service.updateRule("default-conversation-end", {
        enabled: true,
        trigger: {
          type: "conversation-end",
          minMessages: 1,
          minDurationMs: 0,
        },
      });

      service.startSession("history-session", { agentId: "test" });
      service.addMessage("history-session", { role: "user", content: "内容" });
      service.endSession("history-session");

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证历史记录存在
      const history = service.getIngestionHistory("history-session");
      expect(history).toBeDefined();

      // 清空历史
      service.clearHistory();

      const allHistory = service.getAllIngestionHistory();
      expect(allHistory.size).toBe(0);
    });
  });

  describe("统计信息", () => {
    beforeEach(() => {
      service.start();
    });

    it("应该返回统计信息", () => {
      const stats = service.getStats();

      expect(stats).toBeDefined();
      expect(stats.rules).toBeDefined();
      expect(stats.sessions).toBeDefined();
      expect(stats.ingestion).toBeDefined();
    });

    it("统计应该反映规则数量", () => {
      const stats = service.getStats();
      expect(stats.rules.total).toBeGreaterThan(0);
      expect(stats.rules.enabled).toBeGreaterThanOrEqual(0);
    });

    it("统计应该反映活跃会话", () => {
      service.startSession("stats-session", { agentId: "test" });

      const stats = service.getStats();
      expect(stats.sessions.active).toBe(1);
    });
  });

  describe("边界条件", () => {
    beforeEach(() => {
      service.start();
    });

    it("应该处理空消息", () => {
      service.startSession("empty-msg", { agentId: "test" });

      expect(() => {
        service.addMessage("empty-msg", { role: "user", content: "" });
      }).not.toThrow();
    });

    it("应该处理超长消息", () => {
      service.startSession("long-msg", { agentId: "test" });

      const longContent = "a".repeat(100000);

      expect(() => {
        service.addMessage("long-msg", { role: "user", content: longContent });
      }).not.toThrow();
    });

    it("重复结束会话应该安全", () => {
      service.startSession("double-end", { agentId: "test" });
      service.endSession("double-end");

      // 再次结束应该不抛出错误
      expect(() => {
        service.endSession("double-end");
      }).not.toThrow();
    });

    it("获取不存在规则的历史应该返回undefined", () => {
      const history = service.getIngestionHistory("non-existent");
      expect(history).toBeUndefined();
    });
  });
});
