import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

const baseConfig = {
  env,
  fixedExtension: false,
  platform: "node" as const,
  // Exclude native dependencies from bundling
  external: [
    "better-sqlite3",
    "bindings",
    "file-uri-to-path",
  ],
};

export default defineConfig([
  {
    ...baseConfig,
    entry: "src/index.ts",
  },
  {
    ...baseConfig,
    entry: "src/entry.ts",
  },
  {
    ...baseConfig,
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
  },
  {
    ...baseConfig,
    entry: "src/infra/warning-filter.ts",
  },
  {
    ...baseConfig,
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
  },
  {
    ...baseConfig,
    entry: "src/plugin-sdk/account-id.ts",
    outDir: "dist/plugin-sdk",
  },
  {
    ...baseConfig,
    entry: "src/extensionAPI.ts",
  },
  {
    ...baseConfig,
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
  },
  // Cognitive Core exports
  {
    ...baseConfig,
    entry: "src/cognitive-core/vision/index.ts",
    outDir: "dist/cognitive-core/vision",
  },
  {
    ...baseConfig,
    entry: "src/cognitive-core/utils/model-downloader.ts",
    outDir: "dist/cognitive-core/utils",
  },
]);
