import type { NsemclawConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: NsemclawConfig, pluginId: string): NsemclawConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}
