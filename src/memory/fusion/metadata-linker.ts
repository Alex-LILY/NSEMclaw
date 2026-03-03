/**
 * Metadata Linker
 *
 * 管理 NSEM 与 Builtin 元数据数据库之间的外链关系
 *
 * 核心功能：
 * 1. 记录 NSEM 原子与 Builtin 块的映射关系
 * 2. 提供快速的外链查询（无需扫描整个 Builtin 库）
 * 3. 管理外链的缓存和失效
 */

import path from "node:path";
import { homedir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { requireNodeSqlite } from "../sqlite.js";

const log = createSubsystemLogger("metadata-linker");

/** 外链记录 */
export interface MetadataLink {
  /** NSEM 原子 ID */
  atomId: string;
  /** Builtin 数据库中的文件路径 */
  builtinPath: string;
  /** Builtin 中的 chunk ID */
  chunkId: string;
  /** 内容哈希（用于一致性检查） */
  contentHash: string;
  /** 最后访问时间 */
  lastAccessed: number;
  /** 访问次数 */
  accessCount: number;
  /** 是否已迁移到 NSEM */
  migrated: boolean;
  /** 迁移时间 */
  migratedAt?: number;
}

/** 外链统计 */
export interface LinkStats {
  totalLinks: number;
  migratedLinks: number;
  activeLinks: number;
  avgAccessCount: number;
}

/**
 * 元数据外链管理器
 */
export class MetadataLinker {
  private agentId: string;
  private db: DatabaseSync | null = null;
  private cache: Map<string, MetadataLink> = new Map();
  private closed = false;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  /**
   * 初始化外链数据库
   */
  async initialize(): Promise<void> {
    const dbPath = this.getLinksDbPath();

    try {
      // 确保父目录存在
      const fs = await import("node:fs/promises");
      const dir = path.dirname(dbPath);
      await fs.mkdir(dir, { recursive: true });

      const { DatabaseSync } = requireNodeSqlite();
      this.db = new DatabaseSync(dbPath);
      this.ensureSchema();

      // 加载热数据到缓存
      await this.loadHotLinks();

      log.info(`MetadataLinker 初始化完成: ${dbPath}`);
    } catch (err) {
      log.warn(`MetadataLinker 初始化失败: ${err}`);
      throw err;
    }
  }

  /**
   * 关闭外链管理器
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    this.cache.clear();

    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }

    log.debug("MetadataLinker 已关闭");
  }

  /**
   * 创建外链记录
   */
  createLink(link: Omit<MetadataLink, "lastAccessed" | "accessCount">): void {
    if (!this.db || this.closed) return;

    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO metadata_links 
        (atom_id, builtin_path, chunk_id, content_hash, last_accessed, access_count, migrated, migrated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(atom_id) DO UPDATE SET
        builtin_path = excluded.builtin_path,
        chunk_id = excluded.chunk_id,
        content_hash = excluded.content_hash,
        last_accessed = excluded.last_accessed,
        migrated = excluded.migrated,
        migrated_at = excluded.migrated_at
    `);

    stmt.run(
      link.atomId,
      link.builtinPath,
      link.chunkId,
      link.contentHash,
      now,
      0,
      link.migrated ? 1 : 0,
      link.migratedAt ?? null,
    );

    // 更新缓存
    this.cache.set(link.atomId, {
      ...link,
      lastAccessed: now,
      accessCount: 0,
    });

    log.debug(`创建外链: ${link.atomId} -> ${link.builtinPath}`);
  }

  /**
   * 获取外链记录
   */
  getLink(atomId: string): MetadataLink | null {
    // 先查缓存
    const cached = this.cache.get(atomId);
    if (cached) {
      // 更新访问统计
      cached.lastAccessed = Date.now();
      cached.accessCount++;
      return cached;
    }

    // 查数据库
    if (!this.db || this.closed) return null;

    const stmt = this.db.prepare(`
      SELECT * FROM metadata_links WHERE atom_id = ?
    `);

    const row = stmt.get(atomId) as {
      atom_id: string;
      builtin_path: string;
      chunk_id: string;
      content_hash: string;
      last_accessed: number;
      access_count: number;
      migrated: number;
      migrated_at: number | null;
    } | undefined;

    if (!row) return null;

    const link: MetadataLink = {
      atomId: row.atom_id,
      builtinPath: row.builtin_path,
      chunkId: row.chunk_id,
      contentHash: row.content_hash,
      lastAccessed: row.last_accessed,
      accessCount: row.access_count,
      migrated: row.migrated === 1,
      migratedAt: row.migrated_at ?? undefined,
    };

    // 加入缓存
    this.cache.set(atomId, link);

    return link;
  }

  /**
   * 通过 Builtin 路径查找外链
   */
  findLinksByBuiltinPath(builtinPath: string): MetadataLink[] {
    if (!this.db || this.closed) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM metadata_links WHERE builtin_path = ?
    `);

    const rows = stmt.all(builtinPath) as Array<{
      atom_id: string;
      builtin_path: string;
      chunk_id: string;
      content_hash: string;
      last_accessed: number;
      access_count: number;
      migrated: number;
      migrated_at: number | null;
    }>;

    return rows.map((row) => ({
      atomId: row.atom_id,
      builtinPath: row.builtin_path,
      chunkId: row.chunk_id,
      contentHash: row.content_hash,
      lastAccessed: row.last_accessed,
      accessCount: row.access_count,
      migrated: row.migrated === 1,
      migratedAt: row.migrated_at ?? undefined,
    }));
  }

  /**
   * 标记外链为已迁移
   */
  markAsMigrated(atomId: string): void {
    if (!this.db || this.closed) return;

    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE metadata_links 
      SET migrated = 1, migrated_at = ?
      WHERE atom_id = ?
    `);

    stmt.run(now, atomId);

    // 更新缓存
    const cached = this.cache.get(atomId);
    if (cached) {
      cached.migrated = true;
      cached.migratedAt = now;
    }

    log.debug(`标记已迁移: ${atomId}`);
  }

  /**
   * 更新访问统计
   */
  recordAccess(atomId: string): void {
    if (!this.db || this.closed) return;

    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE metadata_links 
      SET last_accessed = ?, access_count = access_count + 1
      WHERE atom_id = ?
    `);

    stmt.run(now, atomId);

    // 更新缓存
    const cached = this.cache.get(atomId);
    if (cached) {
      cached.lastAccessed = now;
      cached.accessCount++;
    }
  }

  /**
   * 获取热门外链（按访问次数排序）
   */
  getHotLinks(limit: number = 100): MetadataLink[] {
    if (!this.db || this.closed) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM metadata_links 
      WHERE migrated = 0
      ORDER BY access_count DESC, last_accessed DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      atom_id: string;
      builtin_path: string;
      chunk_id: string;
      content_hash: string;
      last_accessed: number;
      access_count: number;
      migrated: number;
      migrated_at: number | null;
    }>;

    return rows.map((row) => ({
      atomId: row.atom_id,
      builtinPath: row.builtin_path,
      chunkId: row.chunk_id,
      contentHash: row.content_hash,
      lastAccessed: row.last_accessed,
      accessCount: row.access_count,
      migrated: row.migrated === 1,
      migratedAt: row.migrated_at ?? undefined,
    }));
  }

  /**
   * 获取待迁移的外链（访问次数超过阈值）
   */
  getPendingMigrations(threshold: number): MetadataLink[] {
    if (!this.db || this.closed) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM metadata_links 
      WHERE migrated = 0 AND access_count >= ?
      ORDER BY access_count DESC
    `);

    const rows = stmt.all(threshold) as Array<{
      atom_id: string;
      builtin_path: string;
      chunk_id: string;
      content_hash: string;
      last_accessed: number;
      access_count: number;
      migrated: number;
      migrated_at: number | null;
    }>;

    return rows.map((row) => ({
      atomId: row.atom_id,
      builtinPath: row.builtin_path,
      chunkId: row.chunk_id,
      contentHash: row.content_hash,
      lastAccessed: row.last_accessed,
      accessCount: row.access_count,
      migrated: row.migrated === 1,
      migratedAt: row.migrated_at ?? undefined,
    }));
  }

  /**
   * 获取统计信息
   */
  getStats(): LinkStats {
    if (!this.db || this.closed) {
      return {
        totalLinks: 0,
        migratedLinks: 0,
        activeLinks: 0,
        avgAccessCount: 0,
      };
    }

    const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM metadata_links`);
    const { count: totalLinks } = totalStmt.get() as { count: number };

    const migratedStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM metadata_links WHERE migrated = 1`,
    );
    const { count: migratedLinks } = migratedStmt.get() as { count: number };

    const activeStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM metadata_links WHERE migrated = 0`,
    );
    const { count: activeLinks } = activeStmt.get() as { count: number };

    const avgStmt = this.db.prepare(
      `SELECT AVG(access_count) as avg FROM metadata_links`,
    );
    const { avg: avgAccessCount } = avgStmt.get() as { avg: number };

    return {
      totalLinks,
      migratedLinks,
      activeLinks,
      avgAccessCount: avgAccessCount ?? 0,
    };
  }

  /**
   * 清理已迁移的链接（可选，用于空间回收）
   */
  cleanupMigratedLinks(olderThanDays: number = 30): number {
    if (!this.db || this.closed) return 0;

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      DELETE FROM metadata_links 
      WHERE migrated = 1 AND migrated_at < ?
    `);

    const result = stmt.run(cutoffTime);

    const changes = Number(result.changes);
    log.info(`清理了 ${changes} 条已迁移的链接`);
    return changes;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private getLinksDbPath(): string {
    return path.join(
      homedir(),
      ".nsemclaw",
      "nsem2",
      "fusion",
      this.agentId,
      "metadata-links.sqlite",
    );
  }

  private ensureSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata_links (
        atom_id TEXT PRIMARY KEY,
        builtin_path TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        last_accessed INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0,
        migrated INTEGER NOT NULL DEFAULT 0,
        migrated_at INTEGER,
        
        UNIQUE(atom_id)
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_builtin_path ON metadata_links(builtin_path)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_migrated ON metadata_links(migrated)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_access_count ON metadata_links(access_count DESC)
    `);
  }

  private async loadHotLinks(): Promise<void> {
    // 加载最近访问的 1000 条链接到缓存
    const hotLinks = this.getHotLinks(1000);
    for (const link of hotLinks) {
      this.cache.set(link.atomId, link);
    }
    log.debug(`加载了 ${hotLinks.length} 条热数据到缓存`);
  }
}
