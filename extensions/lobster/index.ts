import type {
  AnyAgentTool,
  NsemclawPluginApi,
  NsemclawPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: NsemclawPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as NsemclawPluginToolFactory,
    { optional: true },
  );
}
