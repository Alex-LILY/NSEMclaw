/**
 * 进化记忆系统 - 已迁移
 *
 * ⚠️ 此模块已弃用，请使用 cognitive-core
 *
 * 旧导入:
 *   import { MemoryEcosystem } from "nsemclaw/evolution/memory";
 *
 * 新导入:
 *   import { NSEM2Core } from "nsemclaw/cognitive-core";
 */

// 转发到 cognitive-core
export * from "../../cognitive-core/index.js";

// 特定导出兼容
export { NSEM2Core as MemoryEcosystem } from "../../cognitive-core/mind/nsem/NSEM2Core.js";
export { NSEM2Core as EvolutionEngine } from "../../cognitive-core/mind/nsem/NSEM2Core.js";

// 兼容函数 - 返回 NSEM2Core 实例
import { NSEM2Core } from "../../cognitive-core/mind/nsem/NSEM2Core.js";
/** @deprecated 使用 NSEM2Core 直接 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMemoryEcosystem(_config?: Record<string, unknown>): NSEM2Core {
  throw new Error("getMemoryEcosystem() is deprecated. Use NSEM2Core.create() instead.");
}

// 类型重导出
export type {
  MemAtom,
  LivingEdge,
  MemoryField,
  MemoryQuery,
  ActivatedMemory,
  EcosystemState,
} from "../../cognitive-core/types/index.js";
