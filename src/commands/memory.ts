/**
 * memory 命令 - 管理NSEM认知核心记忆系统
 *
 * 命令:
 * - nsemclaw memory start              # 启动记忆系统
 * - nsemclaw memory stop               # 停止记忆系统
 * - nsemclaw memory status             # 查看记忆状态
 * - nsemclaw memory add <content>      # 添加记忆
 * - nsemclaw memory search <query>     # 搜索记忆
 * - nsemclaw memory evolve             # 手动触发进化
 * - nsemclaw memory sync [file/path]   # 同步记忆文件到 NSEM
 */

import {
  getNSEMFusionCore as getNSEM2Core,
  clearNSEMFusionCore as clearNSEM2Core,
  NSEMFusionCore as NSEM2Core,
} from "../cognitive-core/NSEMFusionCore.js";
import type { MemoryQuery } from "../cognitive-core/types/index.js";
import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("memory-cmd");

// 默认配置
const DEFAULT_AGENT_ID = "cli-memory";

interface MemoryCommandOptions {
  action: string;
  content?: string;
  type?: string;
  tags?: string;
  strategy?: string;
}

/**
 * 获取记忆系统实例
 */
async function getMemoryCore(): Promise<NSEM2Core | null> {
  try {
    const cfg = await loadConfig();
    // 使用简化的内存配置
    const memoryConfig = {
      provider: "local" as const,
      enabled: true,
      sources: ["memory"] as Array<"memory" | "sessions">,
      extraPaths: [] as string[],
      experimental: { sessionMemory: false },
      fallback: "none" as const,
      model: "default",
      local: {},
      store: { driver: "sqlite" as const, path: ":memory:", vector: { enabled: false } },
      chunking: { tokens: 512, overlap: 64 },
      sync: { onSessionStart: false, onSearch: false, watch: false, watchDebounceMs: 1000, intervalMinutes: 0, sessions: { deltaBytes: 0, deltaMessages: 0 } },
      query: { maxResults: 10, minScore: 0.5, hybrid: { weightVector: 0.7, weightKeyword: 0.3 } },
    };
    return await getNSEM2Core(DEFAULT_AGENT_ID, { storage: { mode: "fusion" } });
  } catch (err) {
    log.error(`初始化记忆系统失败: ${String(err)}`);
    return null;
  }
}

/**
 * 启动记忆系统
 */
async function startMemory(): Promise<void> {
  const core = await getMemoryCore();
  if (!core) {
    console.error("❌ 无法初始化记忆系统");
    return;
  }
  await core.start();
  console.log("✅ 记忆系统已启动");
}

/**
 * 停止记忆系统
 */
async function stopMemory(): Promise<void> {
  const core = await getMemoryCore();
  if (!core) {
    console.error("❌ 记忆系统未运行");
    return;
  }
  await core.stop();
  clearNSEM2Core(DEFAULT_AGENT_ID);
  console.log("✅ 记忆系统已停止");
}

/**
 * 查看记忆状态
 */
async function statusMemory(): Promise<void> {
  const core = await getMemoryCore();
  if (!core) {
    console.error("❌ 记忆系统未初始化");
    return;
  }
  const stats = core.getStats();
  console.log("📊 记忆系统状态:");
  console.log(`  - 原子数: ${stats.totalAtoms}`);
  console.log(`  - 连接数: ${stats.totalEdges}`);
  console.log(`  - 场数: ${stats.totalFields}`);
}

/**
 * 添加记忆
 */
async function addMemory(content: string, type = "fact", tags?: string): Promise<void> {
  const core = await getMemoryCore();
  if (!core) {
    console.error("❌ 记忆系统未运行");
    return;
  }
  const tagList = tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  await core.ingest(content, {
    type: type as "fact" | "insight" | "experience",
    tags: tagList,
  });
  console.log("✅ 记忆已添加");
}

/**
 * 搜索记忆
 */
async function searchMemory(query: string, strategy = "exploratory"): Promise<void> {
  const core = await getMemoryCore();
  if (!core) {
    console.error("❌ 记忆系统未运行");
    return;
  }
  const queryConfig: MemoryQuery = {
    intent: query,
    strategy: strategy as "precise" | "exploratory" | "creative" | "associative",
    constraints: {
      maxResults: 10,
      minStrength: 0.2,
    },
  };
  const result = await core.retrieve(query, { maxResults: 10 });
  console.log(`🔍 搜索结果 (${result.items.length} 条):`);
  for (const item of result.items.slice(0, 5)) {
    const content = item.content.l1_overview || item.content.l0_abstract || "无内容";
    console.log(`  - [${item.importance.toFixed(2)}] ${content.slice(0, 100)}...`);
  }
}

/**
 * 触发进化
 */
async function evolveMemory(): Promise<void> {
  const core = await getMemoryCore();
  if (!core) {
    console.error("❌ 记忆系统未运行");
    return;
  }
  console.log("🧬 开始记忆进化...");
  await core.evolve("all");
  console.log("✅ 记忆进化完成");
}

/**
 * 执行记忆命令
 */
export default async function memoryCommand(args: MemoryCommandOptions): Promise<void> {
  const { action, content, type, tags, strategy } = args;

  switch (action) {
    case "start":
      await startMemory();
      break;
    case "stop":
      await stopMemory();
      break;
    case "status":
      await statusMemory();
      break;
    case "add":
      if (!content) {
        console.error("❌ 请提供记忆内容: nsemclaw memory add <content>");
        return;
      }
      await addMemory(content, type, tags);
      break;
    case "search":
      if (!content) {
        console.error("❌ 请提供搜索查询: nsemclaw memory search <query>");
        return;
      }
      await searchMemory(content, strategy);
      break;
    case "evolve":
      await evolveMemory();
      break;
    default:
      console.log("用法: nsemclaw memory <action> [options]");
      console.log("操作: start, stop, status, add, search, evolve");
  }
}

// CLI 入口点
if (import.meta.main) {
  const args = process.argv.slice(2);
  const action = args[0] ?? "status";
  const content = args.slice(1).join(" ");
  memoryCommand({ action, content }).catch(console.error);
}
