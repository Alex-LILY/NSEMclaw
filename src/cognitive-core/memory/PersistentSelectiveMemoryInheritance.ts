/**
 * 持久化的选择性记忆继承系统
 * 将三层记忆架构 (Inherited/Shared/Personal) 与 SQLite 存储集成
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { MemAtom } from "../types/index.js";
import { generateId } from "../utils/common.js";
import {
  SelectiveMemoryInheritance,
  type InheritanceConfig,
  type MemoryScope,
  type MemoryFilter,
  type MemorySnapshot,
  type ScopedMemoryItem,
  type WriteOperation,
  type InheritanceResult,
  type MemoryType,
} from "./SelectiveMemoryInheritance.js";

// better-sqlite3 数据库类型声明
interface SQLiteDatabase {
  pragma<T = unknown>(pragma: string): T;
  exec(sql: string): void;
  prepare<T = unknown>(
    sql: string,
  ): {
    run(...params: unknown[]): void;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}

const log = createSubsystemLogger("persistent-memory-inheritance");

// ============================================================================
// 数据库 Schema
// ============================================================================

const MEMORY_TABLE_SCHEMA = `
-- 个人记忆表 (Personal Layer)
CREATE TABLE IF NOT EXISTS personal_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'fact',
  importance REAL DEFAULT 0.5,
  tags TEXT, -- JSON array
  metadata TEXT, -- JSON object
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed_at INTEGER
);

-- 共享记忆表 (Shared Layer)
CREATE TABLE IF NOT EXISTS shared_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'fact',
  importance REAL DEFAULT 0.5,
  tags TEXT, -- JSON array
  metadata TEXT, -- JSON object
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed_at INTEGER
);

-- 继承记忆表 (Inherited Layer) - 只读引用
CREATE TABLE IF NOT EXISTS inherited_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  parent_agent_id TEXT NOT NULL,
  parent_memory_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'fact',
  importance REAL DEFAULT 0.5,
  original_importance REAL, -- 父 Agent 中的原始重要性
  tags TEXT, -- JSON array
  metadata TEXT, -- JSON object
  inheritance_path TEXT, -- JSON array of agent IDs
  inherited_at INTEGER NOT NULL,
  decay_factor REAL DEFAULT 1.0,
  annotations TEXT -- JSON array of annotations
);

-- 记忆注释表
CREATE TABLE IF NOT EXISTS memory_annotations (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 快照表
CREATE TABLE IF NOT EXISTS memory_snapshots (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON serialized snapshot
  created_at INTEGER NOT NULL,
  UNIQUE(agent_id, name)
);

-- 写入操作日志 (用于审计和同步)
CREATE TABLE IF NOT EXISTS write_operations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'store', 'update', 'delete'
  scope TEXT NOT NULL, -- 'personal', 'shared'
  memory_id TEXT,
  content_hash TEXT,
  timestamp INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_personal_agent ON personal_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_shared_agent ON shared_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_inherited_agent ON inherited_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_inherited_parent ON inherited_memories(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_annotations_memory ON memory_annotations(memory_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_agent ON memory_snapshots(agent_id);
`;

// ============================================================================
// 持久化存储管理器
// ============================================================================

export interface PersistentStorageConfig {
  baseDir?: string;
  dbName?: string;
  enableWAL?: boolean;
}

export class PersistentMemoryStorage {
  private db!: SQLiteDatabase;
  private agentId: string;
  private dbPath: string;

  constructor(agentId: string, config?: PersistentStorageConfig) {
    this.agentId = agentId;

    const baseDir = config?.baseDir ?? this.getDefaultBaseDir();
    const dbName = config?.dbName ?? `${agentId}.sqlite`;
    this.dbPath = path.join(baseDir, dbName);

    // 确保目录存在
    fs.mkdirSync(baseDir, { recursive: true });

    // 动态导入并打开数据库
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提高并发性能
    if (config?.enableWAL !== false) {
      this.db.pragma("journal_mode = WAL");
    }

    // 初始化 Schema
    this.db.exec(MEMORY_TABLE_SCHEMA);

    log.info(`Persistent storage initialized for agent ${agentId} at ${this.dbPath}`);
  }

  private getDefaultBaseDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, ".nsemclaw", "memory", "inheritance");
  }

  getDatabase(): SQLiteDatabase {
    return this.db;
  }

  getDbPath(): string {
    return this.dbPath;
  }

  close(): void {
    this.db.close();
  }

  // ========================================================================
  // Personal Layer Operations
  // ========================================================================

  storePersonal(item: ScopedMemoryItem): void {
    const stmt = this.db.prepare(`
      INSERT INTO personal_memories 
      (id, agent_id, content, type, importance, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        type = excluded.type,
        importance = excluded.importance,
        tags = excluded.tags,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      item.id,
      this.agentId,
      item.content,
      item.type ?? "fact",
      item.importance ?? 0.5,
      JSON.stringify(item.tags ?? []),
      JSON.stringify(item.metadata ?? {}),
      item.createdAt,
      item.updatedAt,
    );
  }

  getPersonal(id: string): ScopedMemoryItem | null {
    const stmt = this.db.prepare(`
      SELECT * FROM personal_memories 
      WHERE id = ? AND agent_id = ?
    `);
    const row = stmt.get(id, this.agentId) as Record<string, unknown> | undefined;
    return row ? this.rowToMemoryItem(row) : null;
  }

  getAllPersonal(filter?: MemoryFilter): ScopedMemoryItem[] {
    let sql = `SELECT * FROM personal_memories WHERE agent_id = ?`;
    const params: unknown[] = [this.agentId];

    if (filter?.tags?.length) {
      sql += ` AND (`;
      filter.tags.forEach((tag, i) => {
        if (i > 0) sql += ` OR `;
        sql += `tags LIKE ?`;
        params.push(`%${tag}%`);
      });
      sql += `)`;
    }

    if (filter?.minImportance !== undefined) {
      sql += ` AND importance >= ?`;
      params.push(filter.minImportance);
    }

    if (filter?.startTime) {
      sql += ` AND created_at >= ?`;
      params.push(filter.startTime);
    }

    if (filter?.endTime) {
      sql += ` AND created_at <= ?`;
      params.push(filter.endTime);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToMemoryItem(row));
  }

  // ========================================================================
  // Shared Layer Operations
  // ========================================================================

  storeShared(item: ScopedMemoryItem): void {
    const stmt = this.db.prepare(`
      INSERT INTO shared_memories 
      (id, agent_id, content, type, importance, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        type = excluded.type,
        importance = excluded.importance,
        tags = excluded.tags,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      item.id,
      this.agentId,
      item.content,
      item.type ?? "fact",
      item.importance ?? 0.5,
      JSON.stringify(item.tags ?? []),
      JSON.stringify(item.metadata ?? {}),
      item.createdAt,
      item.updatedAt,
    );
  }

  getShared(id: string): ScopedMemoryItem | null {
    const stmt = this.db.prepare(`
      SELECT * FROM shared_memories 
      WHERE id = ? AND agent_id = ?
    `);
    const row = stmt.get(id, this.agentId) as Record<string, unknown> | undefined;
    return row ? this.rowToMemoryItem(row) : null;
  }

  getAllShared(filter?: MemoryFilter): ScopedMemoryItem[] {
    let sql = `SELECT * FROM shared_memories WHERE agent_id = ?`;
    const params: unknown[] = [this.agentId];

    if (filter?.tags?.length) {
      sql += ` AND (`;
      filter.tags.forEach((tag, i) => {
        if (i > 0) sql += ` OR `;
        sql += `tags LIKE ?`;
        params.push(`%${tag}%`);
      });
      sql += `)`;
    }

    if (filter?.minImportance !== undefined) {
      sql += ` AND importance >= ?`;
      params.push(filter.minImportance);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToMemoryItem(row));
  }

  // ========================================================================
  // Inherited Layer Operations (Read-Only Reference)
  // ========================================================================

  storeInherited(
    item: ScopedMemoryItem,
    parentAgentId: string,
    parentMemoryId: string,
    inheritancePath: string[],
    decayFactor: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO inherited_memories 
      (id, agent_id, parent_agent_id, parent_memory_id, content, type, importance, 
       original_importance, tags, metadata, inheritance_path, inherited_at, decay_factor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        importance = excluded.importance,
        metadata = excluded.metadata,
        decay_factor = excluded.decay_factor
    `);

    stmt.run(
      item.id,
      this.agentId,
      parentAgentId,
      parentMemoryId,
      item.content,
      item.type ?? "fact",
      item.importance ?? 0.5,
      item.metadata?.originalImportance ?? item.importance ?? 0.5,
      JSON.stringify(item.tags ?? []),
      JSON.stringify(item.metadata ?? {}),
      JSON.stringify(inheritancePath),
      item.createdAt,
      decayFactor,
    );
  }

  getAllInherited(parentAgentId?: string): Array<
    ScopedMemoryItem & {
      parentAgentId: string;
      parentMemoryId: string;
      decayFactor: number;
      inheritancePath: string[];
    }
  > {
    let sql = `SELECT * FROM inherited_memories WHERE agent_id = ?`;
    const params: unknown[] = [this.agentId];

    if (parentAgentId) {
      sql += ` AND parent_agent_id = ?`;
      params.push(parentAgentId);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((row) => ({
      ...this.rowToInheritedMemoryItem(row),
      parentAgentId: row.parent_agent_id as string,
      parentMemoryId: row.parent_memory_id as string,
      decayFactor: row.decay_factor as number,
      inheritancePath: JSON.parse(row.inheritance_path as string),
    }));
  }

  // ========================================================================
  // Annotation Operations
  // ========================================================================

  addAnnotation(memoryId: string, content: string): string {
    const id = generateId("anno", content + Date.now());
    const stmt = this.db.prepare(`
      INSERT INTO memory_annotations (id, memory_id, agent_id, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, memoryId, this.agentId, content, Date.now());
    return id;
  }

  getAnnotations(memoryId: string): Array<{ id: string; content: string; createdAt: number }> {
    const stmt = this.db.prepare(`
      SELECT * FROM memory_annotations 
      WHERE memory_id = ? AND agent_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(memoryId, this.agentId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      content: row.content as string,
      createdAt: row.created_at as number,
    }));
  }

  // ========================================================================
  // Snapshot Operations
  // ========================================================================

  saveSnapshot(snapshot: MemorySnapshot): void {
    const stmt = this.db.prepare(`
      INSERT INTO memory_snapshots (id, agent_id, name, data, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, name) DO UPDATE SET
        data = excluded.data,
        created_at = excluded.created_at
    `);
    stmt.run(
      snapshot.id,
      this.agentId,
      snapshot.name,
      JSON.stringify(snapshot),
      snapshot.createdAt,
    );
  }

  getSnapshot(name: string): MemorySnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM memory_snapshots 
      WHERE agent_id = ? AND name = ?
    `);
    const row = stmt.get(this.agentId, name) as Record<string, unknown> | undefined;
    return row ? JSON.parse(row.data as string) : null;
  }

  getAllSnapshots(): MemorySnapshot[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memory_snapshots 
      WHERE agent_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(this.agentId) as Record<string, unknown>[];
    return rows.map((row) => JSON.parse(row.data as string));
  }

  // ========================================================================
  // Write Operation Logging
  // ========================================================================

  logWriteOperation(operation: WriteOperation): void {
    const stmt = this.db.prepare(`
      INSERT INTO write_operations (id, agent_id, operation_type, scope, memory_id, content_hash, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      operation.id,
      this.agentId,
      operation.type,
      operation.scope,
      operation.memoryId,
      operation.contentHash,
      operation.timestamp,
    );
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  getStats(): {
    personal: number;
    shared: number;
    inherited: number;
    total: number;
    annotations: number;
    snapshots: number;
  } {
    const personal = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM personal_memories WHERE agent_id = ?`)
        .get(this.agentId) as { count: number }
    ).count;
    const shared = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM shared_memories WHERE agent_id = ?`)
        .get(this.agentId) as { count: number }
    ).count;
    const inherited = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM inherited_memories WHERE agent_id = ?`)
        .get(this.agentId) as { count: number }
    ).count;
    const annotations = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM memory_annotations WHERE agent_id = ?`)
        .get(this.agentId) as { count: number }
    ).count;
    const snapshots = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM memory_snapshots WHERE agent_id = ?`)
        .get(this.agentId) as { count: number }
    ).count;

    return {
      personal,
      shared,
      inherited,
      total: personal + shared + inherited,
      annotations,
      snapshots,
    };
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private rowToMemoryItem(row: Record<string, unknown>): ScopedMemoryItem {
    return {
      id: row.id as string,
      content: row.content as string,
      type: row.type as MemoryType,
      scope: (row.scope as MemoryScope) ?? "personal",
      importance: row.importance as number,
      tags: row.tags ? JSON.parse(row.tags as string) : [],
      metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      accessCount: row.access_count as number,
      lastAccessedAt: row.last_accessed_at as number | undefined,
    };
  }

  private rowToInheritedMemoryItem(row: Record<string, unknown>): ScopedMemoryItem {
    return {
      id: row.id as string,
      content: row.content as string,
      type: row.type as MemoryType,
      scope: "inherited",
      importance: row.importance as number,
      tags: row.tags ? JSON.parse(row.tags as string) : [],
      metadata: {
        ...JSON.parse(row.metadata as string),
        parentAgentId: row.parent_agent_id,
        parentMemoryId: row.parent_memory_id,
        inheritancePath: JSON.parse(row.inheritance_path as string),
        decayFactor: row.decay_factor,
      },
      createdAt: row.inherited_at as number,
      updatedAt: row.inherited_at as number,
    };
  }
}

// ============================================================================
// 持久化的选择性记忆继承系统
// ============================================================================

export interface PersistentInheritanceConfig extends InheritanceConfig {
  storage?: PersistentStorageConfig;
  enablePersistence?: boolean;
}

export class PersistentSelectiveMemoryInheritance extends SelectiveMemoryInheritance {
  private storage: PersistentMemoryStorage;
  private enablePersistence: boolean;

  constructor(agentId: string, config?: PersistentInheritanceConfig) {
    super(agentId, config);

    this.enablePersistence = config?.enablePersistence !== false;

    if (this.enablePersistence) {
      this.storage = new PersistentMemoryStorage(agentId, config?.storage);

      // 从数据库加载已有数据
      this.loadFromStorage();

      log.info(`PersistentSelectiveMemoryInheritance initialized for agent ${agentId}`);
    } else {
      // 使用临时内存存储 (用于测试)
      this.storage = null as unknown as PersistentMemoryStorage;
    }
  }

  // ========================================================================
  // 从存储加载
  // ========================================================================

  private loadFromStorage(): void {
    if (!this.enablePersistence) return;

    try {
      // 加载个人记忆
      const personalMemories = this.storage.getAllPersonal();
      for (const item of personalMemories) {
        this.personalStore.set(item.id, item);
      }

      // 加载共享记忆
      const sharedMemories = this.storage.getAllShared();
      for (const item of sharedMemories) {
        this.sharedStore.set(item.id, item);
      }

      // 加载继承记忆
      const inheritedMemories = this.storage.getAllInherited();
      for (const item of inheritedMemories) {
        this.inheritedMemories.set(item.id, {
          atom: {
            id: item.id,
            contentHash: "",
            content: item.content,
            contentType: (item.type ?? "fact") as import("../types/index.js").ContentType,
            embedding: [],
            temporal: {
              created: item.createdAt,
              modified: item.updatedAt,
              lastAccessed: item.lastAccessedAt ?? item.updatedAt,
              accessCount: item.accessCount ?? 0,
              decayRate: 0.001,
            },
            spatial: { agent: this.agentId },
            strength: {
              current: item.importance ?? 0.5,
              base: item.importance ?? 0.5,
              reinforcement: 0,
              emotional: 0,
            },
            generation: 1,
            meta: {
              tags: item.tags ?? [],
              confidence: 1.0,
              source: "derived",
            },
          },
          source: {
            agentId: (item.metadata?.parentAgentId as string) ?? "unknown",
            level: 1,
            originalTimestamp: item.createdAt,
          },
          inheritanceWeight: (item.metadata?.decayFactor as number) ?? 1.0,
          visibility: "readonly" as const,
          scope: "inherited",
        });
      }

      // 加载快照
      const snapshots = this.storage.getAllSnapshots();
      for (const snapshot of snapshots) {
        this.snapshots.set(snapshot.id, snapshot);
      }

      log.info(
        `Loaded from storage: ${personalMemories.length} personal, ${sharedMemories.length} shared, ${inheritedMemories.length} inherited`,
      );
    } catch (error) {
      log.error(`Failed to load from storage: ${error}`);
    }
  }

  // ========================================================================
  // 重写父类方法以添加持久化
  // ========================================================================

  async store(
    content: string,
    options: {
      type?: string;
      scope?: MemoryScope;
      importance?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<ScopedMemoryItem> {
    const item = await super.store(content, options);

    if (this.enablePersistence) {
      try {
        if (item.scope === "personal") {
          this.storage.storePersonal(item);
        } else if (item.scope === "shared") {
          this.storage.storeShared(item);
        }

        // 记录写入操作
        this.storage.logWriteOperation({
          id: generateId("op", content + Date.now()),
          agentId: this.agentId,
          type: "store",
          scope: item.scope,
          memoryId: item.id,
          contentHash: this.hashContent(content),
          timestamp: Date.now(),
          applyToShared: item.scope === "shared",
        });
      } catch (error) {
        log.error(`Failed to persist memory: ${error}`);
      }
    }

    return item;
  }

  async inheritFromParent(
    parentAgentId: string,
    parentMemories: MemAtom[],
    options?: {
      strategy?: "full" | "filtered" | "summarized" | "referenced" | "none";
      filter?: MemoryFilter;
      maxMemories?: number;
      decayFactor?: number;
    },
  ): Promise<InheritanceResult> {
    const result = await super.inheritFromParent(parentAgentId, parentMemories, options);

    if (this.enablePersistence && result.inherited > 0) {
      try {
        // 持久化继承的记忆
        for (const item of result.items) {
          // 从 SelectiveMemoryItem 转换为 ScopedMemoryItem 进行存储
          const scopedItem: ScopedMemoryItem = {
            id: item.atom.id,
            content: item.atom.content,
            type: item.atom.contentType as MemoryType,
            scope: "inherited",
            importance: item.atom.strength.current,
            tags: item.atom.meta.tags,
            metadata: {
              parentAgentId: item.source.agentId,
              parentMemoryId: item.atom.id,
              inheritancePath: [item.source.agentId],
              decayFactor: item.inheritanceWeight,
              originalTimestamp: item.source.originalTimestamp,
            },
            createdAt: item.source.originalTimestamp,
            updatedAt: Date.now(),
          };

          this.storage.storeInherited(
            scopedItem,
            parentAgentId,
            item.atom.id,
            [item.source.agentId],
            item.inheritanceWeight,
          );
        }
      } catch (error) {
        log.error(`Failed to persist inherited memories: ${error}`);
      }
    }

    return result;
  }

  async annotateInherited(
    inheritedId: string,
    annotation: string,
  ): Promise<{ success: boolean; annotationId: string; linkedMemoryId: string }> {
    const result = await super.annotateInherited(inheritedId, annotation);

    if (this.enablePersistence && result.success) {
      try {
        this.storage.addAnnotation(inheritedId, annotation);
      } catch (error) {
        log.error(`Failed to persist annotation: ${error}`);
      }
    }

    return result;
  }

  createSnapshot(name: string, options?: { filter?: MemoryFilter }): MemorySnapshot {
    const snapshot = super.createSnapshot(name, options);

    if (this.enablePersistence) {
      try {
        this.storage.saveSnapshot(snapshot);
      } catch (error) {
        log.error(`Failed to persist snapshot: ${error}`);
      }
    }

    return snapshot;
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  private hashContent(content: string): string {
    const crypto = require("node:crypto");
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  // ========================================================================
  // 公共查询方法
  // ========================================================================

  getAllShared(filter?: MemoryFilter): ScopedMemoryItem[] {
    if (this.enablePersistence) {
      return this.storage.getAllShared(filter);
    }
    return Array.from(this.sharedStore.values()).filter((item) => this.matchesFilter(item, filter));
  }

  getAllPersonal(filter?: MemoryFilter): ScopedMemoryItem[] {
    if (this.enablePersistence) {
      return this.storage.getAllPersonal(filter);
    }
    return Array.from(this.personalStore.values()).filter((item) =>
      this.matchesFilter(item, filter),
    );
  }

  getAllInherited(
    parentAgentId?: string,
  ): Array<
    ScopedMemoryItem & { parentAgentId: string; parentMemoryId: string; decayFactor: number }
  > {
    if (this.enablePersistence) {
      return this.storage.getAllInherited(parentAgentId);
    }
    // 从内存中获取继承的记忆
    const result: Array<
      ScopedMemoryItem & { parentAgentId: string; parentMemoryId: string; decayFactor: number }
    > = [];
    for (const [id, item] of this.inheritedMemories.entries()) {
      if (!parentAgentId || item.source.agentId === parentAgentId) {
        result.push({
          id: item.atom.id,
          content: item.atom.content,
          type: item.atom.contentType as MemoryType,
          scope: "inherited",
          importance: item.atom.strength.current,
          tags: item.atom.meta.tags,
          metadata: {
            parentAgentId: item.source.agentId,
            parentMemoryId: item.atom.id,
            inheritancePath: [item.source.agentId],
            decayFactor: item.inheritanceWeight,
          },
          createdAt: item.source.originalTimestamp,
          updatedAt: Date.now(),
          parentAgentId: item.source.agentId,
          parentMemoryId: item.atom.id,
          decayFactor: item.inheritanceWeight,
        });
      }
    }
    return result;
  }

  close(): void {
    if (this.enablePersistence && this.storage) {
      this.storage.close();
    }
    super.close();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createPersistentSelectiveMemoryInheritance(
  agentId: string,
  config?: PersistentInheritanceConfig,
): PersistentSelectiveMemoryInheritance {
  return new PersistentSelectiveMemoryInheritance(agentId, config);
}
