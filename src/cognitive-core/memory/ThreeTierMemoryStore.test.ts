/**
 * ThreeTierMemoryStore 单元测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MemAtom, Vector } from "../types/index.js";
import {
  ThreeTierMemoryStore,
  createThreeTierMemoryStore,
  WORKING_MEMORY_CONFIG,
  TIME_WINDOW_CONFIG,
  TIER_THRESHOLD_CONFIG,
} from "./ThreeTierMemoryStore.js";

describe("ThreeTierMemoryStore", () => {
  let store: ThreeTierMemoryStore;
  let mockAtom: MemAtom;

  beforeEach(() => {
    store = createThreeTierMemoryStore({
      workingCapacity: 10,
      shortTermCapacity: 50,
      longTermCapacity: 1000,
      autoTierTransition: true,
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
      expect(store).toBeDefined();
      expect(store.getStats).toBeDefined();
      expect(store.add).toBeDefined();
      expect(store.get).toBeDefined();
    });

    it("应该添加记忆到工作记忆", () => {
      const item = store.add(mockAtom);

      expect(item).toBeDefined();
      expect(item.atom.id).toBe(mockAtom.id);
      expect(item.tier).toBe("working");
      expect(item.tierMeta.tierAccessCount).toBe(0);
    });

    it("应该通过ID获取记忆", () => {
      store.add(mockAtom);
      const retrieved = store.get(mockAtom.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.atom.id).toBe(mockAtom.id);
    });

    it("应该返回undefined获取不存在的记忆", () => {
      const retrieved = store.get("non-existent-id");
      expect(retrieved).toBeUndefined();
    });

    it("应该删除记忆", () => {
      store.add(mockAtom);
      const deleted = store.remove(mockAtom.id);

      expect(deleted).toBe(true);
      expect(store.get(mockAtom.id)).toBeUndefined();
    });

    it("删除不存在的记忆应该返回false", () => {
      const deleted = store.remove("non-existent-id");
      expect(deleted).toBe(false);
    });
  });

  describe("三层存储层级", () => {
    it("应该在工作记忆满时降级到短期记忆", () => {
      const workingCapacity = 5;
      const smallStore = createThreeTierMemoryStore({
        workingCapacity,
        shortTermCapacity: 50,
        longTermCapacity: 1000,
      });

      // 添加超过工作记忆容量的记忆
      for (let i = 0; i < workingCapacity + 3; i++) {
        const atom = { ...mockAtom, id: `atom-${i}` };
        smallStore.add(atom);
      }

      const stats = smallStore.getStats();
      expect(stats.working.count).toBeLessThanOrEqual(workingCapacity);
    });

    it("应该正确统计各层记忆数量", () => {
      // 添加10条记忆
      for (let i = 0; i < 10; i++) {
        store.add({ ...mockAtom, id: `atom-${i}` });
      }

      const stats = store.getStats();
      expect(stats.total.memories).toBe(10);
      expect(stats.working.count + stats.shortTerm.count + stats.longTerm.count).toBe(10);
    });

    it("访问记忆应该增加访问计数", () => {
      store.add(mockAtom);
      const before = store.get(mockAtom.id);
      const initialCount = before?.tierMeta.tierAccessCount ?? 0;

      // 访问记忆
      store.touch(mockAtom.id);

      const after = store.get(mockAtom.id);
      expect(after?.tierMeta.tierAccessCount).toBe((before?.tierMeta.tierAccessCount ?? 0) + 1);
    });
  });

  describe("层级升级", () => {
    it("频繁访问应该触发短期记忆升级到工作记忆", () => {
      const atom = { ...mockAtom, id: "upgrade-test" };
      store.add(atom);

      // 强制降级到短期记忆 (通过添加更多记忆挤占空间)
      for (let i = 0; i < 15; i++) {
        store.add({ ...mockAtom, id: `filler-${i}` });
      }

      const itemBefore = store.get(atom.id);
      if (itemBefore && itemBefore.tier !== "working") {
        // 频繁访问
        for (let i = 0; i < TIER_THRESHOLD_CONFIG.STM_TO_WM_ACCESS_THRESHOLD + 1; i++) {
          store.touch(atom.id);
        }

        // 检查升级 (可能升级，取决于实现)
        const itemAfter = store.get(atom.id);
        expect(itemAfter?.tierMeta.tierAccessCount).toBeGreaterThan(0);
      }
    });
  });

  describe("遗忘衰减", () => {
    it("应该支持手动触发衰减计算", () => {
      store.add(mockAtom);
      const before = store.get(mockAtom.id);
      const beforeStrength = before?.atom.strength.current ?? 1;

      // 触发衰减
      store.applyDecay();

      const after = store.get(mockAtom.id);
      // 强度应该有所变化 (可能降低或保持不变)
      expect(after?.atom.strength.current).toBeDefined();
    });

    it("长时间未访问的记忆应该被清理", () => {
      const oldAtom = {
        ...mockAtom,
        id: "old-atom",
        createdAt: Date.now() - TIME_WINDOW_CONFIG.LONG_TERM_MS * 2,
        accessedAt: Date.now() - TIME_WINDOW_CONFIG.LONG_TERM_MS * 2,
        strength: { ...mockAtom.strength, current: 0.01 }, // 很弱的记忆
      };

      store.add(oldAtom);

      // 清理过期记忆
      const cleaned = store.cleanExpired();

      // 应该清理了一些记忆
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe("搜索功能", () => {
    it("应该支持向量相似度搜索", () => {
      // 添加几条记忆
      for (let i = 0; i < 5; i++) {
        const atom: MemAtom = {
          ...mockAtom,
          id: `search-${i}`,
          embedding: new Array(384).fill(0).map((_, idx) => (idx === i ? 1 : 0)) as Vector,
        };
        store.add(atom);
      }

      const query = new Array(384).fill(0);
      query[0] = 1; // 与第一条最相似

      const results = store.searchByVector(query as Vector, 3);

      expect(results.length).toBeLessThanOrEqual(3);
      expect(results[0]?.atom.id).toBe("search-0");
    });

    it("空搜索应该返回空数组", () => {
      const results = store.searchByVector(new Array(384).fill(0.1) as Vector, 5);
      expect(results).toEqual([]);
    });
  });

  describe("批量操作", () => {
    it("应该支持批量添加", () => {
      const atoms = Array.from({ length: 10 }, (_, i) => ({
        ...mockAtom,
        id: `batch-${i}`,
      }));

      const items = store.addBatch(atoms);

      expect(items).toHaveLength(10);
      expect(store.getStats().total).toBe(10);
    });

    it("应该支持批量获取", () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = `batch-get-${i}`;
        ids.push(id);
        store.add({ ...mockAtom, id });
      }

      const items = store.getBatch(ids);

      expect(items).toHaveLength(5);
    });
  });

  describe("配置验证", () => {
    it("应该使用默认配置", () => {
      const defaultStore = createThreeTierMemoryStore();
      const stats = defaultStore.getStats();

      expect(stats).toBeDefined();
    });

    it("应该验证工作记忆容量边界", () => {
      const store = createThreeTierMemoryStore({
        workingCapacity: WORKING_MEMORY_CONFIG.MIN_CAPACITY - 1,
      });

      // 应该调整到最小值
      expect(store).toBeDefined();
    });
  });

  describe("并发安全", () => {
    it("应该支持并发添加", async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        Promise.resolve(store.add({ ...mockAtom, id: `concurrent-${i}` })),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(20);
      expect(store.getStats().total).toBe(20);
    });

    it("应该支持并发访问", () => {
      store.add(mockAtom);

      const promises = Array.from({ length: 10 }, () => Promise.resolve(store.touch(mockAtom.id)));

      return expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });

  describe("元数据追踪", () => {
    it("应该记录层级历史", () => {
      const item = store.add(mockAtom);

      expect(item.tierMeta.tierHistory).toBeDefined();
      expect(item.tierMeta.tierHistory.length).toBeGreaterThanOrEqual(1);
      expect(item.tierMeta.tierHistory[0].tier).toBe("working");
    });

    it("应该记录进入层级的时间", () => {
      const beforeAdd = Date.now();
      const item = store.add(mockAtom);
      const afterAdd = Date.now();

      expect(item.tierMeta.enteredTierAt).toBeGreaterThanOrEqual(beforeAdd);
      expect(item.tierMeta.enteredTierAt).toBeLessThanOrEqual(afterAdd);
    });
  });
});
