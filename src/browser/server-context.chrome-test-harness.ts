import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/nsemclaw" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchNsemclawChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveNsemclawUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopNsemclawChrome: vi.fn(async () => {}),
}));
