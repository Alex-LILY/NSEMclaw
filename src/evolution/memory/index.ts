/**
 * 进化记忆系统 - 已迁移
 *
 * ⚠️ 此模块已弃用，请使用 cognitive-core
 *
 * 旧导入:
 *   import { MemoryEcosystem } from "nsemclaw/evolution/memory";
 *
 * 新导入:
 *   import { NSEMFusionCore } from "nsemclaw/cognitive-core";
 */

// 转发到 cognitive-core
export * from "../../cognitive-core/index.js";

// 特定导出兼容 (重定向到 NSEMFusionCore)
export { NSEMFusionCore as MemoryEcosystem } from "../../cognitive-core/NSEMFusionCore.js";
export { NSEMFusionCore as EvolutionEngine } from "../../cognitive-core/NSEMFusionCore.js";

// 兼容函数 - 返回 NSEMFusionCore 实例
import { createNSEMFusionCore, type NSEMFusionCore } from "../../cognitive-core/NSEMFusionCore.js";

/** 
 * @deprecated 使用 createNSEMFusionCore() 替代
 */
export function getMemoryEcosystem(config?: Record<string, unknown>): NSEMFusionCore {
  console.warn("getMemoryEcosystem() is deprecated. Use createNSEMFusionCore() instead.");
  return createNSEMFusionCore(config as Parameters<typeof createNSEMFusionCore>[0]);
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

// 新增类型导出
export type {
  FusionMemoryItem,
  FusionCoreConfig,
} from "../../cognitive-core/NSEMFusionCore.js";
