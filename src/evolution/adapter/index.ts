/**
 * NSEM 适配器模块
 *
 * 将进化记忆系统 (NSEM) 无缝集成到 Nsemclaw
 *
 * 快速开始:
 * ```typescript
 * import { getEnhancedMemoryManager } from "./adapter/index.js";
 *
 * const { manager, nsemEnabled } = await getEnhancedMemoryManager({
 *   cfg,
 *   agentId: "my-agent",
 * });
 *
 * // 所有原有方法正常工作
 * const results = await manager.search("query");
 *
 * // NSEM 增强功能 (如果启用)
 * if (nsemEnabled) {
 *   await manager.evolve?.();
 * }
 * ```
 */

// 核心适配器
export { NSEMWrapper, wrapWithNSEM, DEFAULT_NSEM_ADAPTER_CONFIG } from "./NSEMAdapter.js";
export type { NSEMAdapterConfig } from "./NSEMAdapter.js";

// 集成入口
export { getEnhancedMemoryManager, clearNSEMCache } from "./integration.js";
export type { EnhancedMemoryManagerResult } from "./integration.js";

// CLI 扩展
export { registerNSEMExtension } from "./cli-extension.js";

// 配置类型 (导入以触发类型扩展)
import "./config-types.js";
