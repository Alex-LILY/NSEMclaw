import type { NsemclawPluginApi } from "nsemclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "nsemclaw/plugin-sdk";
import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: NsemclawPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
