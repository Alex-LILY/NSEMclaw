import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import type { NsemclawConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import type { TelegramProbe } from "../../telegram/probe.js";
import type { TelegramTokenResolution } from "../../telegram/token.js";
import {
  createChannelTestPluginBase,
  createMSTeamsTestPluginBase,
  createOutboundTestPlugin,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { getChannelPluginCatalogEntry, listChannelPluginCatalogEntries } from "./catalog.js";
import { resolveChannelConfigWrites } from "./config-writes.js";
import {
  listTelegramDirectoryGroupsFromConfig,
  listTelegramDirectoryPeersFromConfig,
} from "./directory-config.js";
import { listChannelPlugins } from "./index.js";
import { loadChannelPlugin } from "./load.js";
import { loadChannelOutboundAdapter } from "./outbound/load.js";
import type { ChannelDirectoryEntry, ChannelOutboundAdapter, ChannelPlugin } from "./types.js";
import type { BaseProbeResult, BaseTokenResolution } from "./types.js";

describe("channel plugin registry", () => {
  const emptyRegistry = createTestRegistry([]);

  const createPlugin = (id: string): ChannelPlugin => ({
    id,
    meta: {
      id,
      label: id,
      selectionLabel: id,
      docsPath: `/channels/${id}`,
      blurb: "test",
    },
    capabilities: { chatTypes: ["direct"] },
    config: {
      listAccountIds: () => [],
      resolveAccount: () => ({}),
    },
  });

  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("sorts channel plugins by configured order", () => {
    const registry = createTestRegistry(
      ["msteams", "telegram", "matrix"].map((id) => ({
        pluginId: id,
        plugin: createPlugin(id),
        source: "test",
      })),
    );
    setActivePluginRegistry(registry);
    const pluginIds = listChannelPlugins().map((plugin) => plugin.id);
    expect(pluginIds).toEqual(["matrix", "msteams", "telegram"]);
  });
});

describe("channel plugin catalog", () => {
  it("includes Microsoft Teams", () => {
    const entry = getChannelPluginCatalogEntry("msteams");
    expect(entry?.install.npmSpec).toBe("@openclaw/msteams");
    expect(entry?.meta.aliases).toContain("teams");
  });

  it("lists plugin catalog entries", () => {
    const ids = listChannelPluginCatalogEntries().map((entry) => entry.id);
    expect(ids).toContain("msteams");
  });

  it("includes external catalog entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-catalog-"));
    const catalogPath = path.join(dir, "catalog.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        entries: [
          {
            name: "@openclaw/demo-channel",
            openclaw: {
              channel: {
                id: "demo-channel",
                label: "Demo Channel",
                selectionLabel: "Demo Channel",
                docsPath: "/channels/demo-channel",
                blurb: "Demo entry",
                order: 999,
              },
              install: {
                npmSpec: "@openclaw/demo-channel",
              },
            },
          },
        ],
      }),
    );

    const ids = listChannelPluginCatalogEntries({ catalogPaths: [catalogPath] }).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("demo-channel");
  });
});

const emptyRegistry = createTestRegistry([]);

const msteamsOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  sendText: async () => ({ channel: "msteams", messageId: "m1" }),
  sendMedia: async () => ({ channel: "msteams", messageId: "m2" }),
};

const msteamsPlugin: ChannelPlugin = {
  ...createMSTeamsTestPluginBase(),
  outbound: msteamsOutbound,
};

const registryWithMSTeams = createTestRegistry([
  { pluginId: "msteams", plugin: msteamsPlugin, source: "test" },
]);

const msteamsOutboundV2: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  sendText: async () => ({ channel: "msteams", messageId: "m3" }),
  sendMedia: async () => ({ channel: "msteams", messageId: "m4" }),
};

const msteamsPluginV2 = createOutboundTestPlugin({
  id: "msteams",
  label: "Microsoft Teams",
  outbound: msteamsOutboundV2,
});

const registryWithMSTeamsV2 = createTestRegistry([
  { pluginId: "msteams", plugin: msteamsPluginV2, source: "test-v2" },
]);

const mstNoOutboundPlugin = createChannelTestPluginBase({
  id: "msteams",
  label: "Microsoft Teams",
});

const registryWithMSTeamsNoOutbound = createTestRegistry([
  { pluginId: "msteams", plugin: mstNoOutboundPlugin, source: "test-no-outbound" },
]);

function makeTelegramConfigWritesCfg(accountIdKey: string) {
  return {
    channels: {
      telegram: {
        configWrites: true,
        accounts: {
          [accountIdKey]: { configWrites: false },
        },
      },
    },
  };
}

type DirectoryListFn = (params: {
  cfg: NsemclawConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
}) => Promise<ChannelDirectoryEntry[]>;

async function listDirectoryEntriesWithDefaults(listFn: DirectoryListFn, cfg: NsemclawConfig) {
  return await listFn({
    cfg,
    accountId: "default",
    query: null,
    limit: null,
  });
}

async function expectDirectoryIds(
  listFn: DirectoryListFn,
  cfg: NsemclawConfig,
  expected: string[],
  options?: { sorted?: boolean },
) {
  const entries = await listDirectoryEntriesWithDefaults(listFn, cfg);
  const ids = entries.map((entry) => entry.id);
  expect(options?.sorted ? ids.toSorted() : ids).toEqual(expected);
}

describe("channel plugin loader", () => {
  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("loads channel plugins from the active registry", async () => {
    setActivePluginRegistry(registryWithMSTeams);
    const plugin = await loadChannelPlugin("msteams");
    expect(plugin).toBe(msteamsPlugin);
  });

  it("loads outbound adapters from registered plugins", async () => {
    setActivePluginRegistry(registryWithMSTeams);
    const outbound = await loadChannelOutboundAdapter("msteams");
    expect(outbound).toBe(msteamsOutbound);
  });

  it("refreshes cached plugin values when registry changes", async () => {
    setActivePluginRegistry(registryWithMSTeams);
    expect(await loadChannelPlugin("msteams")).toBe(msteamsPlugin);
    setActivePluginRegistry(registryWithMSTeamsV2);
    expect(await loadChannelPlugin("msteams")).toBe(msteamsPluginV2);
  });

  it("refreshes cached outbound values when registry changes", async () => {
    setActivePluginRegistry(registryWithMSTeams);
    expect(await loadChannelOutboundAdapter("msteams")).toBe(msteamsOutbound);
    setActivePluginRegistry(registryWithMSTeamsV2);
    expect(await loadChannelOutboundAdapter("msteams")).toBe(msteamsOutboundV2);
  });

  it("returns undefined when plugin has no outbound adapter", async () => {
    setActivePluginRegistry(registryWithMSTeamsNoOutbound);
    expect(await loadChannelOutboundAdapter("msteams")).toBeUndefined();
  });
});

describe("BaseProbeResult assignability", () => {
  it("TelegramProbe satisfies BaseProbeResult", () => {
    expectTypeOf<TelegramProbe>().toMatchTypeOf<BaseProbeResult>();
  });
});

describe("BaseTokenResolution assignability", () => {
  it("Telegram token resolution satisfies BaseTokenResolution", () => {
    expectTypeOf<TelegramTokenResolution>().toMatchTypeOf<BaseTokenResolution>();
  });
});

describe("resolveChannelConfigWrites", () => {
  it("defaults to allow when unset", () => {
    const cfg = {};
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram" })).toBe(true);
  });

  it("blocks when channel config disables writes", () => {
    const cfg = { channels: { telegram: { configWrites: false } } };
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram" })).toBe(false);
  });

  it("account override wins over channel default", () => {
    const cfg = makeTelegramConfigWritesCfg("work");
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram", accountId: "work" })).toBe(
      false,
    );
  });

  it("matches account ids case-insensitively", () => {
    const cfg = makeTelegramConfigWritesCfg("Work");
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram", accountId: "work" })).toBe(
      false,
    );
  });
});

describe("directory (config-backed)", () => {
  it("lists Telegram peers/groups from config", async () => {
    const cfg = {
      channels: {
        telegram: {
          botToken: "telegram-test",
          allowFrom: ["123", "alice", "tg:@bob"],
          dms: { "456": {} },
          groups: { "-1001": {}, "*": {} },
        },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
    } as any;

    await expectDirectoryIds(
      listTelegramDirectoryPeersFromConfig,
      cfg,
      ["123", "456", "@alice", "@bob"],
      {
        sorted: true,
      },
    );
    await expectDirectoryIds(listTelegramDirectoryGroupsFromConfig, cfg, ["-1001"]);
  });

  it("applies query and limit filtering for config-backed directories", async () => {
    const cfg = {
      channels: {
        telegram: {
          botToken: "telegram-test",
          groups: { "-1001": {}, "-1002": {}, "-2001": {} },
        },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
    } as any;

    const telegramGroups = await listTelegramDirectoryGroupsFromConfig({
      cfg,
      accountId: "default",
      query: "-100",
      limit: 1,
    });
    expect(telegramGroups.map((entry) => entry.id)).toEqual(["-1001"]);
  });
});
