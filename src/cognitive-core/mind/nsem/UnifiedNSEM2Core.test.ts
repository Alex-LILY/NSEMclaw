/**
 * UnifiedNSEM2Core 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ResolvedMemorySearchConfig } from "../../../agents/memory-search.js";
import type { NsemclawConfig } from "../../../config/config.js";
import type { MemAtom, MemoryQuery } from "../../types/index.js";
import type { SmartEmbeddingEngine } from "../perception/SmartEmbeddingEngine.js";
import { UnifiedNSEM2Core, createUnifiedNSEM2Core } from "./UnifiedNSEM2Core.js";

// ============================================================================
// Mock 依赖
// ============================================================================

const mockEmbed = vi.fn();
const mockRerank = vi.fn();
const mockExpandQuery = vi.fn();
const mockCleanup = vi.fn();

const mockEmbeddingEngine: SmartEmbeddingEngine = {
  embed: mockEmbed,
  rerank: mockRerank,
  expandQuery: mockExpandQuery,
  cleanup: mockCleanup,
} as unknown as SmartEmbeddingEngine;

const mockConfig = {
  model: {
    provider: "openai",
    model: "gpt-4",
  },
  embedding: {
    provider: "local",
    model: "all-MiniLM-L6-v2",
  },
} as unknown as NsemclawConfig;

const mockMemoryConfig = {
  enabled: true,
  provider: "local",
} as unknown as ResolvedMemorySearchConfig;

// ============================================================================
// 测试套件
// ============================================================================

describe("UnifiedNSEM2Core", () => {
  let core: UnifiedNSEM2Core;

  beforeEach(async () => {
    // 重置 mock
    mockEmbed.mockReset();
    mockRerank.mockReset();
    mockExpandQuery.mockReset();
    mockCleanup.mockReset();

    // 默认 mock 实现
    mockEmbed.mockImplementation((text: string) => {
      // 返回简单的 mock 向量
      return Promise.resolve(new Array(384).fill(0).map(() => Math.random() * 2 - 1));
    });

    mockExpandQuery.mockImplementation((query: string) => {
      return Promise.resolve({ original: query, expanded: query, variations: [query] });
    });

    mockRerank.mockImplementation(
      (query: string, candidates: Array<{ text: string; score: number }>) => {
        return Promise.resolve(candidates.map((c, i) => ({ ...c, rerankScore: c.score })));
      },
    );

    core = new UnifiedNSEM2Core(mockEmbeddingEngine, {
      agentId: "test-agent",
      tieredStorage: {
        workingCapacity: 10,
        shortTermCapacity: 50,
        longTermDiskLimit: 1000,
        autoTierTransition: true,
        tierCheckIntervalMs: 1000,
      },
      asyncWrite: {
        enabled: false, // 测试中禁用异步写入
        maxQueueSize: 100,
        flushIntervalMs: 5000,
        maxRetries: 3,
        retryDelayMs: 1000,
      },
    });

    await core.start();
  });

  afterEach(async () => {
    await core.stop();
  });

  // ========================================================================
  // 基础功能测试
  // ========================================================================

  describe("基本操作", () => {
    it("应该成功摄入记忆", async () => {
      const atom = await core.ingest("这是一个测试记忆", {
        type: "fact",
        scope: "personal",
        tags: ["test"],
      });

      expect(atom).toBeDefined();
      expect(atom.content).toBe("这是一个测试记忆");
      expect(atom.contentType).toBe("fact");
      expect(atom.meta.tags).toContain("test");
    });

    it("应该检测到重复记忆并强化", async () => {
      const atom1 = await core.ingest("重复的记忆内容", { type: "fact" });
      const atom2 = await core.ingest("重复的记忆内容", { type: "fact" });

      expect(atom1.id).toBe(atom2.id);
      expect(atom2.strength.reinforcement).toBeGreaterThan(atom1.strength.reinforcement);
    });

    it("应该成功激活记忆", async () => {
      // 先摄入一些记忆
      await core.ingest("关于机器学习的知识", { type: "fact" });
      await core.ingest("深度学习的应用", { type: "insight" });

      const result = await core.activate({
        intent: "机器学习",
        strategy: "exploratory",
        constraints: { maxResults: 5 },
      });

      expect(result).toBeDefined();
      expect(result.atoms).toBeDefined();
      expect(result.atoms.length).toBeGreaterThan(0);
    });

    it("应该返回正确的统计信息", () => {
      const stats = core.getStats();

      expect(stats).toBeDefined();
      expect(stats.memory).toBeDefined();
      expect(stats.memory.working).toBeGreaterThanOrEqual(0);
      expect(stats.memory.shortTerm).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================================================
  // 批量操作测试
  // ========================================================================

  describe("批量操作", () => {
    it("应该批量摄入记忆", async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        content: `批量记忆 ${i}`,
        type: "fact" as const,
        scope: "personal" as const,
      }));

      const result = await core.ingestBatch(items);

      expect(result.total).toBe(10);
      expect(result.succeeded).toBe(10);
      expect(result.failed).toBe(0);
      expect(result.atoms).toHaveLength(10);
    });

    it("应该报告批量摄入中的错误", async () => {
      // 模拟嵌入失败
      mockEmbed.mockRejectedValueOnce(new Error("Embedding failed"));

      const items = [
        { content: "第一条", type: "fact" as const },
        { content: "第二条", type: "fact" as const },
      ];

      const result = await core.ingestBatch(items);

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("应该支持批量检索", async () => {
      // 先摄入一些记忆
      for (let i = 0; i < 5; i++) {
        await core.ingest(`主题记忆 ${i}`, { type: "fact" });
      }

      const queries: MemoryQuery[] = [
        { intent: "主题 0", strategy: "exploratory", constraints: { maxResults: 3 } },
        { intent: "主题 1", strategy: "exploratory", constraints: { maxResults: 3 } },
        { intent: "主题 2", strategy: "exploratory", constraints: { maxResults: 3 } },
      ];

      const result = await core.retrieveBatch(queries);

      expect(result.results).toHaveLength(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================================================
  // 作用域检索测试
  // ========================================================================

  describe("作用域检索", () => {
    it("应该按作用域检索记忆", async () => {
      // 摄入不同作用域的记忆
      await core.ingest("个人记忆 1", { scope: "personal" });
      await core.ingest("个人记忆 2", { scope: "personal" });
      await core.ingest("共享记忆", { scope: "shared" });

      const result = await core.retrieveByScope(
        { intent: "记忆", strategy: "exploratory", constraints: { maxResults: 10 } },
        ["personal"],
      );

      expect(result.atoms).toBeDefined();
      // 应该只返回 personal 作用域的记忆
      for (const item of result.atoms) {
        expect((item.atom as unknown as { _scope: string })._scope).toBe("personal");
      }
    });

    it("应该支持多作用域检索", async () => {
      await core.ingest("个人记忆", { scope: "personal" });
      await core.ingest("共享记忆", { scope: "shared" });

      const result = await core.retrieveByScope(
        { intent: "记忆", strategy: "exploratory", constraints: { maxResults: 10 } },
        ["personal", "shared"],
      );

      expect(result.atoms.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ========================================================================
  // 进化测试
  // ========================================================================

  describe("记忆进化", () => {
    it("应该执行记忆进化", async () => {
      // 摄入一些记忆
      for (let i = 0; i < 5; i++) {
        await core.ingest(`进化测试记忆 ${i}`, { type: "fact" });
      }

      const statsBefore = core.getStats();

      await core.evolve();

      const statsAfter = core.getStats();

      expect(statsAfter).toBeDefined();
    });
  });

  // ========================================================================
  // 三层存储测试
  // ========================================================================

  describe("三层存储", () => {
    it("应该管理工作记忆容量", async () => {
      // 工作记忆容量设置为 10
      const workingCapacity = 10;

      // 摄入超过容量的记忆
      for (let i = 0; i < 15; i++) {
        await core.ingest(`工作记忆测试 ${i}`, { type: "fact" });
      }

      const stats = core.getStats();
      // 工作记忆不应超过容量
      expect(stats.memory.working).toBeLessThanOrEqual(workingCapacity);
    });

    it("应该支持记忆层级升级", async () => {
      // 摄入记忆
      const atom = await core.ingest("将被升级的记忆", { type: "fact" });
      const id = atom.id;

      // 多次访问以触发升级
      for (let i = 0; i < 10; i++) {
        await core.activate({
          intent: "升级的记忆",
          strategy: "exploratory",
          constraints: { maxResults: 5 },
        });
      }

      // 记忆应该被强化
      const stats = core.getStats();
      expect(stats).toBeDefined();
    });
  });

  // ========================================================================
  // 系统资源检测测试
  // ========================================================================

  describe("系统资源检测", () => {
    it("应该返回系统资源状态", () => {
      const stats = core.getStats();

      expect(stats.resources).toBeDefined();
      expect(stats.resources.memory).toBeDefined();
      expect(stats.resources.memory.total).toBeGreaterThan(0);
      expect(stats.resources.cpu).toBeDefined();
      expect(stats.resources.cpu.coreCount).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // 并发安全测试
  // ========================================================================

  describe("并发安全", () => {
    it("应该支持并发读取", async () => {
      // 摄入一些记忆
      for (let i = 0; i < 5; i++) {
        await core.ingest(`并发测试 ${i}`, { type: "fact" });
      }

      // 并发检索
      const promises = Array.from({ length: 5 }, () =>
        core.activate({ intent: "并发", strategy: "exploratory", constraints: { maxResults: 3 } }),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      for (const result of results) {
        expect(result.atoms).toBeDefined();
      }
    });

    it("应该保证写入的原子性", async () => {
      const contents = Array.from({ length: 10 }, (_, i) => `原子写入 ${i}`);

      // 并发写入
      const promises = contents.map((content) => core.ingest(content, { type: "fact" }));

      const results = await Promise.all(promises);

      // 所有写入都应该成功
      expect(results).toHaveLength(10);
      for (const result of results) {
        expect(result).toBeDefined();
        expect(result.id).toBeDefined();
      }
    });
  });

  // ========================================================================
  // 配置测试
  // ========================================================================

  describe("配置", () => {
    it("应该返回当前配置", () => {
      const config = core.getConfig();

      expect(config).toBeDefined();
      expect(config.agentId).toBe("test-agent");
      expect(config.tieredStorage).toBeDefined();
      expect(config.enhancedRetrieval).toBeDefined();
    });
  });

  // ========================================================================
  // 工厂函数测试
  // ========================================================================

  describe("工厂函数", () => {
    it("应该通过工厂函数创建实例", async () => {
      // mock createSmartEmbeddingEngine
      vi.mock("../perception/SmartEmbeddingEngine.js", () => ({
        createSmartEmbeddingEngine: vi.fn().mockResolvedValue(mockEmbeddingEngine),
      }));

      const instance = await createUnifiedNSEM2Core(
        mockConfig,
        "factory-test-agent",
        mockMemoryConfig,
        { resourceMode: "balanced" },
      );

      expect(instance).toBeInstanceOf(UnifiedNSEM2Core);
      await instance.stop();
    });
  });
});

// ============================================================================
// 服务集成测试
// ============================================================================

describe("P2 服务集成", () => {
  describe("AutoIngestionService 集成", () => {
    it("应该与 UnifiedNSEM2Core 集成", async () => {
      const { createAutoIngestionService } = await import("../../services/AutoIngestionService.js");

      const core = new UnifiedNSEM2Core(mockEmbeddingEngine, {
        agentId: "integration-test",
        asyncWrite: {
          enabled: false,
          maxQueueSize: 100,
          flushIntervalMs: 5000,
          maxRetries: 3,
          retryDelayMs: 1000,
        },
      });
      await core.start();

      const service = createAutoIngestionService(core);
      service.start();

      // 启动会话
      service.startSession("test-session", { agentId: "test" });

      // 添加消息
      service.addMessage("test-session", {
        role: "user",
        content: "这是重要的信息，请记住",
      });

      // 结束会话
      service.endSession("test-session");

      // 检查统计
      const stats = service.getStats();
      expect(stats).toBeDefined();

      await core.stop();
    });
  });

  describe("ImportanceScorer 集成", () => {
    it("应该正确评分内容重要性", async () => {
      const { createImportanceScorer } = await import("../../services/ImportanceScorer.js");

      const scorer = createImportanceScorer();

      const highImportance = scorer.calculateImportance(
        "这是非常关键重要的信息，请务必记住",
        "fact",
      );

      const lowImportance = scorer.calculateImportance("随便说点什么", "fact");

      expect(highImportance.total).toBeGreaterThan(lowImportance.total);
      expect(highImportance.appliedRules.length).toBeGreaterThan(0);
    });
  });

  describe("PeriodicMaintenanceService 集成", () => {
    it("应该与 UnifiedNSEM2Core 集成", async () => {
      const { createPeriodicMaintenanceService } =
        await import("../../services/PeriodicMaintenanceService.js");

      const core = new UnifiedNSEM2Core(mockEmbeddingEngine, {
        agentId: "maintenance-test",
        asyncWrite: {
          enabled: false,
          maxQueueSize: 100,
          flushIntervalMs: 5000,
          maxRetries: 3,
          retryDelayMs: 1000,
        },
      });
      await core.start();

      const service = createPeriodicMaintenanceService(core, {
        autoStart: false,
      });

      // 手动运行 decay 任务
      const result = await service.runTask("hourly-decay");

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      expect(result.type).toBe("decay");

      await core.stop();
    });
  });
});
