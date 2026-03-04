/**
 * 生命周期管理模块
 * 
 * 导出生命周期管理相关的所有类型和类
 */

export {
  HotnessScorer,
  DEFAULT_HOTNESS_CONFIG,
  createHotnessScorer,
  computeHotnessScore,
  computeTimeDecayedHotness,
} from "./HotnessScorer.js";

export type {
  HotnessConfig,
  HotnessHistory,
} from "./HotnessScorer.js";
