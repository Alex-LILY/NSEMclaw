/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): { lastInsertRowid: number; changes: number };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  class Database {
    constructor(path: string, options?: { verbose?: (msg: string) => void });
    prepare(sql: string): Statement;
    exec(sql: string): void;
    close(): void;
    pragma(pragma: string, options?: { simple?: boolean }): unknown;
    [key: string]: unknown;
  }

  export = Database;
}
