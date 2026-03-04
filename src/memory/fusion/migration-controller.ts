/**
 * Migration Controller
 *
 * 管理从 Builtin Memory 到 NSEM 的渐进迁移
 *
 * 核心功能：
 * 1. 记录数据访问频率
 * 2. 自动触发热门数据的迁移
 * 3. 管理迁移队列和批量处理
 * 4. 提供迁移状态监控
 */

import path from "node:path";
import { homedir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import type { NSEMFusionCore } from "../../cognitive-core/NSEMFusionCore.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { requireNodeSqlite } from "../sqlite.js";
import type { MemorySyncProgressUpdate } from "../types.js";

const log = createSubsystemLogger("migration-controller");

/** 迁移记录 */
interface MigrationRecord {
  id: string;
  builtinPath: string;
  content: string;
  contentHash: string;
  accessCount: number;
  firstAccessed: number;
  lastAccessed: number;
  status: "pending" | "migrating" | "completed" | "failed";
  error?: string;
  attempts: number;
  migratedAt?: number;
}

/** 迁移统计 */
export interface MigrationStatus {
  pendingCount: number;
  migratingCount: number;
  completedCount: number;
  failedCount: number;
  totalAccessRecords: number;
}

/**
 * 迁移控制器
 */
export class MigrationController {
  private agentId: string;
  private nsem: any;  // 支持 NSEMFusionCore
  private threshold: number;
  private db: DatabaseSync | null = null;
  private closed = false;
  private isRunning = false;

  // 访问记录缓存（用于快速判断）
  private accessCache: Map<string, { count: number; lastAccessed: number }> = new Map();

  constructor(agentId: string, nsem: any, threshold: number) {
    this.agentId = agentId;
    this.nsem = nsem;
    this.threshold = threshold;
  }

  /**
   * 初始化迁移控制器
   */
  async initialize(): Promise<void> {
    const dbPath = this.getMigrationDbPath();

    try {
      // 确保父目录存在
      const fs = await import("node:fs/promises");
      const dir = path.dirname(dbPath);
      await fs.mkdir(dir, { recursive: true });

      const { DatabaseSync } = requireNodeSqlite();
      this.db = new DatabaseSync(dbPath);
      this.ensureSchema();

      // 加载现有迁移记录到缓存
      this.loadAccessCache();

      log.info(`MigrationController 初始化完成 (threshold=${this.threshold})`);
    } catch (err) {
      log.warn(`MigrationController 初始化失败: ${err}`);
      throw err;
    }
  }

  /**
   * 关闭迁移控制器
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    this.accessCache.clear();

    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }

    log.debug("MigrationController 已关闭");
  }

  /**
   * 记录数据访问
   *
   * 返回 true 表示该数据应该被迁移
   */
  recordAccess(builtinPath: string, content: string): boolean {
    if (this.closed) return false;

    const contentHash = this.hashContent(content);
    const recordId = `${builtinPath}:${contentHash}`;
    const now = Date.now();

    // 更新缓存
    const cached = this.accessCache.get(recordId);
    if (cached) {
      cached.count++;
      cached.lastAccessed = now;
    } else {
      this.accessCache.set(recordId, { count: 1, lastAccessed: now });
    }

    const currentCount = this.accessCache.get(recordId)!.count;

    // 检查是否达到迁移阈值
    const shouldMigrate = currentCount >= this.threshold;

    // 保存到数据库（异步）
    void this.saveAccessRecord(recordId, builtinPath, contentHash, currentCount, now);

    // 如果达到阈值且未在迁移队列中，添加到队列
    if (shouldMigrate) {
      const isPending = this.isPendingMigration(recordId);
      if (!isPending) {
        this.addToMigrationQueue(recordId, builtinPath, content, contentHash);
      }
    }

    return shouldMigrate;
  }

  /**
   * 执行待处理的迁移
   */
  async runPendingMigrations(
    progress?: (update: MemorySyncProgressUpdate) => void,
  ): Promise<number> {
    if (this.closed || this.isRunning) return 0;

    this.isRunning = true;
    let migratedCount = 0;

    try {
      const pending = this.getPendingMigrations(10); // 每次最多处理 10 条

      if (pending.length === 0) {
        this.isRunning = false;
        return 0;
      }

      log.info(`开始迁移 ${pending.length} 条记录`);

      progress?.({
        completed: 0,
        total: pending.length,
        label: `Migrating ${pending.length} records to NSEM`,
      });

      for (let i = 0; i < pending.length; i++) {
        const record = pending[i];

        try {
          // 标记为迁移中
          this.updateMigrationStatus(record.id, "migrating");

          // 执行迁移
          await this.migrateRecord(record);

          // 标记为完成
          this.updateMigrationStatus(record.id, "completed", Date.now());
          migratedCount++;

          progress?.({
            completed: i + 1,
            total: pending.length,
            label: `Migrated ${record.builtinPath}`,
          });

          log.debug(`迁移完成: ${record.builtinPath}`);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.updateMigrationStatus(record.id, "failed", undefined, error);

          log.warn(`迁移失败 ${record.builtinPath}: ${error}`);
        }
      }

      log.info(`迁移完成: ${migratedCount}/${pending.length}`);
    } finally {
      this.isRunning = false;
    }

    return migratedCount;
  }

  /**
   * 强制迁移指定内容
   */
  async forceMigrate(builtinPath: string, content: string): Promise<boolean> {
    const contentHash = this.hashContent(content);
    const recordId = `${builtinPath}:${contentHash}`;

    try {
      // 检查是否已迁移
      if (this.isAlreadyMigrated(recordId)) {
        log.debug(`内容已迁移: ${builtinPath}`);
        return true;
      }

      // 添加到队列并立即迁移
      this.addToMigrationQueue(recordId, builtinPath, content, contentHash);

      const record: MigrationRecord = {
        id: recordId,
        builtinPath,
        content,
        contentHash,
        accessCount: this.threshold,
        firstAccessed: Date.now(),
        lastAccessed: Date.now(),
        status: "migrating",
        attempts: 0,
      };

      await this.migrateRecord(record);
      this.updateMigrationStatus(recordId, "completed", Date.now());

      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.updateMigrationStatus(recordId, "failed", undefined, error);
      log.warn(`强制迁移失败 ${builtinPath}: ${error}`);
      return false;
    }
  }

  /**
   * 获取迁移状态
   */
  getStatus(): MigrationStatus {
    if (!this.db || this.closed) {
      return {
        pendingCount: 0,
        migratingCount: 0,
        completedCount: 0,
        failedCount: 0,
        totalAccessRecords: 0,
      };
    }

    const pendingStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM migration_queue WHERE status = 'pending'`,
    );
    const { count: pendingCount } = pendingStmt.get() as { count: number };

    const migratingStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM migration_queue WHERE status = 'migrating'`,
    );
    const { count: migratingCount } = migratingStmt.get() as { count: number };

    const completedStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM migration_queue WHERE status = 'completed'`,
    );
    const { count: completedCount } = completedStmt.get() as { count: number };

    const failedStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM migration_queue WHERE status = 'failed'`,
    );
    const { count: failedCount } = failedStmt.get() as { count: number };

    const accessStmt = this.db.prepare(`SELECT COUNT(*) as count FROM access_records`);
    const { count: totalAccessRecords } = accessStmt.get() as { count: number };

    return {
      pendingCount,
      migratingCount,
      completedCount,
      failedCount,
      totalAccessRecords,
    };
  }

  /**
   * 重试失败的迁移
   */
  async retryFailedMigrations(maxRetries: number = 3): Promise<number> {
    if (!this.db || this.closed) return 0;

    const stmt = this.db.prepare(`
      SELECT * FROM migration_queue 
      WHERE status = 'failed' AND attempts < ?
      LIMIT 10
    `);

    const rows = stmt.all(maxRetries) as Array<{
      id: string;
      builtin_path: string;
      content: string;
      content_hash: string;
      access_count: number;
      attempts: number;
    }>;

    let retried = 0;

    for (const row of rows) {
      // 重置状态为 pending
      const updateStmt = this.db.prepare(`
        UPDATE migration_queue 
        SET status = 'pending', error = NULL
        WHERE id = ?
      `);
      updateStmt.run(row.id);
      retried++;
    }

    if (retried > 0) {
      log.info(`标记 ${retried} 条失败记录待重试`);
      // 立即执行迁移
      await this.runPendingMigrations();
    }

    return retried;
  }

  /**
   * 清理已完成的迁移记录（可选）
   */
  cleanupCompletedMigrations(olderThanDays: number = 30): number {
    if (!this.db || this.closed) return 0;

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      DELETE FROM migration_queue 
      WHERE status = 'completed' AND migrated_at < ?
    `);

    const result = stmt.run(cutoffTime);

    const changes = Number(result.changes);
    log.info(`清理了 ${changes} 条已完成的迁移记录`);
    return changes;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private getMigrationDbPath(): string {
    return path.join(
      homedir(),
      ".nsemclaw",
      "nsem2",
      "fusion",
      this.agentId,
      "migration-controller.sqlite",
    );
  }

  private ensureSchema(): void {
    if (!this.db) return;

    // 访问记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS access_records (
        id TEXT PRIMARY KEY,
        builtin_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0,
        first_accessed INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        
        UNIQUE(id)
      )
    `);

    // 迁移队列表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migration_queue (
        id TEXT PRIMARY KEY,
        builtin_path TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        access_count INTEGER NOT NULL,
        first_accessed INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        migrated_at INTEGER,
        
        UNIQUE(id)
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_status ON migration_queue(status)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_access_count ON access_records(access_count DESC)
    `);
  }

  private loadAccessCache(): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      SELECT id, access_count, last_accessed FROM access_records
      WHERE access_count >= ? / 2
      LIMIT 10000
    `);

    const rows = stmt.all(this.threshold) as Array<{
      id: string;
      access_count: number;
      last_accessed: number;
    }>;

    for (const row of rows) {
      this.accessCache.set(row.id, {
        count: row.access_count,
        lastAccessed: row.last_accessed,
      });
    }

    log.debug(`加载了 ${rows.length} 条访问记录到缓存`);
  }

  private async saveAccessRecord(
    id: string,
    builtinPath: string,
    contentHash: string,
    count: number,
    timestamp: number,
  ): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO access_records (id, builtin_path, content_hash, access_count, first_accessed, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_count = excluded.access_count,
        last_accessed = excluded.last_accessed
    `);

    stmt.run(id, builtinPath, contentHash, count, timestamp, timestamp);
  }

  private addToMigrationQueue(
    id: string,
    builtinPath: string,
    content: string,
    contentHash: string,
  ): void {
    if (!this.db) return;

    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO migration_queue 
        (id, builtin_path, content, content_hash, access_count, first_accessed, last_accessed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      ON CONFLICT(id) DO NOTHING
    `);

    stmt.run(id, builtinPath, content, contentHash, this.threshold, now, now);

    log.debug(`添加到迁移队列: ${builtinPath}`);
  }

  private isPendingMigration(id: string): boolean {
    if (!this.db) return false;

    const stmt = this.db.prepare(
      `SELECT 1 FROM migration_queue WHERE id = ? AND status IN ('pending', 'migrating')`,
    );

    const row = stmt.get(id);
    return row !== undefined;
  }

  private isAlreadyMigrated(id: string): boolean {
    if (!this.db) return false;

    const stmt = this.db.prepare(
      `SELECT 1 FROM migration_queue WHERE id = ? AND status = 'completed'`,
    );

    const row = stmt.get(id);
    return row !== undefined;
  }

  private getPendingMigrations(limit: number): MigrationRecord[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM migration_queue 
      WHERE status = 'pending'
      ORDER BY access_count DESC, last_accessed DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      id: string;
      builtin_path: string;
      content: string;
      content_hash: string;
      access_count: number;
      first_accessed: number;
      last_accessed: number;
      attempts: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      builtinPath: row.builtin_path,
      content: row.content,
      contentHash: row.content_hash,
      accessCount: row.access_count,
      firstAccessed: row.first_accessed,
      lastAccessed: row.last_accessed,
      status: "pending" as const,
      attempts: row.attempts,
    }));
  }

  private updateMigrationStatus(
    id: string,
    status: MigrationRecord["status"],
    migratedAt?: number,
    error?: string,
  ): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE migration_queue 
      SET status = ?, migrated_at = ?, error = ?, attempts = attempts + 1
      WHERE id = ?
    `);

    stmt.run(status, migratedAt ?? null, error ?? null, id);
  }

  private async migrateRecord(record: MigrationRecord): Promise<void> {
    // 将内容摄入到 NSEM
    await this.nsem.ingest(record.content, {
      type: "fact",
      source: record.builtinPath,
      tags: ["migrated-from-builtin", `original-hash:${record.contentHash}`],
    });

    // 触发一次进化以整合新数据
    await this.nsem.evolve();
  }

  private hashContent(content: string): string {
    // 简单的内容哈希
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}
