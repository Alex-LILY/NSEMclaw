/**
 * 重要性评分服务 - P2 功能
 *
 * 功能:
 * - 多维度重要性评估
 * - 可配置的评分规则
 * - 自适应权重调整
 * - 领域特定评分
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { ContentType } from "../types/index.js";

const log = createSubsystemLogger("importance-scorer");

// ============================================================================
// 类型定义
// ============================================================================

/** 重要性评分维度 */
export interface ImportanceDimensions {
  /** 语义重要性 (内容本身价值) */
  semantic: number;
  /** 时间重要性 (时效性) */
  temporal: number;
  /** 情感重要性 (情感权重) */
  emotional: number;
  /** 关系重要性 (连接性) */
  relational: number;
  /** 用户明确标记的重要性 */
  explicit: number;
}

/** 评分上下文 */
export interface ScoringContext {
  /** 当前对话主题 */
  currentTopic?: string;
  /** 用户近期关注 */
  recentInterests?: string[];
  /** 对话历史 */
  conversationHistory?: string[];
  /** 时间 */
  timestamp?: number;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
  /** 访问计数 (测试兼容) */
  accessCount?: number;
  /** 来源 (测试兼容) */
  source?: string;
}

/** 重要性规则 */
export interface ImportanceRule {
  /** 规则ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则类型 */
  type: "keyword" | "pattern" | "semantic" | "contextual" | "composite";
  /** 规则描述 */
  description?: string;
  /** 匹配条件 */
  condition: {
    /** 关键词列表 */
    keywords?: string[];
    /** 正则模式 */
    regex?: string[];
    /** 语义特征 */
    semanticFeatures?: string[];
    /** 上下文条件 */
    contextConditions?: Array<{
      type: "topic-match" | "interest-match" | "time-since";
      value: string | number;
      weight: number;
    }>;
  };
  /** 权重调整 */
  weightAdjustment: number;
  /** 影响维度 */
  affects: Array<keyof ImportanceDimensions>;
  /** 优先级 (越高越先应用) */
  priority: number;
  /** 是否启用 */
  enabled: boolean;
}

/** 内容分析结果 */
export interface ContentAnalysis {
  /** 原始内容 */
  content: string;
  /** 内容类型 */
  contentType: ContentType;
  /** 长度 */
  length: number;
  /** 包含的实体 */
  entities: string[];
  /** 关键词 */
  keywords: string[];
  /** 情感倾向 (-1 到 1) */
  sentiment: number;
  /** 复杂度 (0-1) */
  complexity: number;
  /** 信息密度 (0-1) */
  informationDensity: number;
}

/** 评分结果 */
export interface ImportanceScore {
  /** 总分 (0-1) */
  total: number;
  /** 各维度分数 */
  dimensions: ImportanceDimensions;
  /** 应用的规则 */
  appliedRules: string[];
  /** 置信度 (0-1) */
  confidence: number;
  /** 评分时间戳 */
  timestamp: number;
  /** 详细说明 */
  explanation: string;
  /** 评分组成 (测试兼容) */
  components: {
    content: number;
    structural: number;
    contextual: number;
  };
  /** 分类 (测试兼容) */
  category?: string;
}

// ============================================================================
// 默认规则
// ============================================================================

export const DEFAULT_IMPORTANCE_RULES: ImportanceRule[] = [
  // 高优先级规则
  {
    id: "explicit-important",
    name: "明确标记为重要",
    type: "keyword",
    description: "用户明确使用重要性标记",
    condition: {
      keywords: [
        "重要",
        "关键",
        "必须",
        "remember",
        "important",
        "critical",
        "essential",
        "crucial",
      ],
    },
    weightAdjustment: 0.4,
    affects: ["explicit", "semantic"],
    priority: 100,
    enabled: true,
  },
  {
    id: "personal-information",
    name: "个人信息",
    type: "pattern",
    description: "包含个人身份信息",
    condition: {
      regex: [
        "我的?名字[是叫]?",
        "我的?生日[是]?",
        "我的?地址[是]?",
        "我的?工作[是]?",
        "我[是叫]?",
      ],
    },
    weightAdjustment: 0.35,
    affects: ["semantic", "relational"],
    priority: 90,
    enabled: true,
  },
  {
    id: "preferences",
    name: "偏好设置",
    type: "keyword",
    description: "用户偏好和喜好",
    condition: {
      keywords: ["喜欢", "偏好", "讨厌", "不喜欢", "prefer", "favorite", "hate", "dislike"],
    },
    weightAdjustment: 0.3,
    affects: ["semantic"],
    priority: 80,
    enabled: true,
  },
  {
    id: "goals-plans",
    name: "目标计划",
    type: "keyword",
    description: "用户目标和未来计划",
    condition: {
      keywords: ["目标", "计划", "想要", "打算", "goal", "plan", "want to", "aim to"],
    },
    weightAdjustment: 0.25,
    affects: ["semantic", "temporal"],
    priority: 70,
    enabled: true,
  },
  {
    id: "secrets-credentials",
    name: "机密凭证",
    type: "keyword",
    description: "密码、密钥等敏感信息",
    condition: {
      keywords: ["密码", "密钥", "token", "secret", "key", "password", "credential", "api key"],
    },
    weightAdjustment: 0.5,
    affects: ["explicit"],
    priority: 95,
    enabled: true,
  },
  {
    id: "emotional-content",
    name: "情感内容",
    type: "keyword",
    description: "包含强烈情感的内容",
    condition: {
      keywords: [
        "爱",
        "恨",
        "开心",
        "难过",
        "兴奋",
        "失望",
        "love",
        "hate",
        "happy",
        "sad",
        "excited",
      ],
    },
    weightAdjustment: 0.2,
    affects: ["emotional"],
    priority: 60,
    enabled: true,
  },
  {
    id: "learning-insight",
    name: "学习洞察",
    type: "keyword",
    description: "学习和发现的洞察",
    condition: {
      keywords: ["学到", "发现", "明白", "理解", "learned", "discovered", "realized", "understood"],
    },
    weightAdjustment: 0.25,
    affects: ["semantic"],
    priority: 65,
    enabled: true,
  },
  {
    id: "relationships",
    name: "关系信息",
    type: "keyword",
    description: "人际关系相关信息",
    condition: {
      keywords: ["朋友", "家人", "同事", "关系", "friend", "family", "colleague", "relationship"],
    },
    weightAdjustment: 0.2,
    affects: ["relational"],
    priority: 55,
    enabled: true,
  },
  {
    id: "time-sensitive",
    name: "时间敏感",
    type: "pattern",
    description: "包含时间敏感信息",
    condition: {
      regex: [
        "\\d{4}-\\d{2}-\\d{2}", // 日期格式
        "\\d{1,2}月\\d{1,2}日",
        "明天",
        "后天",
        "下周",
        "下个月",
        "deadline",
        "截止日期",
      ],
    },
    weightAdjustment: 0.15,
    affects: ["temporal"],
    priority: 50,
    enabled: true,
  },
  {
    id: "questions-concerns",
    name: "疑问关注",
    type: "keyword",
    description: "用户的疑问和关注点",
    condition: {
      keywords: [
        "为什么",
        "怎么",
        "什么",
        "疑问",
        "问题",
        "why",
        "how",
        "what",
        "question",
        "wonder",
      ],
    },
    weightAdjustment: 0.1,
    affects: ["semantic"],
    priority: 40,
    enabled: true,
  },
];

// ============================================================================
// 重要性评分服务
// ============================================================================

export class ImportanceScorer {
  private rules: Map<string, ImportanceRule> = new Map();
  private defaultWeights: ImportanceDimensions = {
    semantic: 0.35,
    temporal: 0.15,
    emotional: 0.15,
    relational: 0.15,
    explicit: 0.2,
  };
  private adaptiveMode = true;
  private history: ImportanceScore[] = [];
  private maxHistorySize = 1000;

  constructor() {
    // 加载默认规则
    for (const rule of DEFAULT_IMPORTANCE_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  // ========================================================================
  // 规则管理
  // ========================================================================

  addRule(rule: ImportanceRule): void {
    this.rules.set(rule.id, rule);
    log.info(`Added importance rule: ${rule.name} (${rule.id})`);
  }

  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      log.info(`Removed importance rule: ${ruleId}`);
    }
    return deleted;
  }

  updateRule(ruleId: string, updates: Partial<ImportanceRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    Object.assign(rule, updates);
    log.info(`Updated importance rule: ${ruleId}`);
    return true;
  }

  getRule(ruleId: string): ImportanceRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): ImportanceRule[] {
    return Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority);
  }

  enableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: true });
  }

  disableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: false });
  }

  // ========================================================================
  // 核心评分
  // ========================================================================

  /**
   * 计算内容重要性
   */
  calculateImportance(
    content: string,
    contentType: ContentType = "fact",
    context?: ScoringContext,
  ): ImportanceScore {
    const startTime = Date.now();

    // 内容分析
    const analysis = this.analyzeContent(content, contentType);

    // 基础维度评分
    const dimensions = this.scoreDimensions(analysis, context);

    // 应用规则调整
    const { adjustedDimensions, appliedRules } = this.applyRules(analysis, dimensions, context);

    // 计算总分
    const total = this.calculateTotalScore(adjustedDimensions);

    // 计算置信度
    const confidence = this.calculateConfidence(analysis, appliedRules.length);

    const score: ImportanceScore = {
      total,
      dimensions: adjustedDimensions,
      appliedRules,
      confidence,
      timestamp: Date.now(),
      explanation: this.generateExplanation(analysis, adjustedDimensions, appliedRules),
      components: {
        content: adjustedDimensions.semantic,
        structural: adjustedDimensions.relational,
        contextual: adjustedDimensions.temporal,
      },
      category: contentType,
    };

    // 记录历史
    this.addToHistory(score);

    log.debug(
      `Scored content importance: ${total.toFixed(3)} (${appliedRules.length} rules applied)`,
    );

    return score;
  }

  /**
   * 批量评分
   */
  calculateBatch(
    items: Array<{ content: string; type: ContentType }>,
    context?: ScoringContext,
  ): ImportanceScore[] {
    return items.map((item) => this.calculateImportance(item.content, item.type, context));
  }

  /**
   * 批量计算 (测试兼容别名)
   */
  batchCalculate(
    items: Array<{ content: string; type: ContentType }>,
    context?: ScoringContext,
  ): ImportanceScore[] {
    return this.calculateBatch(items, context);
  }

  // ========================================================================
  // 内容分析
  // ========================================================================

  private analyzeContent(content: string, contentType: ContentType): ContentAnalysis {
    // 提取实体 (简化实现)
    const entities = this.extractEntities(content);

    // 提取关键词
    const keywords = this.extractKeywords(content);

    // 简单情感分析
    const sentiment = this.analyzeSentiment(content);

    // 复杂度评估
    const complexity = this.assessComplexity(content);

    // 信息密度
    const informationDensity = this.assessInformationDensity(content);

    return {
      content,
      contentType,
      length: content.length,
      entities,
      keywords,
      sentiment,
      complexity,
      informationDensity,
    };
  }

  private extractEntities(content: string): string[] {
    const entities: string[] = [];

    // 简单的实体识别模式
    const patterns = [
      /我的?名字[是叫]?(.+?)[。.，,]/,
      /我[是叫]?(.+?)[。.，,]/,
      /(.+?)年(.+?)月/,
      /\d{4}-\d{2}-\d{2}/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        entities.push(match[1].trim());
      }
    }

    return entities;
  }

  private extractKeywords(content: string): string[] {
    // 简单的关键词提取
    const stopWords = new Set([
      "的",
      "了",
      "是",
      "我",
      "你",
      "在",
      "有",
      "和",
      "就",
      "不",
      "人",
      "都",
      "一",
      "一个",
      "上",
      "也",
      "很",
      "到",
      "说",
      "要",
      "去",
      "你",
      "会",
      "着",
      "没有",
      "看",
      "好",
      "自己",
      "这",
    ]);
    const words = content
      .replace(/[，。！？、；：“”''（）《》【】]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    // 返回频率最高的词
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private analyzeSentiment(content: string): number {
    const positiveWords = [
      "好",
      "棒",
      "喜欢",
      "爱",
      "开心",
      "优秀",
      "成功",
      "happy",
      "good",
      "great",
      "love",
      "excellent",
      "success",
    ];
    const negativeWords = [
      "坏",
      "差",
      "讨厌",
      "恨",
      "难过",
      "失败",
      "糟糕",
      "sad",
      "bad",
      "terrible",
      "hate",
      "fail",
      "awful",
    ];

    let positive = 0;
    let negative = 0;

    for (const word of positiveWords) {
      if (content.includes(word)) positive++;
    }
    for (const word of negativeWords) {
      if (content.includes(word)) negative++;
    }

    if (positive === 0 && negative === 0) return 0;
    return (positive - negative) / (positive + negative);
  }

  private assessComplexity(content: string): number {
    // 基于句子长度和词汇复杂度
    const sentences = content.split(/[。！？.!?]/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    const avgSentenceLength = content.length / sentences.length;
    const longWordRatio =
      content.split(/\s+/).filter((w) => w.length > 6).length / content.split(/\s+/).length;

    // 归一化到 0-1
    const complexity = Math.min(1, (avgSentenceLength / 50) * 0.5 + longWordRatio * 0.5);
    return complexity;
  }

  private assessInformationDensity(content: string): number {
    // 基于实体和关键词密度
    const entities = this.extractEntities(content);
    const keywords = this.extractKeywords(content);

    const uniqueInfoCount = new Set([...entities, ...keywords]).size;
    const density = Math.min(1, uniqueInfoCount / (content.length / 20));

    return density;
  }

  // ========================================================================
  // 维度评分
  // ========================================================================

  private scoreDimensions(
    analysis: ContentAnalysis,
    context?: ScoringContext,
  ): ImportanceDimensions {
    // 语义重要性
    const semantic = this.scoreSemantic(analysis);

    // 时间重要性
    const temporal = this.scoreTemporal(analysis, context);

    // 情感重要性
    const emotional = this.scoreEmotional(analysis);

    // 关系重要性
    const relational = this.scoreRelational(analysis);

    // 显性重要性
    const explicit = this.scoreExplicit(analysis);

    return {
      semantic,
      temporal,
      emotional,
      relational,
      explicit,
    };
  }

  private scoreSemantic(analysis: ContentAnalysis): number {
    let score = 0.5;

    // 基于信息密度
    score += analysis.informationDensity * 0.3;

    // 基于复杂度
    score += analysis.complexity * 0.1;

    // 基于实体数量
    score += Math.min(0.1, analysis.entities.length * 0.02);

    // 基于内容类型
    const typeMultipliers: Record<ContentType, number> = {
      fact: 1.0,
      experience: 1.1,
      insight: 1.2,
      pattern: 1.15,
      narrative: 0.9,
      intuition: 1.05,
    };
    score *= typeMultipliers[analysis.contentType] ?? 1.0;

    return Math.min(1, score);
  }

  private scoreTemporal(analysis: ContentAnalysis, context?: ScoringContext): number {
    let score = 0.3;

    // 检查时间相关关键词
    const timeKeywords = [
      "今天",
      "明天",
      "现在",
      "马上",
      "立即",
      "即将",
      "today",
      "tomorrow",
      "now",
      "soon",
      "immediately",
    ];
    for (const keyword of timeKeywords) {
      if (analysis.content.includes(keyword)) {
        score += 0.2;
        break;
      }
    }

    // 检查日期模式
    if (/\d{4}-\d{2}-\d{2}/.test(analysis.content)) {
      score += 0.3;
    }

    // 上下文时间敏感性
    if (context?.timestamp) {
      const hour = new Date(context.timestamp).getHours();
      // 工作时间的内容可能更正式/重要
      if (hour >= 9 && hour <= 18) {
        score += 0.1;
      }
    }

    return Math.min(1, score);
  }

  private scoreEmotional(analysis: ContentAnalysis): number {
    let score = 0.3;

    // 基于情感强度
    score += Math.abs(analysis.sentiment) * 0.4;

    // 基于情感词密度
    const emotionalWords = [
      "爱",
      "恨",
      "喜欢",
      "讨厌",
      "开心",
      "难过",
      "兴奋",
      "失望",
      "担心",
      "害怕",
      "愤怒",
      "感激",
    ];
    let emotionalCount = 0;
    for (const word of emotionalWords) {
      if (analysis.content.includes(word)) emotionalCount++;
    }
    score += Math.min(0.2, emotionalCount * 0.05);

    return Math.min(1, score);
  }

  private scoreRelational(analysis: ContentAnalysis): number {
    let score = 0.3;

    // 基于实体数量
    score += Math.min(0.3, analysis.entities.length * 0.1);

    // 关系关键词
    const relationKeywords = [
      "朋友",
      "家人",
      "同事",
      "关系",
      "连接",
      "friend",
      "family",
      "colleague",
      "relationship",
    ];
    for (const keyword of relationKeywords) {
      if (analysis.content.includes(keyword)) {
        score += 0.2;
        break;
      }
    }

    return Math.min(1, score);
  }

  private scoreExplicit(analysis: ContentAnalysis): number {
    let score = 0.2;

    // 明确的重要性标记
    const importanceMarkers = [
      "重要",
      "关键",
      "必须",
      "remember",
      "important",
      "critical",
      "essential",
      "crucial",
    ];
    for (const marker of importanceMarkers) {
      if (analysis.content.includes(marker)) {
        score += 0.5;
        break;
      }
    }

    // 强调标记
    const emphasisMarkers = ["!", "！", "务必", "一定", "必须", "绝对"];
    for (const marker of emphasisMarkers) {
      if (analysis.content.includes(marker)) {
        score += 0.1;
        break;
      }
    }

    return Math.min(1, score);
  }

  // ========================================================================
  // 规则应用
  // ========================================================================

  private applyRules(
    analysis: ContentAnalysis,
    dimensions: ImportanceDimensions,
    context?: ScoringContext,
  ): { adjustedDimensions: ImportanceDimensions; appliedRules: string[] } {
    const adjustedDimensions = { ...dimensions };
    const appliedRules: string[] = [];

    // 按优先级排序
    const sortedRules = Array.from(this.rules.values())
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.matchesRule(analysis, rule, context)) {
        appliedRules.push(rule.id);

        // 调整相关维度
        for (const dimension of rule.affects) {
          adjustedDimensions[dimension] = Math.min(
            1,
            adjustedDimensions[dimension] + rule.weightAdjustment,
          );
        }
      }
    }

    return { adjustedDimensions, appliedRules };
  }

  private matchesRule(
    analysis: ContentAnalysis,
    rule: ImportanceRule,
    context?: ScoringContext,
  ): boolean {
    const condition = rule.condition;

    // 关键词匹配
    if (condition.keywords) {
      for (const keyword of condition.keywords) {
        if (analysis.content.toLowerCase().includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }

    // 正则匹配
    if (condition.regex) {
      for (const pattern of condition.regex) {
        try {
          const regex = new RegExp(pattern, "i");
          if (regex.test(analysis.content)) {
            return true;
          }
        } catch {
          // 忽略无效正则
        }
      }
    }

    // 上下文条件
    if (condition.contextConditions && context) {
      for (const ctxCondition of condition.contextConditions) {
        if (this.matchesContextCondition(ctxCondition, context)) {
          return true;
        }
      }
    }

    return false;
  }

  private matchesContextCondition(
    condition: NonNullable<ImportanceRule["condition"]["contextConditions"]>[number],
    context: ScoringContext,
  ): boolean {
    switch (condition.type) {
      case "topic-match":
        return context.currentTopic === condition.value;
      case "interest-match":
        return context.recentInterests?.includes(String(condition.value)) ?? false;
      case "time-since":
        if (context.timestamp && typeof condition.value === "number") {
          const minutesSince = (Date.now() - context.timestamp) / (1000 * 60);
          return minutesSince < condition.value;
        }
        return false;
      default:
        return false;
    }
  }

  // ========================================================================
  // 总分计算
  // ========================================================================

  private calculateTotalScore(dimensions: ImportanceDimensions): number {
    const weights = this.adaptiveMode ? this.getAdaptiveWeights() : this.defaultWeights;

    let total = 0;
    total += dimensions.semantic * weights.semantic;
    total += dimensions.temporal * weights.temporal;
    total += dimensions.emotional * weights.emotional;
    total += dimensions.relational * weights.relational;
    total += dimensions.explicit * weights.explicit;

    return Math.min(1, Math.max(0, total));
  }

  private calculateConfidence(analysis: ContentAnalysis, ruleCount: number): number {
    // 基于内容质量和规则匹配计算置信度
    let confidence = 0.5;

    // 内容越长置信度越高 (有更多信息可以分析)
    confidence += Math.min(0.2, analysis.length / 1000);

    // 规则匹配越多置信度越高
    confidence += Math.min(0.2, ruleCount * 0.05);

    // 信息密度影响
    confidence += analysis.informationDensity * 0.1;

    return Math.min(1, confidence);
  }

  private generateExplanation(
    analysis: ContentAnalysis,
    dimensions: ImportanceDimensions,
    appliedRules: string[],
  ): string {
    const parts: string[] = [];

    // 最高分维度
    const entries = Object.entries(dimensions) as Array<[keyof ImportanceDimensions, number]>;
    const highestDimension = entries.sort((a, b) => b[1] - a[1])[0];
    if (highestDimension) {
      parts.push(`主要维度: ${highestDimension[0]} (${(highestDimension[1] * 100).toFixed(0)}%)`);
    }

    // 应用的规则
    if (appliedRules.length > 0) {
      parts.push(`匹配规则: ${appliedRules.length}个`);
    }

    // 内容特征
    parts.push(
      `内容类型: ${analysis.contentType}, 长度: ${analysis.length}, 实体: ${analysis.entities.length}个`,
    );

    return parts.join("; ");
  }

  // ========================================================================
  // 自适应权重
  // ========================================================================

  private getAdaptiveWeights(): ImportanceDimensions {
    if (this.history.length < 10) {
      return this.defaultWeights;
    }

    // 分析历史评分模式，调整权重
    const recentScores = this.history.slice(-100);

    // 如果显性评分普遍高，增加其权重
    const avgExplicit =
      recentScores.reduce((sum, s) => sum + s.dimensions.explicit, 0) / recentScores.length;
    const explicitBoost = avgExplicit > 0.7 ? 0.05 : 0;

    // 如果时间评分普遍高，增加其权重
    const avgTemporal =
      recentScores.reduce((sum, s) => sum + s.dimensions.temporal, 0) / recentScores.length;
    const temporalBoost = avgTemporal > 0.6 ? 0.05 : 0;

    return {
      semantic: this.defaultWeights.semantic - explicitBoost - temporalBoost,
      temporal: this.defaultWeights.temporal + temporalBoost,
      emotional: this.defaultWeights.emotional,
      relational: this.defaultWeights.relational,
      explicit: this.defaultWeights.explicit + explicitBoost,
    };
  }

  setAdaptiveMode(enabled: boolean): void {
    this.adaptiveMode = enabled;
    log.info(`Adaptive mode ${enabled ? "enabled" : "disabled"}`);
  }

  setDefaultWeights(weights: Partial<ImportanceDimensions>): void {
    this.defaultWeights = { ...this.defaultWeights, ...weights };
  }

  // ========================================================================
  // 历史管理
  // ========================================================================

  private addToHistory(score: ImportanceScore): void {
    this.history.push(score);

    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  getHistory(): ImportanceScore[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    log.info("Cleared scoring history");
  }

  // ========================================================================
  // 统计
  // ========================================================================

  getStats() {
    const history = this.history;

    return {
      rules: {
        total: this.rules.size,
        enabled: Array.from(this.rules.values()).filter((r) => r.enabled).length,
      },
      scoring: {
        total: history.length,
        avgScore:
          history.length > 0 ? history.reduce((sum, s) => sum + s.total, 0) / history.length : 0,
        highScoreRate:
          history.length > 0 ? history.filter((s) => s.total > 0.7).length / history.length : 0,
      },
      dimensions: {
        semantic:
          history.length > 0
            ? history.reduce((sum, s) => sum + s.dimensions.semantic, 0) / history.length
            : 0,
        temporal:
          history.length > 0
            ? history.reduce((sum, s) => sum + s.dimensions.temporal, 0) / history.length
            : 0,
        emotional:
          history.length > 0
            ? history.reduce((sum, s) => sum + s.dimensions.emotional, 0) / history.length
            : 0,
        relational:
          history.length > 0
            ? history.reduce((sum, s) => sum + s.dimensions.relational, 0) / history.length
            : 0,
        explicit:
          history.length > 0
            ? history.reduce((sum, s) => sum + s.dimensions.explicit, 0) / history.length
            : 0,
      },
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createImportanceScorer(): ImportanceScorer {
  return new ImportanceScorer();
}
