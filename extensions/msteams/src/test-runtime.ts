import os from "node:os";
import path from "node:path";
import type { PluginRuntime } from "nsemclaw/plugin-sdk";

export const msteamsRuntimeStub = {
  state: {
    resolveStateDir: (env: NodeJS.ProcessEnv = process.env, homedir?: () => string) => {
      const override = env.NSEMCLAW_STATE_DIR?.trim() || env.NSEMCLAW_STATE_DIR?.trim();
      if (override) {
        return override;
      }
      const resolvedHome = homedir ? homedir() : os.homedir();
      return path.join(resolvedHome, ".nsemclaw");
    },
  },
} as unknown as PluginRuntime;
