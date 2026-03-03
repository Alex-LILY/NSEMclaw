/**
 * NSEM Fusion 模块导出
 * 
 * 「NSEM 核心 + 元数据外链」架构
 */

export { NSEMFusionAdapter } from "./nsem-fusion-adapter.js";
export type { NSEMFusionConfig, FusionSearchResult } from "./nsem-fusion-adapter.js";

export { MetadataLinker } from "./metadata-linker.js";
export type { MetadataLink, LinkStats } from "./metadata-linker.js";

export { MigrationController } from "./migration-controller.js";
export type { MigrationStatus } from "./migration-controller.js";
