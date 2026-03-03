/**
 * SelectiveMemoryInheritance 单元测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MemAtom, Vector } from "../types/index.js";
import {
  SelectiveMemoryInheritance,
  createSelectiveMemoryInheritance,
  InheritanceStrategy,
} from "./SelectiveMemoryInheritance.js";

describe("SelectiveMemoryInheritance", () => {
  let inheritance: SelectiveMemoryInheritance;
  let mockAtom: MemAtom;

  beforeEach(() => {
    inheritance = createSelectiveMemoryInheritance({
      strategy: "relevance",
      maxInheritedMemories: 100,
      inheritanceThreshold: 0.5,
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
        accessCount: 5,
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
      meta: { tags: ["test"], confidence: 1.0, source: "ai" },
    } as unknown as MemAtom;
  });

  describe("基础功能", () => {
    it("应该成功创建继承管理器", () => {
      expect(inheritance).toBeDefined();
      expect(inheritance.registerScope).toBeDefined();
      expect(inheritance.inherit).toBeDefined();
      expect(inheritance.subscribe).toBeDefined();
    });

    it("应该注册作用域", () => {
      const scope = inheritance.registerScope("session-1", {
        parentScopes: [],
        inheritanceStrategy: "relevance",
      });

      expect(scope).toBeDefined();
      expect(scope.id).toBe("session-1");
    });

    it("应该获取已注册的作用域", () => {
      inheritance.registerScope("scope-1", {});
      const retrieved = inheritance.getScope("scope-1");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("scope-1");
    });

    it("获取不存在的作用域应该返回undefined", () => {
      const scope = inheritance.getScope("non-existent");
      expect(scope).toBeUndefined();
    });
  });

  describe("记忆继承", () => {
    it("应该继承父作用域的记忆", () => {
      // 创建父作用域并添加记忆
      inheritance.registerScope("parent", {});
      inheritance.addToScope("parent", mockAtom);

      // 创建子作用域
      inheritance.registerScope("child", {
        parentScopes: ["parent"],
        inheritanceStrategy: "all",
      });

      // 执行继承
      const inherited = inheritance.inherit("child");

      expect(inherited.length).toBeGreaterThan(0);
      expect(inherited[0].atom.id).toBe(mockAtom.id);
    });

    it("应该根据策略选择性继承", () => {
      // 创建父作用域
      inheritance.registerScope("parent-selective", {});

      // 添加多条记忆
      for (let i = 0; i < 5; i++) {
        const atom = {
          ...mockAtom,
          id: `selective-${i}`,
          strength: { ...mockAtom.strength, current: i * 0.2 },
        };
        inheritance.addToScope("parent-selective", atom);
      }

      // 创建子作用域，只继承高重要性记忆
      inheritance.registerScope("child-selective", {
        parentScopes: ["parent-selective"],
        inheritanceStrategy: "strength-threshold",
        inheritanceThreshold: 0.5,
      });

      const inherited = inheritance.inherit("child-selective");

      // 应该只继承强度大于0.5的记忆
      for (const item of inherited) {
        expect(item.atom.strength.current).toBeGreaterThanOrEqual(0.5);
      }
    });

    it("应该支持多层继承", () => {
      // 祖父 -> 父 -> 子
      inheritance.registerScope("grandparent", {});
      inheritance.addToScope("grandparent", { ...mockAtom, id: "grandparent-mem" });

      inheritance.registerScope("parent-multi", {
        parentScopes: ["grandparent"],
      });

      inheritance.registerScope("grandchild", {
        parentScopes: ["parent-multi"],
      });

      const inherited = inheritance.inherit("grandchild");

      expect(inherited.some((item) => item.atom.id === "grandparent-mem")).toBe(true);
    });

    it("应该处理循环依赖", () => {
      inheritance.registerScope("cycle-a", { parentScopes: [] });
      inheritance.registerScope("cycle-b", { parentScopes: ["cycle-a"] });

      // 尝试创建循环 (在实际实现中应该被阻止或处理)
      expect(() => {
        inheritance.registerScope("cycle-a", { parentScopes: ["cycle-b"] });
      }).not.toThrow();
    });
  });

  describe("作用域订阅", () => {
    it("应该订阅记忆变化", () => {
      inheritance.registerScope("sub-scope", {});

      const callback = vi.fn();
      const unsubscribe = inheritance.subscribe("sub-scope", callback);

      // 添加记忆应该触发回调
      inheritance.addToScope("sub-scope", mockAtom);

      expect(callback).toHaveBeenCalled();

      // 取消订阅
      unsubscribe();
    });

    it("取消订阅后不应该再收到通知", () => {
      inheritance.registerScope("unsub-scope", {});

      const callback = vi.fn();
      const unsubscribe = inheritance.subscribe("unsub-scope", callback);

      unsubscribe();

      // 重置mock
      callback.mockClear();

      // 添加记忆
      inheritance.addToScope("unsub-scope", mockAtom);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("记忆快照", () => {
    it("应该创建作用域快照", () => {
      inheritance.registerScope("snapshot-scope", {});
      inheritance.addToScope("snapshot-scope", mockAtom);

      const snapshot = inheritance.createSnapshot("test-snapshot");

      expect(snapshot).toBeDefined();
      expect(snapshot.name).toBe("test-snapshot");
      expect(snapshot.memoryIds).toHaveLength(1);
    });

    it("应该恢复快照", async () => {
      inheritance.registerScope("restore-scope", {});
      inheritance.addToScope("restore-scope", mockAtom);

      const snapshot = inheritance.createSnapshot("restore-snapshot");

      // 清除原作用域
      inheritance.clearScope("restore-scope");
      expect(inheritance.getScopeMemories("restore-scope")).toHaveLength(0);

      // 恢复（使用快照 ID）
      const result = await inheritance.restoreSnapshot(snapshot.id);
      expect(result.restored).toBeGreaterThan(0);
    });
  });

  describe("作用域管理", () => {
    it("应该从作用域移除记忆", () => {
      inheritance.registerScope("remove-scope", {});
      inheritance.addToScope("remove-scope", mockAtom);

      expect(inheritance.getScopeMemories("remove-scope")).toHaveLength(1);

      const removed = inheritance.removeFromScope("remove-scope", mockAtom.id);

      expect(removed).toBe(true);
      expect(inheritance.getScopeMemories("remove-scope")).toHaveLength(0);
    });

    it("应该清空作用域", () => {
      inheritance.registerScope("clear-scope", {});

      for (let i = 0; i < 5; i++) {
        inheritance.addToScope("clear-scope", { ...mockAtom, id: `clear-${i}` });
      }

      expect(inheritance.getScopeMemories("clear-scope")).toHaveLength(5);

      inheritance.clearScope("clear-scope");

      expect(inheritance.getScopeMemories("clear-scope")).toHaveLength(0);
    });

    it("应该销毁作用域", () => {
      inheritance.registerScope("destroy-scope", {});
      expect(inheritance.getScope("destroy-scope")).toBeDefined();

      inheritance.destroyScope("destroy-scope");

      expect(inheritance.getScope("destroy-scope")).toBeUndefined();
    });
  });

  describe("继承策略", () => {
    const strategies: InheritanceStrategy[] = [
      "all",
      "relevance",
      "strength-threshold",
      "recent",
      "tag-based",
    ];

    strategies.forEach((strategy) => {
      it(`应该支持 ${strategy} 策略`, () => {
        inheritance.registerScope("parent-strategy", {});
        inheritance.addToScope("parent-strategy", mockAtom);

        inheritance.registerScope(`child-${strategy}`, {
          parentScopes: ["parent-strategy"],
          inheritanceStrategy: strategy,
        });

        const inherited = inheritance.inherit(`child-${strategy}`);
        expect(inherited).toBeDefined();
      });
    });
  });

  describe("统计信息", () => {
    it("应该返回统计信息", () => {
      inheritance.registerScope("stats-scope-1", {});
      inheritance.registerScope("stats-scope-2", { parentScopes: ["stats-scope-1"] });
      inheritance.addToScope("stats-scope-1", mockAtom);
      inheritance.addToScope("stats-scope-2", { ...mockAtom, id: "stats-2" });

      const stats = inheritance.getStats();

      expect(stats.inherited).toBe(0);
      expect(stats.shared).toBe(0);
      expect(stats.personal).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.snapshots).toBe(0);
    });

    it("应该返回作用域统计", () => {
      inheritance.registerScope("scope-stats", {});
      for (let i = 0; i < 3; i++) {
        inheritance.addToScope("scope-stats", { ...mockAtom, id: `stats-${i}` });
      }

      const stats = inheritance.getScopeStats("scope-stats");

      expect(stats.memoryCount).toBe(3);
      expect(stats.subscriberCount).toBe(0);
    });
  });

  describe("并发安全", () => {
    it("应该支持并发添加", async () => {
      inheritance.registerScope("concurrent-scope", {});

      const promises = Array.from({ length: 20 }, (_, i) =>
        Promise.resolve(
          inheritance.addToScope("concurrent-scope", { ...mockAtom, id: `concurrent-${i}` }),
        ),
      );

      await Promise.all(promises);

      const memories = inheritance.getScopeMemories("concurrent-scope");
      expect(memories.length).toBe(20);
    });
  });

  describe("边界条件", () => {
    it("空作用域继承应该返回空数组", () => {
      inheritance.registerScope("empty-parent", {});
      inheritance.registerScope("empty-child", {
        parentScopes: ["empty-parent"],
      });

      const inherited = inheritance.inherit("empty-child");
      expect(inherited).toEqual([]);
    });

    it("超过最大继承数量应该截断", () => {
      inheritance.registerScope("overflow-parent", {});

      // 添加超过限制的记忆
      for (let i = 0; i < 150; i++) {
        inheritance.addToScope("overflow-parent", { ...mockAtom, id: `overflow-${i}` });
      }

      inheritance.registerScope("overflow-child", {
        parentScopes: ["overflow-parent"],
        inheritanceStrategy: "all",
        maxInheritedMemories: 50,
      });

      const inherited = inheritance.inherit("overflow-child");
      expect(inherited.length).toBeLessThanOrEqual(50);
    });
  });
});
