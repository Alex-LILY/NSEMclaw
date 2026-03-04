/**
 * 上下文层级定义 (L0/L1/L2)
 * 
 * 参考 OpenViking 的分层上下文架构
 * - L0 (ABSTRACT): 摘要层，用于快速定位和全局搜索
 * - L1 (OVERVIEW): 概览层，中等详细度，适合大多数场景
 * - L2 (DETAIL): 详情层，完整内容，用于深度分析
 */

/**
 * 上下文层级枚举
 */
export enum ContextLevel {
  /** L0: 摘要层 - 用于快速定位和全局搜索 */
  ABSTRACT = 0,
  /** L1: 概览层 - 中等详细度，适合大多数场景 */
  OVERVIEW = 1,
  /** L2: 详情层 - 完整内容，用于深度分析 */
  DETAIL = 2,
}

/**
 * 上下文层级工具
 */
export namespace ContextLevelUtils {
  /**
   * 获取层级的文件后缀
   */
  export function getFileSuffix(level: ContextLevel): string {
    switch (level) {
      case ContextLevel.ABSTRACT:
        return ".abstract.md";
      case ContextLevel.OVERVIEW:
        return ".overview.md";
      case ContextLevel.DETAIL:
        return ".detail.md";
      default:
        return "";
    }
  }

  /**
   * 从文件路径解析层级
   */
  export function fromPath(path: string): ContextLevel | null {
    if (path.endsWith(".abstract.md")) return ContextLevel.ABSTRACT;
    if (path.endsWith(".overview.md")) return ContextLevel.OVERVIEW;
    if (path.endsWith(".detail.md")) return ContextLevel.DETAIL;
    return null;
  }

  /**
   * 获取层级名称
   */
  export function getName(level: ContextLevel): string {
    switch (level) {
      case ContextLevel.ABSTRACT:
        return "ABSTRACT";
      case ContextLevel.OVERVIEW:
        return "OVERVIEW";
      case ContextLevel.DETAIL:
        return "DETAIL";
      default:
        return "UNKNOWN";
    }
  }

  /**
   * 获取层级描述
   */
  export function getDescription(level: ContextLevel): string {
    switch (level) {
      case ContextLevel.ABSTRACT:
        return "摘要层 - 用于快速定位和全局搜索";
      case ContextLevel.OVERVIEW:
        return "概览层 - 中等详细度，适合大多数场景";
      case ContextLevel.DETAIL:
        return "详情层 - 完整内容，用于深度分析";
      default:
        return "未知层级";
    }
  }

  /**
   * 估算层级的 Token 消耗比例
   */
  export function getTokenRatio(level: ContextLevel): number {
    switch (level) {
      case ContextLevel.ABSTRACT:
        return 0.3;  // 约 30% Token
      case ContextLevel.OVERVIEW:
        return 0.6;  // 约 60% Token
      case ContextLevel.DETAIL:
        return 1.0;  // 100% Token
      default:
        return 1.0;
    }
  }

  /**
   * 选择最佳层级
   * 基于查询意图和上下文选择最合适的层级
   */
  export function selectOptimalLevel(
    intent: "quick" | "standard" | "deep",
    availableLevels: ContextLevel[]
  ): ContextLevel {
    const levelMap: Record<string, ContextLevel> = {
      quick: ContextLevel.ABSTRACT,
      standard: ContextLevel.OVERVIEW,
      deep: ContextLevel.DETAIL,
    };

    const desiredLevel = levelMap[intent] ?? ContextLevel.OVERVIEW;
    
    // 如果期望层级不可用，选择最接近的可用层级
    if (!availableLevels.includes(desiredLevel)) {
      // 优先选择更高级别（更详细）
      const sorted = availableLevels.sort((a, b) => b - a);
      return sorted.find(l => l <= desiredLevel) ?? sorted[0];
    }

    return desiredLevel;
  }

  /**
   * 获取所有层级
   */
  export function getAllLevels(): ContextLevel[] {
    return [ContextLevel.ABSTRACT, ContextLevel.OVERVIEW, ContextLevel.DETAIL];
  }

  /**
   * 从数字解析层级
   */
  export function fromNumber(num: number): ContextLevel {
    if (num <= 0) return ContextLevel.ABSTRACT;
    if (num >= 2) return ContextLevel.DETAIL;
    return ContextLevel.OVERVIEW;
  }
}

/**
 * 层级内容包装器
 */
export interface LevelContent {
  level: ContextLevel;
  content: string;
  tokenCount?: number;
  lastUpdated: number;
}

/**
 * 三层内容容器
 */
export interface ThreeLevelContent {
  abstract?: LevelContent;   // L0
  overview?: LevelContent;   // L1
  detail?: LevelContent;     // L2
}

/**
 * 获取三层内容中最详细的可用内容
 */
export function getMostDetailedContent(
  content: ThreeLevelContent
): LevelContent | undefined {
  return content.detail ?? content.overview ?? content.abstract;
}

/**
 * 获取指定层级的内容
 */
export function getContentAtLevel(
  content: ThreeLevelContent,
  level: ContextLevel
): LevelContent | undefined {
  switch (level) {
    case ContextLevel.ABSTRACT:
      return content.abstract;
    case ContextLevel.OVERVIEW:
      return content.overview;
    case ContextLevel.DETAIL:
      return content.detail;
    default:
      return undefined;
  }
}

/**
 * 获取所有可用层级
 */
export function getAvailableLevels(content: ThreeLevelContent): ContextLevel[] {
  const levels: ContextLevel[] = [];
  if (content.abstract) levels.push(ContextLevel.ABSTRACT);
  if (content.overview) levels.push(ContextLevel.OVERVIEW);
  if (content.detail) levels.push(ContextLevel.DETAIL);
  return levels;
}
