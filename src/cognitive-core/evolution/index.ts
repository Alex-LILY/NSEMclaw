/**
 * 进化系统模块 - P2
 *
 * 遗传算法参数优化、知识迁移
 */

export {
  GeneticParameterOptimizer,
  createGeneticOptimizer,
  createDefaultFitnessEvaluator,
  DEFAULT_PARAMETERS,
  DEFAULT_OPTIMIZER_CONFIG,
  PARAMETER_BOUNDS,
  type OptimizableParameters,
  type Individual,
  type GeneticOptimizerConfig,
  type OptimizationResult,
  type FitnessEvaluator,
} from "./GeneticParameterOptimizer.js";

export {
  KnowledgeTransferSystem,
  IntegratedNSEM2Adapter,
  createKnowledgeTransferSystem,
  createIntegratedNSEM2Adapter,
  DEFAULT_TRANSFER_CONFIG,
  type KnowledgePackage,
  type TransferConfig,
  type TransferResult,
  type TransferRecord,
  type TransferStats,
  type KnowledgeSourceAdapter,
} from "./KnowledgeTransfer.js";
