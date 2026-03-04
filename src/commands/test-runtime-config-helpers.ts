import { vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import type { MockFn } from "../test-utils/vitest-mock-fn.js";

export const baseConfigSnapshot = {
  path: "/tmp/nsemclaw.json",
  exists: true,
  raw: "{}",
  parsed: {},
  valid: true,
  config: {},
  issues: [],
  legacyIssues: [],
};

export type TestRuntime = {
  log: MockFn<RuntimeEnv["log"]>;
  warn: MockFn<RuntimeEnv["warn"]>;
  error: MockFn<RuntimeEnv["error"]>;
  exit: MockFn<RuntimeEnv["exit"]>;
};

export function createTestRuntime(): TestRuntime {
  const log = vi.fn() as MockFn<RuntimeEnv["log"]>;
  const warn = vi.fn() as MockFn<RuntimeEnv["warn"]>;
  const error = vi.fn() as MockFn<RuntimeEnv["error"]>;
  const exit = vi.fn((_: number) => undefined) as MockFn<RuntimeEnv["exit"]>;
  return {
    log,
    warn,
    error,
    exit,
  };
}
