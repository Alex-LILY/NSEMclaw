/**
 * VectorStorage 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { MemAtom, Vector } from "../types/index.js";
import { VectorStorage, getVectorStorage, createVectorStorage } from "./VectorStorage.js";

describe("VectorStorage", () => {
  let storage: VectorStorage;
  let mockAtom: MemAtom;

  beforeEach(() => {
    storage = createVectorStorage({
      vectorDim: 384,
    });

    mockAtom = {
      id: "test-atom-1",
      contentHash: "hash-1",
      content: "测试记忆内容",
      contentType: "fact",
      embedding: new Array(384).fill(0.1) as Vector,
      temporal: {
        created: Date.now(),
        modified: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        decayRate: 0.01,
      },
      spatial: {},
      strength: {
        base: 0.8,
        current: 0.8,
        reinforcement: 0,
        emotional: 0,
      },
      generation: 1,
      meta: { tags: [], confidence: 1.0, source: "ai" },
    } as unknown as MemAtom;
  });

  describe("基础存储操作", () => {
    it("应该成功创建存储实例", () => {
      expect(storage).toBeDefined();
      expect(storage.add).toBeDefined();
      expect(storage.get).toBeDefined();
      expect(storage.search).toBeDefined();
    });

    it("应该添加向量", () => {
      storage.add(mockAtom.id, mockAtom.embedding, mockAtom);

      expect(storage.count()).toBe(1);
    });

    it("应该通过ID获取向量", () => {
      storage.add(mockAtom.id, mockAtom.embedding, mockAtom);
      const retrieved = storage.get(mockAtom.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(mockAtom.id);
    });

    it("获取不存在的ID应该返回null", () => {
      const retrieved = storage.get("non-existent");
      expect(retrieved).toBeNull();
    });

    it("应该删除向量", () => {
      storage.add(mockAtom.id, mockAtom.embedding, mockAtom);
      const deleted = storage.delete(mockAtom.id);

      expect(deleted).toBe(true);
      expect(storage.get(mockAtom.id)).toBeNull();
    });

    it("删除不存在的向量应该返回false", () => {
      const deleted = storage.delete("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("向量搜索", () => {
    beforeEach(() => {
      // 添加一些测试向量
      for (let i = 0; i < 10; i++) {
        const embedding = new Array(384).fill(0);
        embedding[i] = 1; // 每条约第i维为1

        storage.add(`vec-${i}`, embedding as Vector, {
          ...mockAtom,
          id: `vec-${i}`,
        });
      }
    });

    it("应该执行相似度搜索", () => {
      const query = new Array(384).fill(0);
      query[0] = 1; // 与第一条最相似

      const results = storage.search(query as Vector, { topK: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
      expect(results[0].id).toBe("vec-0");
    });

    it("搜索结果应该包含相似度分数", () => {
      const query = new Array(384).fill(0.1) as Vector;
      const results = storage.search(query, { topK: 1 });

      expect(results[0].similarity).toBeDefined();
      expect(results[0].similarity).toBeGreaterThanOrEqual(0);
      expect(results[0].similarity).toBeLessThanOrEqual(1);
    });

    it("应该支持相似度阈值过滤", () => {
      const query = new Array(384).fill(0.01) as Vector;
      const results = storage.search(query, { topK: 10, minSimilarity: 0.9 });

      // 所有结果应该超过阈值
      results.forEach((r) => {
        expect(r.similarity).toBeGreaterThanOrEqual(0.9);
      });
    });

    it("空搜索应该返回空数组", () => {
      const emptyStorage = createVectorStorage();
      const results = emptyStorage.search(mockAtom.embedding, { topK: 5 });
      expect(results).toEqual([]);
    });
  });

  describe("批量操作", () => {
    it("应该支持批量添加", () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-${i}`,
        vector: new Array(384).fill(0.1) as Vector,
        metadata: { ...mockAtom, id: `batch-${i}` },
      }));

      const added = storage.addBatch(items);

      expect(added).toBe(10);
      expect(storage.count()).toBe(10);
    });

    it("应该支持批量获取", () => {
      for (let i = 0; i < 5; i++) {
        storage.add(`multi-${i}`, mockAtom.embedding, { ...mockAtom, id: `multi-${i}` });
      }

      const results = storage.getBatch(["multi-0", "multi-2", "multi-4"]);

      expect(results).toHaveLength(3);
      expect(results[0]?.id).toBe("multi-0");
    });

    it("应该支持批量删除", () => {
      for (let i = 0; i < 5; i++) {
        storage.add(`del-${i}`, mockAtom.embedding, { ...mockAtom, id: `del-${i}` });
      }

      const deleted = storage.deleteBatch(["del-0", "del-2", "del-4"]);

      expect(deleted).toBe(3);
      expect(storage.count()).toBe(2);
    });
  });

  describe("相似度计算", () => {
    it("应该正确计算余弦相似度", () => {
      const vec1 = [1, 0, 0] as Vector;
      const vec2 = [1, 0, 0] as Vector;
      const vec3 = [0, 1, 0] as Vector;

      // 相同向量的相似度为1
      const sim1 = storage.calculateSimilarity(vec1, vec2);
      expect(sim1).toBeCloseTo(1, 5);

      // 正交向量的相似度为0
      const sim2 = storage.calculateSimilarity(vec1, vec3);
      expect(sim2).toBeCloseTo(0, 5);
    });

    it("应该处理不同维度的向量", () => {
      const vec1 = [1, 0, 0] as Vector;
      const vec2 = [1, 0] as Vector;

      // 应该抛出错误或进行填充
      expect(() => storage.calculateSimilarity(vec1, vec2)).toThrow();
    });
  });

  describe("全局存储实例", () => {
    it("应该获取全局存储实例", () => {
      const globalStorage = getVectorStorage({ vectorDim: 384 });
      expect(globalStorage).toBeDefined();
    });

    it("相同配置应该返回同一实例", () => {
      const s1 = getVectorStorage({ vectorDim: 384 });
      const s2 = getVectorStorage({ vectorDim: 384 });

      expect(s1).toBe(s2);
    });
  });

  describe("存储统计", () => {
    it("应该返回存储统计", () => {
      storage.add("stat-1", mockAtom.embedding, mockAtom);
      storage.add("stat-2", mockAtom.embedding, mockAtom);

      const stats = storage.getStats();

      expect(stats.count).toBe(2);
      expect(stats.dimensions).toBe(384);
    });

    it("空存储应该返回零统计", () => {
      const stats = storage.getStats();

      expect(stats.count).toBe(0);
    });
  });

  describe("清空和重置", () => {
    it("应该清空所有向量", () => {
      for (let i = 0; i < 5; i++) {
        storage.add(`clear-${i}`, mockAtom.embedding, mockAtom);
      }

      expect(storage.count()).toBe(5);

      storage.clear();

      expect(storage.count()).toBe(0);
    });

    it("清空后应该可以重新添加", () => {
      storage.add("readd", mockAtom.embedding, mockAtom);
      storage.clear();

      expect(() => {
        storage.add("readd", mockAtom.embedding, mockAtom);
      }).not.toThrow();

      expect(storage.count()).toBe(1);
    });
  });

  describe("并发安全", () => {
    it("应该支持并发添加", async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(
          storage.add(`concurrent-${i}`, mockAtom.embedding, {
            ...mockAtom,
            id: `concurrent-${i}`,
          }),
        ),
      );

      await Promise.all(promises);

      expect(storage.count()).toBe(50);
    });

    it("应该支持并发搜索", async () => {
      for (let i = 0; i < 10; i++) {
        storage.add(`search-${i}`, mockAtom.embedding, mockAtom);
      }

      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve(storage.search(mockAtom.embedding, { topK: 5 })),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((r) => expect(r.length).toBeGreaterThan(0));
    });
  });

  describe("边界条件", () => {
    it("应该处理空向量", () => {
      const emptyVec = new Array(384).fill(0) as Vector;
      storage.add("empty-vec", emptyVec, mockAtom);

      const retrieved = storage.get("empty-vec");
      expect(retrieved).toBeDefined();
    });

    it("应该处理极大值向量", () => {
      const largeVec = new Array(384).fill(Number.MAX_VALUE / 1000) as Vector;

      expect(() => {
        storage.add("large-vec", largeVec, mockAtom);
      }).not.toThrow();
    });

    it("应该处理NaN值", () => {
      const nanVec = new Array(384).fill(NaN) as Vector;

      // 可能应该抛出错误或进行清理
      expect(() => {
        storage.add("nan-vec", nanVec, mockAtom);
      }).toThrow();
    });
  });
});
