/**
 * 持久化选择性记忆继承系统测试
 *
 * 验证三层记忆架构与 SQLite 存储的集成
 * 以及 sessions_spawn 的自动记忆继承功能
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PersistentSelectiveMemoryInheritance,
  createPersistentSelectiveMemoryInheritance,
  PersistentMemoryStorage,
} from "../src/cognitive-core/memory/PersistentSelectiveMemoryInheritance.js";
import type {
  ScopedMemoryItem,
  MemoryScope,
} from "../src/cognitive-core/memory/SelectiveMemoryInheritance.js";

describe("PersistentSelectiveMemoryInheritance", () => {
  let tempDir: string;
  let storage: PersistentMemoryStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "nsem-memory-test-"));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("三层记忆存储", () => {
    it("应该支持 personal 范围的记忆持久化", async () => {
      const agentId = "test-agent-personal";
      const system = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      // 存储个人记忆
      const item = await system.store("这是我的个人记忆", {
        scope: "personal",
        type: "fact",
        importance: 0.8,
        tags: ["test", "personal"],
      });

      expect(item.scope).toBe("personal");
      expect(item.content).toBe("这是我的个人记忆");

      // 关闭系统
      system.close();

      // 重新创建系统，验证持久化
      const system2 = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      const results = await system2.retrieve("个人记忆", { scopes: ["personal"] });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.content).toBe("这是我的个人记忆");

      system2.close();
    });

    it("应该支持 shared 范围的记忆持久化", async () => {
      const agentId = "test-agent-shared";
      const system = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      // 存储共享记忆
      const item = await system.store("这是共享知识", {
        scope: "shared",
        type: "insight",
        importance: 0.9,
        tags: ["shared", "important"],
      });

      expect(item.scope).toBe("shared");

      // 关闭并重新加载
      system.close();

      const system2 = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      const results = await system2.retrieve("共享知识", { scopes: ["shared"] });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.content).toBe("这是共享知识");

      system2.close();
    });

    it("应该支持跨范围的统一检索", async () => {
      const agentId = "test-agent-multi";
      const system = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      // 存储不同范围的记忆
      await system.store("个人秘密", { scope: "personal" });
      await system.store("共享知识", { scope: "shared" });

      // 跨范围检索
      const results = await system.retrieve("知识", {
        scopes: ["personal", "shared"],
      });

      expect(results.length).toBeGreaterThanOrEqual(2);

      system.close();
    });
  });

  describe("记忆继承", () => {
    it("应该支持从父 Agent 继承记忆", async () => {
      const parentId = "parent-agent";
      const childId = "child-agent";

      // 创建父 Agent 系统
      const parentSystem = createPersistentSelectiveMemoryInheritance(parentId, {
        storage: { baseDir: tempDir },
      });

      // 父 Agent 存储可继承的记忆
      await parentSystem.store("父 Agent 的知识", {
        scope: "shared",
        type: "fact",
        importance: 0.9,
        tags: ["inheritable"],
      });

      // 获取父 Agent 的共享记忆用于继承
      const sharedMemories = parentSystem.getAllShared({ tags: ["inheritable"] });
      expect(sharedMemories.length).toBeGreaterThan(0);

      // 创建子 Agent 系统并继承
      const childSystem = createPersistentSelectiveMemoryInheritance(childId, {
        storage: { baseDir: tempDir },
        parentChain: [parentId],
      });

      // 从父 Agent 继承
      const result = await childSystem.inheritFromParent(
        parentId,
        sharedMemories.map((m) => ({
          id: m.id,
          contentHash: "",
          content: m.content,
          contentType: (m.type ||
            "fact") as import("../src/cognitive-core/types/index.js").ContentType,
          embedding: [],
          temporal: {
            created: m.createdAt,
            modified: m.updatedAt,
            lastAccessed: m.lastAccessedAt || m.createdAt,
            accessCount: m.accessCount || 0,
            decayRate: 0.001,
          },
          spatial: { agent: parentId },
          strength: {
            current: m.importance || 0.5,
            base: m.importance || 0.5,
            reinforcement: 0,
            emotional: 0,
          },
          generation: 1,
          meta: {
            tags: m.tags || [],
            confidence: 1.0,
            source: "ai",
          },
        })),
        {
          strategy: "filtered",
        },
      );

      expect(result.inherited).toBeGreaterThan(0);

      // 验证子 Agent 可以检索继承的记忆
      const results = await childSystem.retrieve("父 Agent", { scopes: ["inherited"] });
      expect(results.length).toBeGreaterThan(0);

      parentSystem.close();
      childSystem.close();
    });
  });

  describe("快照管理", () => {
    it("应该支持创建和恢复快照", async () => {
      const agentId = "test-agent-snapshot";
      const system = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      // 存储一些记忆
      await system.store("记忆内容 1", { scope: "personal" });
      await system.store("记忆内容 2", { scope: "shared" });

      // 创建快照
      const snapshot = system.createSnapshot("test-snapshot");
      expect(snapshot.name).toBe("test-snapshot");
      expect(snapshot.count).toBeGreaterThanOrEqual(2);

      // 关闭系统
      system.close();

      // 重新加载并验证快照
      const system2 = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      const snapshots = system2.getSnapshots();
      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots[0].name).toBe("test-snapshot");

      system2.close();
    });
  });

  describe("统计信息", () => {
    it("应该返回正确的统计信息", async () => {
      const agentId = "test-agent-stats";
      const system = createPersistentSelectiveMemoryInheritance(agentId, {
        storage: { baseDir: tempDir },
      });

      // 存储不同类型的记忆
      await system.store("个人记忆 1", { scope: "personal" });
      await system.store("个人记忆 2", { scope: "personal" });
      await system.store("共享记忆 1", { scope: "shared" });

      const stats = system.getStats();
      expect(stats.personal).toBeGreaterThanOrEqual(2);
      expect(stats.shared).toBeGreaterThanOrEqual(1);
      expect(stats.total).toBeGreaterThanOrEqual(3);

      system.close();
    });
  });
});

describe("PersistentMemoryStorage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "nsem-storage-test-"));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("应该正确初始化数据库", () => {
    const storage = new PersistentMemoryStorage("test-agent", {
      baseDir: tempDir,
    });

    const db = storage.getDatabase();
    expect(db).toBeDefined();

    // 验证表已创建
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("personal_memories");
    expect(tableNames).toContain("shared_memories");
    expect(tableNames).toContain("inherited_memories");
    expect(tableNames).toContain("memory_snapshots");

    storage.close();
  });

  it("应该支持 CRUD 操作", () => {
    const storage = new PersistentMemoryStorage("test-agent", {
      baseDir: tempDir,
    });

    const item: ScopedMemoryItem = {
      id: "test-id-1",
      content: "测试内容",
      scope: "personal" as MemoryScope,
      type: "fact",
      importance: 0.8,
      tags: ["test"],
      metadata: { key: "value" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 创建
    storage.storePersonal(item);

    // 读取
    const retrieved = storage.getPersonal("test-id-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.content).toBe("测试内容");

    // 更新
    item.content = "更新后的内容";
    storage.storePersonal(item);
    const updated = storage.getPersonal("test-id-1");
    expect(updated?.content).toBe("更新后的内容");

    // 查询所有
    const all = storage.getAllPersonal();
    expect(all.length).toBe(1);

    storage.close();
  });
});
