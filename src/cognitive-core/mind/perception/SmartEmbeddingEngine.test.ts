/**
 * SmartEmbeddingEngine 单元测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ResolvedMemorySearchConfig } from "../../../agents/memory-search.js";
import type { NsemclawConfig } from "../../../config/config.js";
import {
  SmartEmbeddingEngine,
  createSmartEmbeddingEngine,
  LIGHTWEIGHT_MODELS,
} from "./SmartEmbeddingEngine.js";

// Mock 依赖
const mockCreateEmbeddingProvider = vi.fn();

vi.mock("../../../memory/embeddings.js", () => ({
  createEmbeddingProvider: (...args: any[]) => mockCreateEmbeddingProvider(...args),
}));

describe("SmartEmbeddingEngine", () => {
  let engine: SmartEmbeddingEngine;
  const mockConfig = {
    model: { provider: "openai", model: "gpt-4" },
  } as unknown as NsemclawConfig;

  const mockMemoryConfig = {
    enabled: true,
    provider: "local",
    local: {
      modelPath: "hf:qdrant/all-MiniLM-L6-v2-gguf/all-MiniLM-L6-v2-Q4_K_M.gguf",
    },
  } as unknown as ResolvedMemorySearchConfig;

  beforeEach(() => {
    mockCreateEmbeddingProvider.mockReset();

    mockCreateEmbeddingProvider.mockResolvedValue({
      embed: vi
        .fn()
        .mockImplementation((text: string) =>
          Promise.resolve(new Array(384).fill(0.1).map(() => Math.random() * 2 - 1)),
        ),
    });
  });

  describe("引擎创建", () => {
    it("应该通过工厂函数创建引擎", async () => {
      const eng = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
      expect(eng).toBeDefined();
      expect(eng.embed).toBeDefined();
      expect(eng.rerank).toBeDefined();
    });

    it("应该检测系统资源", async () => {
      const eng = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
      const stats = eng.getStats();

      expect(stats.resourceMode).toBeDefined();
      expect(["minimal", "balanced", "performance"]).toContain(stats.resourceMode);
    });

    it("应该根据内存选择合适模式", async () => {
      const eng = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig, {
        forceResourceMode: "minimal",
      });

      expect(eng.getStats().resourceMode).toBe("minimal");
    });
  });

  describe("嵌入生成", () => {
    beforeEach(async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
    });

    it("应该生成嵌入向量", async () => {
      const embedding = await engine.embed("测试文本");

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    });

    it("应该对相同文本生成相似向量", async () => {
      const emb1 = await engine.embed("相同文本");
      const emb2 = await engine.embed("相同文本");

      // 计算余弦相似度
      const similarity = cosineSimilarity(emb1, emb2);
      expect(similarity).toBeGreaterThan(0.99);
    });

    it("应该对相似文本生成相似向量", async () => {
      const emb1 = await engine.embed("机器学习");
      const emb2 = await engine.embed("深度学习");

      const similarity = cosineSimilarity(emb1, emb2);
      // 相似文本应该有较高的相似度
      expect(similarity).toBeGreaterThan(0);
    });

    it("应该支持批量嵌入", async () => {
      const texts = ["文本1", "文本2", "文本3"];
      const embeddings = await engine.embedBatch(texts);

      expect(embeddings).toHaveLength(3);
      expect(embeddings[0]).toBeDefined();
      expect(embeddings[0].length).toBeGreaterThan(0);
    });

    it("空文本应该返回空数组或零向量", async () => {
      const embedding = await engine.embed("");
      expect(embedding).toBeDefined();
    });
  });

  describe("重排序功能", () => {
    beforeEach(async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
    });

    it("应该对候选记忆重排序", async () => {
      const query = "机器学习";
      const candidates = [
        { text: "深度学习原理", score: 0.7 },
        { text: "今天的天气", score: 0.8 },
        { text: "神经网络架构", score: 0.6 },
      ];

      const reranked = await engine.rerank(query, candidates);

      expect(reranked).toHaveLength(3);
      expect(reranked[0].rerankScore).toBeDefined();
    });

    it("重排序应该提升相关项的排名", async () => {
      const query = "编程";
      const candidates = [
        { text: "如何烹饪", score: 0.9 },
        { text: "JavaScript教程", score: 0.5 },
        { text: "旅游指南", score: 0.8 },
      ];

      const reranked = await engine.rerank(query, candidates);

      // JavaScript教程应该排名上升
      const jsIndex = reranked.findIndex((c) => c.text.includes("JavaScript"));
      expect(jsIndex).toBeLessThan(2);
    });

    it("空候选列表应该返回空数组", async () => {
      const reranked = await engine.rerank("查询", []);
      expect(reranked).toEqual([]);
    });
  });

  describe("查询扩展", () => {
    beforeEach(async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
    });

    it("应该扩展查询", async () => {
      const query = "AI";
      const expanded = await engine.expandQuery(query);

      expect(expanded).toBeDefined();
      expect(expanded.original).toBe(query);
      expect(expanded.expanded).toBeDefined();
    });

    it("应该生成查询变体", async () => {
      const query = "深度学习";
      const expanded = await engine.expandQuery(query);

      expect(expanded.variations).toBeDefined();
      expect(Array.isArray(expanded.variations)).toBe(true);
    });
  });

  describe("模型管理", () => {
    it("应该支持预定义模型配置", () => {
      expect(LIGHTWEIGHT_MODELS).toBeDefined();
      expect(LIGHTWEIGHT_MODELS.minimal).toBeDefined();
      expect(LIGHTWEIGHT_MODELS.balanced).toBeDefined();
      expect(LIGHTWEIGHT_MODELS.performance).toBeDefined();
    });

    it("应该能够切换模型", async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);

      const beforeStats = engine.getStats();

      // 尝试切换模型
      await engine.switchModel("balanced");

      const afterStats = engine.getStats();
      expect(afterStats).toBeDefined();
    });

    it("应该报告模型加载状态", async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
      const stats = engine.getStats();

      expect(stats.modelLoaded).toBeDefined();
      expect(stats.modelPath).toBeDefined();
    });
  });

  describe("资源管理", () => {
    it("应该报告资源使用", async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
      const stats = engine.getStats();

      expect(stats.memoryUsage).toBeDefined();
      expect(stats.cacheSize).toBeDefined();
    });

    it("应该支持清理资源", async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);

      await engine.embed("测试");
      const beforeStats = engine.getStats();

      await engine.cleanup();

      const afterStats = engine.getStats();
      expect(afterStats).toBeDefined();
    });
  });

  describe("缓存功能", () => {
    beforeEach(async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig, {
        cacheSize: 100,
      });
    });

    it("应该缓存嵌入结果", async () => {
      const text = "缓存测试文本";

      // 第一次调用
      await engine.embed(text);
      const statsAfterFirst = engine.getStats();

      // 第二次调用 (应该命中缓存)
      await engine.embed(text);
      const statsAfterSecond = engine.getStats();

      expect(statsAfterSecond.cacheHits).toBeGreaterThan(statsAfterFirst.cacheHits);
    });

    it("应该限制缓存大小", async () => {
      // 添加超过缓存大小的不同文本
      for (let i = 0; i < 150; i++) {
        await engine.embed(`唯一文本 ${i}`);
      }

      const stats = engine.getStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(100);
    });
  });

  describe("错误处理", () => {
    it("应该处理嵌入失败", async () => {
      mockCreateEmbeddingProvider.mockRejectedValueOnce(new Error("Model load failed"));

      await expect(
        createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig),
      ).rejects.toThrow();
    });

    it("应该处理空输入", async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);

      const embedding = await engine.embed("");
      expect(embedding).toBeDefined();
    });
  });

  describe("性能监控", () => {
    beforeEach(async () => {
      engine = await createSmartEmbeddingEngine(mockConfig, "test-agent", mockMemoryConfig);
    });

    it("应该返回资源统计", async () => {
      await engine.embed("性能测试");
      const stats = engine.getStats();

      expect(stats.resourceMode).toBeDefined();
      expect(stats.modelLoaded).toBeDefined();
      expect(stats.memoryUsage).toBeGreaterThanOrEqual(0);
    });

    it("应该返回缓存统计", async () => {
      await engine.embed("调用1");
      await engine.embed("调用2");

      const stats = engine.getStats();
      expect(stats.cacheHits).toBeGreaterThanOrEqual(0);
    });
  });
});

// 辅助函数
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}
