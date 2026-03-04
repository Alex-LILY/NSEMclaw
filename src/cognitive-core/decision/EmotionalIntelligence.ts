/**
 * 情感智能分析器 - 让决策有"温度"
 *
 * 功能:
 * 1. 分析用户消息中的情感状态
 * 2. 学习用户偏好和习惯
 * 3. 评估用户与系统的关系亲密度
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { EmotionalContext, UserProfile } from "./DecisionModelEngine.js";

const log = createSubsystemLogger("emotional-intelligence");

// ============================================================================
// 情感词典
// ============================================================================

/** 情感关键词映射 */
const EMOTION_PATTERNS: Record<string, RegExp[]> = {
  urgent: [
    /快点/i, /马上/i, /立即/i, /赶紧/i, / urgently/i, /asap/i, /hurry/i,
    /!!!+/, /急.*[吗|么|了]/, /来不及了/i, / deadline/i, /deadline/i,
  ],
  frustrated: [
    /烦死了/i, /又错了/i, /怎么还不/i, /总是/i, /为什么.*不/i,
    /annoyed/i, /frustrated/i, /stupid/i, /broken/i, /useless/i,
    /生气/i, /愤怒/i, /可恶/i, /该死的/i,
  ],
  curious: [
    /为什么/i, /怎么/i, /什么.*意思/i, /能.*吗/i, /可以.*吗/i,
    /how to/i, /why does/i, /what if/i, /curious/i, /wonder/i,
    /解释一下/i, /详细说说/i, /原理.*什么/i,
  ],
  happy: [
    /谢谢/i, /太好了/i, /棒/i, /赞/i, /完美/i, /厉害/i,
    /thanks/i, /great/i, /awesome/i, /perfect/i, /love/i, /happy/i,
    /😊|😄|👍|🎉|❤️/,
  ],
  casual: [
    /随便/i, /都行/i, /看着办/i, /你定/i, /无所谓/i,
    /whatever/i, /up to you/i, /either way/i, /casual/i,
  ],
};

/** 强度指示词 */
const INTENSITY_MARKERS = [
  { pattern: /!!!+/, weight: 0.3 },
  { pattern: /非常|十分|特别|极其/, weight: 0.25 },
  { pattern: /真的|实在/, weight: 0.15 },
  { pattern: /很|太/, weight: 0.1 },
];

// ============================================================================
// 情感分析器
// ============================================================================

export interface EmotionAnalysisOptions {
  /** 考虑历史上下文 */
  useHistory?: boolean;
  /** 用户ID（用于获取画像） */
  userId?: string;
  /** 语言（默认中文） */
  language?: "zh" | "en";
}

export class EmotionalIntelligence {
  private userProfiles = new Map<string, UserProfile>();
  private conversationHistory = new Map<string, Array<{
    message: string;
    emotion: EmotionalContext;
    timestamp: number;
  }>>();

  constructor() {
    log.info("🎭 情感智能分析器初始化");
  }

  /**
   * 分析消息情感
   */
  analyzeMood(message: string, options: EmotionAnalysisOptions = {}): EmotionalContext {
    const { language = "zh" } = options;
    
    // 检测主要情绪
    let detectedMood: EmotionalContext["mood"] = "neutral";
    let maxConfidence = 0;
    const matchedKeywords: string[] = [];

    for (const [mood, patterns] of Object.entries(EMOTION_PATTERNS)) {
      let matchCount = 0;
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          matchCount++;
          // 提取匹配的关键词
          const match = message.match(pattern);
          if (match) {
            matchedKeywords.push(match[0]);
          }
        }
      }

      const confidence = Math.min(1, matchCount * 0.3 + (matchCount > 0 ? 0.3 : 0));
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        detectedMood = mood as EmotionalContext["mood"];
      }
    }

    // 计算语言强度
    let intensity = 0.5;
    for (const marker of INTENSITY_MARKERS) {
      if (marker.pattern.test(message)) {
        intensity += marker.weight;
      }
    }
    intensity = Math.min(1, Math.max(0, intensity));

    // 标点符号强度
    const exclamationCount = (message.match(/!/g) || []).length;
    const questionCount = (message.match(/\?/g) || []).length;
    if (exclamationCount > 0) {
      intensity += Math.min(0.3, exclamationCount * 0.1);
    }
    if (questionCount > 1) {
      intensity += Math.min(0.2, (questionCount - 1) * 0.1);
    }

    const result: EmotionalContext = {
      mood: detectedMood,
      confidence: maxConfidence,
      intensity: Math.min(1, intensity),
      keywords: [...new Set(matchedKeywords)].slice(0, 5),
    };

    // 记录历史
    if (options.userId) {
      this.recordConversation(options.userId, message, result);
    }

    log.debug(`情感分析: ${result.mood} (置信度 ${(result.confidence * 100).toFixed(0)}%, 强度 ${(result.intensity * 100).toFixed(0)}%)`);

    return result;
  }

  /**
   * 快速情绪检测（用于性能敏感场景）
   */
  quickMoodCheck(message: string): EmotionalContext["mood"] {
    // 只检查最关键的标记
    if (/快点|马上|立即|!!|urgent|asap/i.test(message)) return "urgent";
    if (/烦|错|不.*行|stupid|broken/i.test(message)) return "frustrated";
    if (/为什么|怎么|how|why/i.test(message)) return "curious";
    if (/谢谢|好|great|thanks|👍/i.test(message)) return "happy";
    return "neutral";
  }

  /**
   * 获取或创建用户画像
   */
  getUserProfile(userId: string): UserProfile {
    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, this.createDefaultProfile(userId));
    }
    return this.userProfiles.get(userId)!;
  }

  /**
   * 更新用户画像
   */
  updateUserProfile(userId: string, updates: Partial<UserProfile>): void {
    const profile = this.getUserProfile(userId);
    Object.assign(profile, updates);
    log.debug(`用户画像更新: ${userId}`);
  }

  /**
   * 从反馈学习用户偏好
   */
  learnFromFeedback(
    userId: string,
    decision: string,
    userReaction: "satisfied" | "neutral" | "dissatisfied" | "overridden",
    metadata?: { toolName?: string; executionTime?: number },
  ): void {
    const profile = this.getUserProfile(userId);
    
    // 更新满意度历史
    const satisfaction = userReaction === "satisfied" ? 1 :
                        userReaction === "neutral" ? 0.5 : 0;
    profile.satisfactionHistory.push(satisfaction);
    
    // 保持最近20条记录
    if (profile.satisfactionHistory.length > 20) {
      profile.satisfactionHistory.shift();
    }

    // 学习风险容忍度
    if (userReaction === "overridden") {
      // 用户经常覆盖决策，说明系统太保守
      profile.riskTolerance = Math.min(1, profile.riskTolerance + 0.05);
      log.debug(`用户 ${userId} 风险容忍度提高: ${profile.riskTolerance.toFixed(2)}`);
    } else if (userReaction === "dissatisfied" && metadata?.executionTime && metadata.executionTime < 1000) {
      // 用户不满但执行很快，可能太冒进
      profile.riskTolerance = Math.max(0, profile.riskTolerance - 0.03);
    }

    // 学习工具熟悉度
    if (metadata?.toolName) {
      if (!profile.toolFamiliarity[metadata.toolName]) {
        profile.toolFamiliarity[metadata.toolName] = 0.5;
      }
      if (userReaction === "satisfied") {
        profile.toolFamiliarity[metadata.toolName] = Math.min(1, 
          profile.toolFamiliarity[metadata.toolName] + 0.1);
      }
    }

    // 更新关系亲密度
    const recentSatisfaction = profile.satisfactionHistory.slice(-5);
    const avgSatisfaction = recentSatisfaction.reduce((a, b) => a + b, 0) / recentSatisfaction.length;
    profile.relationshipScore = Math.min(1, 0.3 + avgSatisfaction * 0.7);

    log.info(`用户 ${userId} 反馈学习完成: ${userReaction}, 亲密度 ${(profile.relationshipScore * 100).toFixed(0)}%`);
  }

  /**
   * 分析用户响应速度偏好
   */
  inferSpeedPreference(userId: string): UserProfile["preferredSpeed"] {
    const history = this.conversationHistory.get(userId) || [];
    if (history.length < 3) return "balanced";

    // 分析用户等待行为
    let immediateCount = 0;
    let patientCount = 0;

    for (let i = 1; i < history.length; i++) {
      const gap = history[i].timestamp - history[i-1].timestamp;
      if (history[i-1].emotion.mood === "urgent" || gap < 5000) {
        immediateCount++;
      } else if (gap > 30000) {
        patientCount++;
      }
    }

    if (immediateCount > patientCount * 2) return "immediate";
    if (patientCount > immediateCount * 2) return "thoughtful";
    return "balanced";
  }

  /**
   * 检测情绪变化趋势
   */
  detectMoodTrend(userId: string): "improving" | "stable" | "declining" {
    const history = this.conversationHistory.get(userId) || [];
    if (history.length < 5) return "stable";

    const recent = history.slice(-5);
    const older = history.slice(-10, -5);

    const recentNegative = recent.filter(h => 
      h.emotion.mood === "frustrated" || h.emotion.intensity > 0.7
    ).length;
    
    const olderNegative = older.filter(h => 
      h.emotion.mood === "frustrated" || h.emotion.intensity > 0.7
    ).length;

    if (recentNegative < olderNegative) return "improving";
    if (recentNegative > olderNegative) return "declining";
    return "stable";
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private createDefaultProfile(userId: string): UserProfile {
    return {
      userId,
      riskTolerance: 0.5,
      preferredSpeed: "balanced",
      toolFamiliarity: {},
      satisfactionHistory: [],
      relationshipScore: 0.3, // 新用户从0.3开始
      commonPatterns: [],
    };
  }

  private recordConversation(userId: string, message: string, emotion: EmotionalContext): void {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    
    const history = this.conversationHistory.get(userId)!;
    history.push({
      message: message.slice(0, 200), // 限制长度
      emotion,
      timestamp: Date.now(),
    });

    // 保持最近50条记录
    if (history.length > 50) {
      history.shift();
    }

    // 更新常用模式
    this.updateCommonPatterns(userId, message);
  }

  private updateCommonPatterns(userId: string, message: string): void {
    const profile = this.getUserProfile(userId);
    
    // 简单提取关键词作为模式
    const words = message.split(/\s+/).filter(w => w.length > 2);
    for (const word of words.slice(0, 3)) {
      if (!profile.commonPatterns.includes(word)) {
        profile.commonPatterns.push(word);
        if (profile.commonPatterns.length > 10) {
          profile.commonPatterns.shift();
        }
      }
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createEmotionalIntelligence(): EmotionalIntelligence {
  return new EmotionalIntelligence();
}

// 全局实例
let globalEmotionalIntelligence: EmotionalIntelligence | undefined;

export function getEmotionalIntelligence(): EmotionalIntelligence {
  if (!globalEmotionalIntelligence) {
    globalEmotionalIntelligence = createEmotionalIntelligence();
  }
  return globalEmotionalIntelligence;
}

export function resetEmotionalIntelligence(): void {
  globalEmotionalIntelligence = undefined;
}
