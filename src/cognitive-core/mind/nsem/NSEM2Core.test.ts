/**
 * NSEM2Core 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ResolvedMemorySearchConfig } from "../../../agents/memory-search.js";
import type { NsemclawConfig } from "../../../config/config.js";
import type { MemAtom, MemoryQuery, Vector } from "../../types/index.js";
import { NSEM2Core, createNSEM2Core } from "./NSEM2Core.js";

// Mock 依赖
const mockEmbed = vi.fn();
const mockRerank = vi.fn();
const mockExpandQuery = vi.fn();

const mockEmbeddingEngine = {
  embed: mockEmbed,
  rerank: mockRerank,
  expandQuery: mockExpandQuery,
  cleanup: vi.fn(),
};

describe("NSEM2Core", () => {
  let core: NSEM2Core;
  const mockConfig = {
    model: { provider: "openai", model: "gpt-4" },
    embedding: { provider: "local", model: "all-MiniLM-L6-v2" },
  } as unknown as NsemclawConfig;

  const mockMemoryConfig = {
    enabled: true,
    provider: "local",
    local: {
      modelCacheDir: "/tmp/test-models",
    },
  } as unknown as ResolvedMemorySearchConfig;

  beforeEach(async () => {
    mockEmbed.mockReset();
    mockRerank.mockReset();
    mockExpandQuery.mockReset();

    mockEmbed.mockImplementation((text: string) => {
      return Promise.resolve(new Array(384).fill(0.1));
    });

    mockExpandQuery.mockImplementation((query: string) => {
      return Promise.resolve({ original: query, expanded: query, variations: [query] });
    });

    mockRerank.mockImplementation((query: string, candidates: any[]) => {
      return Promise.resolve(candidates.map((c, i) => ({ ...c, rerankScore: c.score })));
    });

    core = await createNSEM2Core(mockConfig, "test-agent", mockMemoryConfig);
    await core.start();
  });

  afterEach(async () => {
    await core.stop();
  });

  describe("生命周期", () => {
    it("应该成功启动和停止", async () => {
      const testCore = await createNSEM2Core(mockConfig, "lifecycle-test", mockMemoryConfig);

      await testCore.start();
      const healthAfterStart = await testCore.healthCheck();
      expect(healthAfterStart.checks.running).toBe(true);

      await testCore.stop();
      const healthAfterStop = await testCore.healthCheck();
      expect(healthAfterStop.checks.running).toBe(false);
    });

    it("重复启动应该安全", async () => {
      await core.start();
      await expect(core.start()).resolves.not.toThrow();
    });
  });

  describe("记忆摄入", () => {
    it("应该摄入记忆并返回MemAtom", async () => {
      const atom = await core.ingest("测试记忆内容", {
        type: "fact",
        tags: ["test"],
      });

      expect(atom).toBeDefined();
      expect(atom.content).toBe("测试记忆内容");
      expect(atom.contentType).toBe("fact");
      expect(atom.id).toBeDefined();
    });

    it("应该为摄入的记忆生成嵌入向量", async () => {
      const atom = await core.ingest("嵌入测试", { type: "fact" });

      expect(mockEmbed).toHaveBeenCalled();
      expect(atom.embedding).toBeDefined();
      expect(atom.embedding.length).toBe(384);
    });

    it("应该检测重复内容", async () => {
      const atom1 = await core.ingest("重复内容", { type: "fact" });
      const atom2 = await core.ingest("重复内容", { type: "fact" });

      expect(atom1.id).toBe(atom2.id);
    });

    it("摄入失败应该抛出错误", async () => {
      mockEmbed.mockRejectedValueOnce(new Error("Embedding failed"));

      await expect(core.ingest("失败测试", { type: "fact" })).rejects.toThrow();
    });
  });

  describe("记忆激活", () => {
    it("应该激活相关记忆", async () => {
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

    it("应该使用查询扩展", async () => {
      await core.ingest("测试记忆", { type: "fact" });

      await core.activate({
        intent: "测试",
        strategy: "exploratory",
      });

      expect(mockExpandQuery).toHaveBeenCalled();
    });

    it("应该应用重排序", async () => {
      await core.ingest("记忆A", { type: "fact" });
      await core.ingest("记忆B", { type: "fact" });

      await core.activate({
        intent: "查询",
        strategy: "exploratory",
      });

      expect(mockRerank).toHaveBeenCalled();
    });

    it("没有相关记忆时返回空结果", async () => {
      const result = await core.activate({
        intent: "不相关的查询",
        strategy: "exploratory",
      });

      expect(result.atoms).toEqual([]);
    });
  });

  describe("记忆管理", () => {
    it("应该通过ID获取记忆", async () => {
      const atom = await core.ingest("获取测试", { type: "fact" });
      const retrieved = await core.getAtom(atom.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(atom.id);
    });

    it("删除记忆应该成功", async () => {
      const atom = await core.ingest("删除测试", { type: "fact" });
      const deleted = await core.deleteAtom(atom.id);

      expect(deleted).toBe(true);
      expect(await core.getAtom(atom.id)).toBeNull();
    });

    it("删除不存在的记忆应该返回false", async () => {
      const deleted = await core.deleteAtom("non-existent");
      expect(deleted).toBe(false);
    });

    it("应该更新记忆强度", async () => {
      const atom = await core.ingest("强化测试", { type: "fact" });
      const beforeStrength = atom.strength.current;

      await core.reinforceAtom(atom.id);
      const retrieved = await core.getAtom(atom.id);

      expect(retrieved?.strength.current).toBeGreaterThanOrEqual(beforeStrength);
    });
  });

  describe("记忆进化", () => {
    it("应该执行记忆进化", async () => {
      await core.ingest("进化测试1", { type: "fact" });
      await core.ingest("进化测试2", { type: "fact" });

      const statsBefore = core.getStats();
      await core.evolve();
      const statsAfter = core.getStats();

      expect(statsAfter).toBeDefined();
    });

    it("应该压缩弱记忆", async () => {
      // 添加多个记忆
      for (let i = 0; i < 10; i++) {
        await core.ingest(`压缩测试 ${i}`, { type: "fact" });
      }

      const result = await core.compress();
      expect(result).toBeDefined();
    });
  });

  describe("统计信息", () => {
    it("应该返回统计信息", () => {
      const stats = core.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalAtoms).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsage).toBeDefined();
    });

    it("统计应该反映记忆数量", async () => {
      const before = core.getStats().totalAtoms;

      await core.ingest("统计测试", { type: "fact" });

      const after = core.getStats().totalAtoms;
      expect(after).toBe(before + 1);
    });
  });

  describe("健康检查", () => {
    it("应该通过健康检查", async () => {
      const health = await core.healthCheck();

      expect(health.status).toBe("healthy");
      expect(health.checks).toBeDefined();
    });

    it("停止后健康检查应该失败", async () => {
      await core.stop();
      const health = await core.healthCheck();

      expect(health.status).toBe("unhealthy");
    });
  });

  describe("配置", () => {
    it("应该返回当前配置", () => {
      const config = core.getConfig();

      expect(config).toBeDefined();
      expect(config.agentId).toBe("test-agent");
    });

    it("应该支持运行时更新配置", () => {
      core.updateConfig({ maxAtoms: 5000 });
      const config = core.getConfig();

      expect(config.maxAtoms).toBe(5000);
    });
  });

  describe("并发安全", () => {
    it("应该支持并发摄入", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        core.ingest(`并发 ${i}`, { type: "fact" }),
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    });

    it("应该支持并发激活", async () => {
      await core.ingest("并发查询测试", { type: "fact" });

      const promises = Array.from({ length: 5 }, () =>
        core.activate({ intent: "测试", strategy: "exploratory" }),
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
    });
  });

  describe("错误处理", () => {
    it("嵌入引擎失败应该优雅处理", async () => {
      mockEmbed.mockRejectedValue(new Error("Network error"));

      await expect(core.ingest("错误测试", { type: "fact" })).rejects.toThrow();
    });

    it("应该处理空查询", async () => {
      const result = await core.activate({
        intent: "",
        strategy: "exploratory",
      });

      expect(result.atoms).toEqual([]);
    });
  });
});
