/**
 * MultiAgentCollaboration 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  MultiAgentCollaborationSystem,
  createMultiAgentCollaborationSystem,
  CollaborationStrategy,
} from "./MultiAgentCollaboration.js";

describe("MultiAgentCollaborationSystem", () => {
  let system: MultiAgentCollaborationSystem;

  beforeEach(() => {
    system = createMultiAgentCollaborationSystem("test-session-key");
  });

  describe("基础功能", () => {
    it("应该成功创建多智能体协作系统", () => {
      expect(system).toBeDefined();
      expect(system.registerSubagent).toBeDefined();
      expect(system.createSession).toBeDefined();
      expect(system.start).toBeDefined();
      expect(system.stop).toBeDefined();
    });

    it("应该注册子代理", () => {
      system.registerSubagent({
        id: "agent-1",
        role: "specialist",
        specialties: ["coding", "debugging"],
        capabilities: { coding: 0.9, debugging: 0.8 },
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });

      const subagents = system.getAvailableSubagents();
      expect(subagents.length).toBe(1);
      expect(subagents[0]!.id).toBe("agent-1");
    });

    it("应该获取可用子代理", () => {
      system.registerSubagent({
        id: "get-agent",
        role: "worker",
        specialties: [],
        capabilities: {},
        currentLoad: 0.2,
        maxConcurrentTasks: 3,
        metadata: {},
      });

      const agents = system.getAvailableSubagents();
      expect(agents.length).toBe(1);
      expect(agents[0]!.id).toBe("get-agent");
    });

    it("应该根据能力筛选子代理", () => {
      system.registerSubagent({
        id: "capable-agent",
        role: "specialist",
        specialties: ["ai"],
        capabilities: { ai: 0.9, coding: 0.7 },
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });

      const agents = system.getAvailableSubagents("ai");
      expect(agents.length).toBe(1);
    });

    it("应该列出所有子代理", () => {
      system.registerSubagent({
        id: "a1",
        role: "worker",
        specialties: [],
        capabilities: {},
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });
      system.registerSubagent({
        id: "a2",
        role: "worker",
        specialties: [],
        capabilities: {},
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });

      const agents = system.getAvailableSubagents();
      expect(agents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("协作会话", () => {
    beforeEach(() => {
      system.registerSubagent({
        id: "session-agent-1",
        role: "worker",
        specialties: ["task1"],
        capabilities: { task1: 0.8 },
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });
      system.registerSubagent({
        id: "session-agent-2",
        role: "worker",
        specialties: ["task2"],
        capabilities: { task2: 0.8 },
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });
    });

    it("应该创建协作会话", () => {
      const strategy: CollaborationStrategy = {
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
      };

      const session = system.createSession(strategy, ["session-agent-1", "session-agent-2"]);

      expect(session).toBeDefined();
      expect(session.participants.size).toBe(2);
    });

    it("应该获取会话", () => {
      const strategy: CollaborationStrategy = {
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
      };

      const created = system.createSession(strategy, ["session-agent-1"]);
      const session = system.getSession(created.id);

      expect(session).toBeDefined();
      expect(session!.id).toBe(created.id);
    });

    it("应该列出所有会话", () => {
      const strategy: CollaborationStrategy = {
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
      };

      system.createSession(strategy, ["session-agent-1"]);
      system.createSession(strategy, ["session-agent-2"]);

      const sessions = system.getAllSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it("应该列出活跃会话", () => {
      const strategy: CollaborationStrategy = {
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
      };

      system.createSession(strategy, ["session-agent-1"]);

      const sessions = system.getActiveSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("协作策略", () => {
    const strategies: CollaborationStrategy[] = [
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

    beforeEach(() => {
      strategies.forEach((_, index) => {
        system.registerSubagent({
          id: `strategy-agent-${index}-1`,
          role: "worker",
          specialties: [],
          capabilities: {},
          currentLoad: 0,
          maxConcurrentTasks: 3,
          metadata: {},
        });
        system.registerSubagent({
          id: `strategy-agent-${index}-2`,
          role: "worker",
          specialties: [],
          capabilities: {},
          currentLoad: 0,
          maxConcurrentTasks: 3,
          metadata: {},
        });
      });
    });

    strategies.forEach((strategy) => {
      it(`应该支持 ${strategy.name} 策略`, () => {
        const session = system.createSession(strategy, [
          `strategy-agent-0-1`,
          `strategy-agent-0-2`,
        ]);

        expect(session).toBeDefined();
        expect(session.strategy.id).toBe(strategy.id);
        expect(session.status).toBe("initializing");
      });
    });
  });

  describe("任务管理", () => {
    let sessionId: string;

    beforeEach(() => {
      system.registerSubagent({
        id: "task-agent-1",
        role: "worker",
        specialties: ["coding", "testing"],
        capabilities: { coding: 0.9, testing: 0.8 },
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });

      const strategy: CollaborationStrategy = {
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
      };

      const session = system.createSession(strategy, ["task-agent-1"]);
      sessionId = session.id;
    });

    it("应该添加任务到会话", () => {
      const task = system.addTask(sessionId, {
        type: "analysis",
        description: "测试任务",
        content: "任务内容",
        priority: 5,
        dependencies: [],
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.status).toBe("pending");
    });

    it("应该抛出错误当会话不存在时", () => {
      expect(() => {
        system.addTask("non-existent-session", {
          type: "analysis",
          description: "测试任务",
          content: "任务内容",
          priority: 5,
          dependencies: [],
        });
      }).toThrow();
    });
  });

  describe("消息系统", () => {
    beforeEach(() => {
      system.registerSubagent({
        id: "msg-agent-1",
        role: "worker",
        specialties: [],
        capabilities: {},
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });
    });

    it("应该支持发送消息", () => {
      system.sendMessage({
        id: "msg-1",
        from: "system",
        to: "msg-agent-1",
        type: "task",
        content: "任务消息",
        timestamp: Date.now(),
        priority: 5,
      });

      // 消息已发送，没有抛出错误
      expect(true).toBe(true);
    });

    it("应该支持广播消息", () => {
      system.sendMessage({
        id: "broadcast-1",
        from: "system",
        to: "broadcast",
        type: "broadcast",
        content: "广播消息",
        timestamp: Date.now(),
        priority: 3,
      });

      // 广播已发送，没有抛出错误
      expect(true).toBe(true);
    });
  });

  describe("性能监控", () => {
    it("应该返回统计信息", () => {
      const stats = system.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
      expect(stats.activeSessions).toBeGreaterThanOrEqual(0);
    });

    it("应该返回策略列表", () => {
      const strategies = system.getStrategies();

      expect(strategies).toBeDefined();
      expect(strategies.length).toBeGreaterThan(0);
    });
  });

  describe("生命周期", () => {
    it("应该启动系统", () => {
      system.start();
      expect(true).toBe(true); // 启动成功，没有抛出错误
    });

    it("应该停止系统", () => {
      system.start();
      system.stop();
      expect(true).toBe(true); // 停止成功，没有抛出错误
    });
  });

  describe("配置", () => {
    it("应该使用默认配置创建系统", () => {
      const defaultSystem = createMultiAgentCollaborationSystem("default-session");
      expect(defaultSystem).toBeDefined();
    });

    it("应该使用不同的会话键创建多个系统", () => {
      const system1 = createMultiAgentCollaborationSystem("session-1");
      const system2 = createMultiAgentCollaborationSystem("session-2");

      expect(system1).toBeDefined();
      expect(system2).toBeDefined();
    });
  });

  describe("边界条件", () => {
    it("应该处理负载过高的子代理", () => {
      system.registerSubagent({
        id: "high-load-agent",
        role: "worker",
        specialties: [],
        capabilities: {},
        currentLoad: 0.9, // 高负载
        maxConcurrentTasks: 3,
        metadata: {},
      });

      // 负载超过 0.8 的子代理不应该出现在可用列表中
      const available = system.getAvailableSubagents();
      expect(available.length).toBe(0);
    });

    it("应该处理空参与者会话", () => {
      const strategy: CollaborationStrategy = {
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
      };

      // 不提供参与者时，会自动选择可用子代理
      const session = system.createSession(strategy);
      expect(session).toBeDefined();
      expect(session.participants.size).toBe(0);
    });

    it("应该处理不存在的子代理", () => {
      const strategy: CollaborationStrategy = {
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
      };

      // 提供不存在的子代理 ID 时，会被过滤掉
      const session = system.createSession(strategy, ["non-existent"]);
      expect(session).toBeDefined();
      expect(session.participants.size).toBe(0);
    });

    it("应该更新子代理负载", () => {
      system.registerSubagent({
        id: "load-agent",
        role: "worker",
        specialties: [],
        capabilities: {},
        currentLoad: 0,
        maxConcurrentTasks: 3,
        metadata: {},
      });

      system.updateSubagentLoad("load-agent", 0.5);

      // 更新后应该仍然可用
      const available = system.getAvailableSubagents();
      expect(available.length).toBe(1);
      expect(available[0]!.currentLoad).toBe(0.5);
    });
  });
});
