import type { NsemclawPluginApi } from "nsemclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "nsemclaw/plugin-sdk";
import { createSynologyChatPlugin } from "./src/channel.js";
import { setSynologyRuntime } from "./src/runtime.js";

const plugin = {
  id: "synology-chat",
  name: "Synology Chat",
  description: "Native Synology Chat channel plugin for Nsemclaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: NsemclawPluginApi) {
    setSynologyRuntime(api.runtime);
    api.registerChannel({ plugin: createSynologyChatPlugin() });
  },
};

export default plugin;
