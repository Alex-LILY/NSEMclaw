/**
 * SelectiveMemoryInheritance 集成测试
 * 验证认知核心工具与三层记忆架构的集成
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createCognitiveCoreTool } from "../src/agents/tools/cognitive-core-tool.js";
import { createSelectiveMemoryInheritance } from "../src/cognitive-core/memory/SelectiveMemoryInheritance.js";

describe("SelectiveMemoryInheritance Integration", () => {
  const agentId = "test-agent-1";
  const parentAgentId = "parent-agent-1";

  beforeEach(() => {
    // 每个测试前清理
  });

  describe("三层记忆架构", () => {
    it("应该支持 personal 范围的记忆存储和检索", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      // 存储个人记忆
      const storeResult = await tool.execute("test-1", {
        action: "memory_store",
        agent_id: agentId,
        memory_content: "这是我的个人记忆",
        memory_scope: "personal",
        memory_type: "fact",
      });

      expect(storeResult.status).toBe("ok");
      expect(storeResult.scope).toBe("personal");

      // 检索记忆
      const retrieveResult = await tool.execute("test-2", {
        action: "memory_retrieve",
        agent_id: agentId,
        query: "个人记忆",
        memory_scope: "personal",
      });

      expect(retrieveResult.status).toBe("ok");
      expect(retrieveResult.result_count).toBeGreaterThan(0);
    });

    it("应该支持 shared 范围的记忆存储", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      const storeResult = await tool.execute("test-3", {
        action: "memory_store",
        agent_id: agentId,
        memory_content: "这是共享记忆内容",
        memory_scope: "shared",
        memory_type: "insight",
        memory_tags: ["shared", "important"],
      });

      expect(storeResult.status).toBe("ok");
      expect(storeResult.scope).toBe("shared");
    });

    it("应该支持跨范围的统一检索", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      // 不指定范围，检索所有层
      const retrieveResult = await tool.execute("test-4", {
        action: "memory_retrieve",
        agent_id: agentId,
        query: "记忆",
        max_results: 10,
      });

      expect(retrieveResult.status).toBe("ok");
      expect(retrieveResult.scopes).toContain("inherited");
      expect(retrieveResult.scopes).toContain("shared");
      expect(retrieveResult.scopes).toContain("personal");
    });
  });

  describe("记忆继承", () => {
    it("应该支持从父 Agent 继承记忆", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      const inheritResult = await tool.execute("test-5", {
        action: "inherit_memory",
        agent_id: agentId,
        parent_agent_id: parentAgentId,
        inheritance_strategy: "filtered",
        min_importance: 0.5,
      });

      expect(inheritResult.status).toBe("ok");
      expect(inheritResult.parent_agent_id).toBe(parentAgentId);
      expect(inheritResult.strategy).toBe("filtered");
    });

    it("应该支持对继承记忆添加注释", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      // 先继承记忆
      await tool.execute("test-6", {
        action: "inherit_memory",
        agent_id: agentId,
        parent_agent_id: parentAgentId,
      });

      // 添加注释
      const annotateResult = await tool.execute("test-7", {
        action: "memory_annotate",
        agent_id: agentId,
        memory_id: "test-memory-1",
        annotation: "这是一条重要继承记忆的注释",
      });

      expect(annotateResult.status).toBe("ok");
    });
  });

  describe("记忆快照", () => {
    it("应该支持创建记忆快照", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      const snapshotResult = await tool.execute("test-8", {
        action: "memory_snapshot",
        agent_id: agentId,
        snapshot_name: "test-snapshot-1",
      });

      expect(snapshotResult.status).toBe("ok");
      expect(snapshotResult.name).toBe("test-snapshot-1");
    });

    it("应该支持从快照恢复记忆", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      // 先创建快照
      await tool.execute("test-9", {
        action: "memory_snapshot",
        agent_id: agentId,
        snapshot_name: "test-snapshot-restore",
      });

      // 恢复快照
      const restoreResult = await tool.execute("test-10", {
        action: "memory_restore",
        agent_id: agentId,
        snapshot_name: "test-snapshot-restore",
      });

      expect(restoreResult.status).toBe("ok");
    });
  });

  describe("记忆统计", () => {
    it("应该返回三层记忆的统计信息", async () => {
      const tool = createCognitiveCoreTool({ agentSessionKey: agentId });

      const statsResult = await tool.execute("test-11", {
        action: "memory_stats",
        agent_id: agentId,
      });

      expect(statsResult.status).toBe("ok");
      expect(statsResult.stats).toHaveProperty("inherited");
      expect(statsResult.stats).toHaveProperty("shared");
      expect(statsResult.stats).toHaveProperty("personal");
      expect(statsResult.stats).toHaveProperty("total");
    });
  });
});

// 直接测试 SelectiveMemoryInheritance 类
describe("SelectiveMemoryInheritance Direct Test", () => {
  it("应该正确创建三层记忆系统", () => {
    const system = createSelectiveMemoryInheritance("test-agent", {
      strategy: "filtered",
      maxInheritedMemories: 100,
      inheritanceDecay: 0.9,
    });

    expect(system).toBeDefined();
    expect(typeof system.store).toBe("function");
    expect(typeof system.retrieve).toBe("function");
    expect(typeof system.inheritFromParent).toBe("function");
    expect(typeof system.createSnapshot).toBe("function");
    expect(typeof system.restoreSnapshot).toBe("function");
    expect(typeof system.annotateInherited).toBe("function");
    expect(typeof system.getStats).toBe("function");
  });
});
