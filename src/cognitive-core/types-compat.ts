/**
 * 类型兼容性声明
 * 用于解决 NSEMFusionCore 与其他组件之间的类型不匹配问题
 */

import type { FusionMemoryItem, FusionRetrieveResult } from "./NSEMFusionCore.js";

// 向后兼容的类型别名
export type MemAtom = FusionMemoryItem;
export type ActivatedMemory = FusionMemoryItem;

// 扩展 FusionRetrieveResult 以支持旧版 API
export interface ExtendedFusionRetrieveResult extends FusionRetrieveResult {
  atoms?: FusionMemoryItem[];
  semantic?: {
    coherence: number;
    coverage: number;
  };
}

// 旧版 MemoryQuery 类型
export interface LegacyMemoryQuery {
  query: string;
  maxResults?: number;
  strategy?: string;
  filters?: Record<string, unknown>;
}

// 声明模块扩展
declare module "./NSEMFusionCore.js" {
  interface FusionMemoryItem {
    atom?: {
      id: string;
      content: string;
      contentType: string;
    };
    relevance?: number;
    activation?: number;
  }
}
