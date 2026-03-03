import type { Command } from "commander";
import JSON5 from "json5";
import { readConfigFileSnapshot, writeConfigFile } from "../config/config.js";
import { isBlockedObjectKey } from "../config/prototype-keys.js";
import { redactConfigObject } from "../config/redact-snapshot.js";
import { danger, info } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";
import { formatCliCommand } from "./command-format.js";

type PathSegment = string;
type ConfigSetParseOpts = {
  strictJson?: boolean;
};

const OLLAMA_API_KEY_PATH: PathSegment[] = ["models", "providers", "ollama", "apiKey"];
const OLLAMA_PROVIDER_PATH: PathSegment[] = ["models", "providers", "ollama"];
const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";

function isIndexSegment(raw: string): boolean {
  return /^[0-9]+$/.test(raw);
}

function parsePath(raw: string): PathSegment[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const parts: string[] = [];
  let current = "";
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === "\\") {
      const next = trimmed[i + 1];
      if (next) {
        current += next;
      }
      i += 2;
      continue;
    }
    if (ch === ".") {
      if (current) {
        parts.push(current);
      }
      current = "";
      i += 1;
      continue;
    }
    if (ch === "[") {
      if (current) {
        parts.push(current);
      }
      current = "";
      const close = trimmed.indexOf("]", i);
      if (close === -1) {
        throw new Error(`Invalid path (missing "]"): ${raw}`);
      }
      const inside = trimmed.slice(i + 1, close).trim();
      if (!inside) {
        throw new Error(`Invalid path (empty "[]"): ${raw}`);
      }
      parts.push(inside);
      i = close + 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current) {
    parts.push(current);
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseValue(raw: string, opts: ConfigSetParseOpts): unknown {
  const trimmed = raw.trim();
  if (opts.strictJson) {
    try {
      return JSON5.parse(trimmed);
    } catch (err) {
      throw new Error(`Failed to parse JSON5 value: ${String(err)}`, { cause: err });
    }
  }

  try {
    return JSON5.parse(trimmed);
  } catch {
    return raw;
  }
}

function hasOwnPathKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validatePathSegments(path: PathSegment[]): void {
  for (const segment of path) {
    if (!isIndexSegment(segment) && isBlockedObjectKey(segment)) {
      throw new Error(`Invalid path segment: ${segment}`);
    }
  }
}

function getAtPath(root: unknown, path: PathSegment[]): { found: boolean; value?: unknown } {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return { found: false };
    }
    if (Array.isArray(current)) {
      if (!isIndexSegment(segment)) {
        return { found: false };
      }
      const index = Number.parseInt(segment, 10);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        return { found: false };
      }
      current = current[index];
      continue;
    }
    const record = current as Record<string, unknown>;
    if (!hasOwnPathKey(record, segment)) {
      return { found: false };
    }
    current = record[segment];
  }
  return { found: true, value: current };
}

function setAtPath(root: Record<string, unknown>, path: PathSegment[], value: unknown): void {
  let current: unknown = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    const next = path[i + 1];
    const nextIsIndex = Boolean(next && isIndexSegment(next));
    if (Array.isArray(current)) {
      if (!isIndexSegment(segment)) {
        throw new Error(`Expected numeric index for array segment "${segment}"`);
      }
      const index = Number.parseInt(segment, 10);
      const existing = current[index];
      if (!existing || typeof existing !== "object") {
        current[index] = nextIsIndex ? [] : {};
      }
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") {
      throw new Error(`Cannot traverse into "${segment}" (not an object)`);
    }
    const record = current as Record<string, unknown>;
    const existing = hasOwnPathKey(record, segment) ? record[segment] : undefined;
    if (!existing || typeof existing !== "object") {
      record[segment] = nextIsIndex ? [] : {};
    }
    current = record[segment];
  }

  const last = path[path.length - 1];
  if (Array.isArray(current)) {
    if (!isIndexSegment(last)) {
      throw new Error(`Expected numeric index for array segment "${last}"`);
    }
    const index = Number.parseInt(last, 10);
    current[index] = value;
    return;
  }
  if (!current || typeof current !== "object") {
    throw new Error(`Cannot set "${last}" (parent is not an object)`);
  }
  (current as Record<string, unknown>)[last] = value;
}

function unsetAtPath(root: Record<string, unknown>, path: PathSegment[]): boolean {
  let current: unknown = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (!current || typeof current !== "object") {
      return false;
    }
    if (Array.isArray(current)) {
      if (!isIndexSegment(segment)) {
        return false;
      }
      const index = Number.parseInt(segment, 10);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }
    const record = current as Record<string, unknown>;
    if (!hasOwnPathKey(record, segment)) {
      return false;
    }
    current = record[segment];
  }

  const last = path[path.length - 1];
  if (Array.isArray(current)) {
    if (!isIndexSegment(last)) {
      return false;
    }
    const index = Number.parseInt(last, 10);
    if (!Number.isFinite(index) || index < 0 || index >= current.length) {
      return false;
    }
    current.splice(index, 1);
    return true;
  }
  if (!current || typeof current !== "object") {
    return false;
  }
  const record = current as Record<string, unknown>;
  if (!hasOwnPathKey(record, last)) {
    return false;
  }
  delete record[last];
  return true;
}

async function loadValidConfig(runtime: RuntimeEnv = defaultRuntime) {
  const snapshot = await readConfigFileSnapshot();
  if (snapshot.valid) {
    return snapshot;
  }
  runtime.error(`配置文件无效 ${shortenHomePath(snapshot.path)}`);
  for (const issue of snapshot.issues) {
    runtime.error(`- ${issue.path || "<root>"}: ${issue.message}`);
  }
  runtime.error(`运行 \`${formatCliCommand("nsemclaw 诊断")}\` 修复后重试`);
  runtime.exit(1);
  return snapshot;
}

function parseRequiredPath(path: string): PathSegment[] {
  const parsedPath = parsePath(path);
  if (parsedPath.length === 0) {
    throw new Error("Path is empty.");
  }
  validatePathSegments(parsedPath);
  return parsedPath;
}

function pathEquals(path: PathSegment[], expected: PathSegment[]): boolean {
  return (
    path.length === expected.length && path.every((segment, index) => segment === expected[index])
  );
}

function ensureValidOllamaProviderForApiKeySet(
  root: Record<string, unknown>,
  path: PathSegment[],
): void {
  if (!pathEquals(path, OLLAMA_API_KEY_PATH)) {
    return;
  }
  const existing = getAtPath(root, OLLAMA_PROVIDER_PATH);
  if (existing.found) {
    return;
  }
  setAtPath(root, OLLAMA_PROVIDER_PATH, {
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
    api: "ollama",
    models: [],
  });
}

export async function runConfigGet(opts: { path: string; json?: boolean; runtime?: RuntimeEnv }) {
  const runtime = opts.runtime ?? defaultRuntime;
  try {
    const parsedPath = parseRequiredPath(opts.path);
    const snapshot = await loadValidConfig(runtime);
    const redacted = redactConfigObject(snapshot.config);
    const res = getAtPath(redacted, parsedPath);
    if (!res.found) {
      runtime.error(danger(`配置路径不存在: ${opts.path}`));
      runtime.exit(1);
      return;
    }
    if (opts.json) {
      runtime.log(JSON.stringify(res.value ?? null, null, 2));
      return;
    }
    if (
      typeof res.value === "string" ||
      typeof res.value === "number" ||
      typeof res.value === "boolean"
    ) {
      runtime.log(String(res.value));
      return;
    }
    runtime.log(JSON.stringify(res.value ?? null, null, 2));
  } catch (err) {
    runtime.error(danger(String(err)));
    runtime.exit(1);
  }
}

export async function runConfigUnset(opts: { path: string; runtime?: RuntimeEnv }) {
  const runtime = opts.runtime ?? defaultRuntime;
  try {
    const parsedPath = parseRequiredPath(opts.path);
    const snapshot = await loadValidConfig(runtime);
    // Use snapshot.resolved (config after $include and ${ENV} resolution, but BEFORE runtime defaults)
    // instead of snapshot.config (runtime-merged with defaults).
    // This prevents runtime defaults from leaking into the written config file (issue #6070)
    const next = structuredClone(snapshot.resolved) as Record<string, unknown>;
    const removed = unsetAtPath(next, parsedPath);
    if (!removed) {
      runtime.error(danger(`配置路径不存在: ${opts.path}`));
      runtime.exit(1);
      return;
    }
    await writeConfigFile(next, { unsetPaths: [parsedPath] });
    runtime.log(info(`已删除 ${opts.path}。重启网关生效。`));
  } catch (err) {
    runtime.error(danger(String(err)));
    runtime.exit(1);
  }
}

export function registerConfigCli(program: Command) {
  const cmd = program
    .command("config")
    .description("非交互式配置工具 (get/set/unset)。不带子命令运行以启动配置向导。")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/config", "docs.nsemclaw.ai/cli/config")}\n`,
    )
    .option(
      "--section <section>",
      "配置向导章节 (可重复)。用于不带子命令时。",
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .action(async (opts) => {
      const { configureCommandFromSectionsArg } = await import("../commands/configure.js");
      await configureCommandFromSectionsArg(opts.section, defaultRuntime);
    });

  cmd
    .command("get")
    .description("通过点路径获取配置值")
    .argument("<path>", "配置路径 (点或括号表示法)")
    .option("--json", "输出 JSON", false)
    .action(async (path: string, opts) => {
      await runConfigGet({ path, json: Boolean(opts.json) });
    });

  cmd
    .command("set")
    .description("通过点路径设置配置值")
    .argument("<path>", "配置路径 (点或括号表示法)")
    .argument("<value>", "值 (JSON5 或原始字符串)")
    .option("--strict-json", "严格 JSON5 解析 (错误而非原始字符串回退)", false)
    .option("--json", "--strict-json 的旧别名", false)
    .action(async (path: string, value: string, opts) => {
      try {
        const parsedPath = parseRequiredPath(path);
        const parsedValue = parseValue(value, {
          strictJson: Boolean(opts.strictJson || opts.json),
        });
        const snapshot = await loadValidConfig();
        // Use snapshot.resolved (config after $include and ${ENV} resolution, but BEFORE runtime defaults)
        // instead of snapshot.config (runtime-merged with defaults).
        // This prevents runtime defaults from leaking into the written config file (issue #6070)
        const next = structuredClone(snapshot.resolved) as Record<string, unknown>;
        ensureValidOllamaProviderForApiKeySet(next, parsedPath);
        setAtPath(next, parsedPath, parsedValue);
        await writeConfigFile(next);
        defaultRuntime.log(info(`已更新 ${path}。重启网关生效。`));
      } catch (err) {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      }
    });

  cmd
    .command("unset")
    .description("通过点路径删除配置值")
    .argument("<path>", "配置路径 (点或括号表示法)")
    .action(async (path: string) => {
      await runConfigUnset({ path });
    });
}
