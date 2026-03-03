/**
 * Cognitive Core Services
 *
 * P2 阶段服务:
 * - AutoIngestionService: 对话结束自动摄入
 * - ImportanceScorer: 重要信息识别
 * - PeriodicMaintenanceService: 定期整理任务
 */

// Auto Ingestion Service
export {
  AutoIngestionService,
  createAutoIngestionService,
  DEFAULT_AUTO_INGESTION_RULES,
} from "./AutoIngestionService.js";
export type {
  ConversationMessage,
  ConversationSession,
  AutoIngestionRule,
  ExtractedMemory,
  IngestionResult,
} from "./AutoIngestionService.js";

// Importance Scorer
export {
  ImportanceScorer,
  createImportanceScorer,
  DEFAULT_IMPORTANCE_RULES,
} from "./ImportanceScorer.js";
export type {
  ImportanceDimensions,
  ScoringContext,
  ImportanceRule,
  ContentAnalysis,
  ImportanceScore,
} from "./ImportanceScorer.js";

// Periodic Maintenance Service
export {
  PeriodicMaintenanceService,
  createPeriodicMaintenanceService,
  DEFAULT_MAINTENANCE_TASKS,
} from "./PeriodicMaintenanceService.js";
export type {
  MaintenanceTaskType,
  MaintenanceTask,
  MaintenanceResult,
  MaintenanceStats,
  MaintenanceConfig,
} from "./PeriodicMaintenanceService.js";
