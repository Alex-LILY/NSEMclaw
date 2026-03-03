#!/usr/bin/env node

import module from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Prevent respawn to avoid output issues
process.env.NSEMCLAW_NO_RESPAWN = "1";

// Fix process.argv so entry.js can parse CLI arguments
// entry.js expects argv[1] to be the entry file name
const originalArgv = process.argv.slice();
if (process.argv.length > 0) {
  // Replace the script path with entry.js
  process.argv = [process.argv[0], "entry.js", ...process.argv.slice(2)];
}

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isModuleNotFoundError = (err) =>
  err && typeof err === "object" && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";

const installProcessWarningFilter = async () => {
  // Keep bootstrap warnings consistent with the TypeScript runtime.
  for (const specifier of ["./dist/warning-filter.js", "./dist/warning-filter.mjs"]) {
    try {
      const mod = await import(join(__dirname, specifier));
      if (typeof mod.installProcessWarningFilter === "function") {
        mod.installProcessWarningFilter();
        return;
      }
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }
};

await installProcessWarningFilter();

// Import and run the CLI
const entryPath = join(__dirname, "dist", "entry.js");
try {
  await import(entryPath);
} catch (err) {
  if (isModuleNotFoundError(err)) {
    // Try .mjs extension
    const entryPathMjs = join(__dirname, "dist", "entry.mjs");
    try {
      await import(entryPathMjs);
    } catch (err2) {
      if (isModuleNotFoundError(err2)) {
        console.error("nsemclaw: missing dist/entry.(m)js (build output). Run 'pnpm build' first.");
        process.exit(1);
      }
      throw err2;
    }
  } else {
    throw err;
  }
}

// Keep the process alive to allow async CLI operations to complete
// The CLI will call process.exit() when done
