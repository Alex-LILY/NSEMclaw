import path from "node:path";
import { describe, expect, it, test, vi } from "vitest";
import type { NsemclawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import {
  buildCleanupPlan,
  removeStateAndLinkedPaths,
  removeWorkspaceDirs,
} from "./cleanup-utils.js";
import { applyAgentDefaultPrimaryModel } from "./model-default.js";

describe("buildCleanupPlan", () => {
  test("resolves inside-state flags and workspace dirs", () => {
    const tmpRoot = path.join(path.parse(process.cwd()).root, "tmp");
    const cfg = {
      agents: {
        defaults: { workspace: path.join(tmpRoot, "nsemclaw-workspace-1") },
        list: [{ workspace: path.join(tmpRoot, "nsemclaw-workspace-2") }],
      },
    };
    const plan = buildCleanupPlan({
      cfg: cfg as unknown as NsemclawConfig,
      stateDir: path.join(tmpRoot, "openclaw-state"),
      configPath: path.join(tmpRoot, "openclaw-state", "nsemclaw.json"),
      oauthDir: path.join(tmpRoot, "openclaw-oauth"),
    });

    expect(plan.configInsideState).toBe(true);
    expect(plan.oauthInsideState).toBe(false);
    expect(new Set(plan.workspaceDirs)).toEqual(
      new Set([
        path.join(tmpRoot, "nsemclaw-workspace-1"),
        path.join(tmpRoot, "nsemclaw-workspace-2"),
      ]),
    );
  });
});

describe("applyAgentDefaultPrimaryModel", () => {
  it("does not mutate when already set", () => {
    const cfg = { agents: { defaults: { model: { primary: "a/b" } } } } as NsemclawConfig;
    const result = applyAgentDefaultPrimaryModel({ cfg, model: "a/b" });
    expect(result.changed).toBe(false);
    expect(result.next).toBe(cfg);
  });

  it("normalizes legacy models", () => {
    const cfg = { agents: { defaults: { model: { primary: "legacy" } } } } as NsemclawConfig;
    const result = applyAgentDefaultPrimaryModel({
      cfg,
      model: "a/b",
      legacyModels: new Set(["legacy"]),
    });
    expect(result.changed).toBe(false);
    expect(result.next).toBe(cfg);
  });
});

describe("cleanup path removals", () => {
  function createRuntimeMock() {
    return {
      log: vi.fn<(message: string) => void>(),
      error: vi.fn<(message: string) => void>(),
    } as unknown as RuntimeEnv & {
      log: ReturnType<typeof vi.fn<(message: string) => void>>;
      error: ReturnType<typeof vi.fn<(message: string) => void>>;
    };
  }

  it("removes state and only linked paths outside state", async () => {
    const runtime = createRuntimeMock();
    const tmpRoot = path.join(path.parse(process.cwd()).root, "tmp", "openclaw-cleanup");
    await removeStateAndLinkedPaths(
      {
        stateDir: path.join(tmpRoot, "state"),
        configPath: path.join(tmpRoot, "state", "nsemclaw.json"),
        oauthDir: path.join(tmpRoot, "oauth"),
        configInsideState: true,
        oauthInsideState: false,
      },
      runtime,
      { dryRun: true },
    );

    const joinedLogs = runtime.log.mock.calls
      .map(([line]) => line.replaceAll("\\", "/"))
      .join("\n");
    expect(joinedLogs).toContain("/tmp/openclaw-cleanup/state");
    expect(joinedLogs).toContain("/tmp/openclaw-cleanup/oauth");
    expect(joinedLogs).not.toContain("nsemclaw.json");
  });

  it("removes every workspace directory", async () => {
    const runtime = createRuntimeMock();
    const workspaces = ["/tmp/nsemclaw-workspace-1", "/tmp/nsemclaw-workspace-2"];

    await removeWorkspaceDirs(workspaces, runtime, { dryRun: true });

    const logs = runtime.log.mock.calls.map(([line]) => line);
    expect(logs).toContain("[dry-run] remove /tmp/nsemclaw-workspace-1");
    expect(logs).toContain("[dry-run] remove /tmp/nsemclaw-workspace-2");
  });
});
