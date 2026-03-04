/**
 * 意图分析模块 (Intent Analyzer)
 * 
 * 参考 OpenViking 的 intent_analyzer.py
 * 支持两种模式:
 * 1. 使用内置 expansion 模型 (1.7B) - 本地运行，无额外成本
 * 2. 使用主 LLM - 更精准但消耗 token
 */

import { EventEmitter } from "events";
import type { NsemclawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { SmartEmbeddingEngine } from "../mind/perception/SmartEmbeddingEngine.js";
import { extractKeywords, expandQueryForFts } from "../../memory/query-expansion.js";

const log = createSubsystemLogger("nsem-intent");

/**
 * 意图分析配置
 */
export interface IntentAnalyzerConfig {
  /** 分析模式 */
  mode: "local" | "llm" | "hybrid";
  /** 最大历史消息数 */
  maxRecentMessages: number;
  /** 是否启用查询扩展 */
  enableQueryExpansion: boolean;
  /** 生成的查询数量 */
  numQueries: number;
}

/**
 * 默认配置
 */
export const DEFAULT_INTENT_CONFIG: IntentAnalyzerConfig = {
  mode: "hybrid",
  maxRecentMessages: 5,
  enableQueryExpansion: true,
  numQueries: 3,
};

/**
 * 意图类型
 */
export type IntentType = 
  | "recall"      // 回忆过去
  | "learn"       // 学习新知识
  | "execute"     // 执行技能
  | "explore"     // 探索资源
  | "summarize"   // 总结归纳
  | "compare";    // 对比分析

/**
 * 目标上下文类型
 */
export type TargetContextType = "skill" | "memory" | "resource" | "experience" | "knowledge";

/**
 * 分析后的查询
 */
export interface TypedQuery {
  /** 查询文本 */
  query: string;
  /** 目标类型 */
  targetTypes: TargetContextType[];
  /** 意图 */
  intent: IntentType;
  /** 优先级 (1-5, 1最高) */
  priority: number;
  /** 置信度 */
  confidence: number;
}

/**
 * 意图分析结果
 */
export interface IntentAnalysis {
  /** 主要意图 */
  primaryIntent: IntentType;
  /** 子意图列表 */
  subIntents: string[];
  /** 提取的关键词 */
  keywords: string[];
  /** 扩展的查询列表 */
  expandedQueries: TypedQuery[];
  /** 推理过程 */
  reasoning: string;
  /** 会话上下文摘要 */
  sessionContext: string;
}

/**
 * 会话上下文
 */
export interface SessionContext {
  /** 会话摘要 */
  summary?: string;
  /** 最近消息 */
  recentMessages?: Array<{ role: string; content: string }>;
  /** 当前主题 */
  currentTopic?: string;
}

/**
 * LLM 查询扩展器类型
 */
export type LLMQueryExpander = (query: string) => Promise<string[]>;

/**
 * 意图分析器
 * 
 * 分析用户查询意图，生成多个类型化的查询
 */
export class IntentAnalyzer extends EventEmitter {
  private config: IntentAnalyzerConfig;
  private nsemConfig: NsemclawConfig;
  private expansionEngine?: SmartEmbeddingEngine;
  private llmExpander?: LLMQueryExpander;
  private isInitialized: boolean = false;

  constructor(
    nsemConfig: NsemclawConfig,
    config: Partial<IntentAnalyzerConfig> = {},
    llmExpander?: LLMQueryExpander
  ) {
    super();
    this.nsemConfig = nsemConfig;
    this.config = { ...DEFAULT_INTENT_CONFIG, ...config };
    this.llmExpander = llmExpander;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 如果需要使用 expansion 模型
    if (this.config.mode === "local" || this.config.mode === "hybrid") {
      try {
        log.info("初始化意图分析器 (使用 expansion 模型)");
        
        this.expansionEngine = new SmartEmbeddingEngine({
          cfg: this.nsemConfig,
          agentId: "intent-analyzer",
          memoryConfig: { provider: "local" },
          resourceMode: "performance",  // 需要加载 expansion 模型
          expansionModelPath: "expansion",
          autoDownloadModels: true,
        });

        await this.expansionEngine.initialize();
        log.info("意图分析器初始化完成");
      } catch (error) {
        log.warn(`expansion 模型加载失败，将使用纯规则分析: ${error}`);
        // 不阻止初始化，失败时回退到规则分析
      }
    }

    this.isInitialized = true;
    this.emit("initialized");
  }

  /**
   * 分析意图
   * 
   * 主要入口，分析用户查询并生成类型化查询计划
   */
  async analyze(
    query: string,
    sessionContext?: SessionContext
  ): Promise<IntentAnalysis> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    log.info(`分析意图: "${query.slice(0, 50)}..."`);

    // 1. 提取关键词
    const keywords = extractKeywords(query);
    
    // 2. 推断主要意图
    const primaryIntent = this.inferPrimaryIntent(query, keywords);
    
    // 3. 推断子意图
    const subIntents = this.inferSubIntents(query, keywords);
    
    // 4. 生成扩展查询
    const expandedQueries = await this.generateTypedQueries(
      query,
      keywords,
      primaryIntent,
      sessionContext
    );

    // 5. 构建推理过程
    const reasoning = this.buildReasoning(query, primaryIntent, keywords, expandedQueries);

    // 6. 构建会话上下文摘要
    const sessionContextStr = this.buildSessionContext(sessionContext);

    const result: IntentAnalysis = {
      primaryIntent,
      subIntents,
      keywords,
      expandedQueries,
      reasoning,
      sessionContext: sessionContextStr,
    };

    log.info(`意图分析完成: ${primaryIntent}, 生成 ${expandedQueries.length} 个查询`);
    
    this.emit("analyzed", result);
    return result;
  }

  /**
   * 推断主要意图
   */
  private inferPrimaryIntent(query: string, keywords: string[]): IntentType {
    const text = query.toLowerCase();
    
    // 规则匹配
    if (/\b(记得|回忆|之前|上次|过去|recall|remember|previous|past)\b/.test(text)) {
      return "recall";
    }
    if (/\b(学习|了解|掌握|什么是|learn|study|understand|what is)\b/.test(text)) {
      return "learn";
    }
    if (/\b(执行|运行|调用|使用|execute|run|use|call)\b/.test(text)) {
      return "execute";
    }
    if (/\b(查找|搜索|找|explore|find|search|look for)\b/.test(text)) {
      return "explore";
    }
    if (/\b(总结|概括|归纳|summarize|summary|overview)\b/.test(text)) {
      return "summarize";
    }
    if (/\b(对比|比较|区别|compare|vs|difference|versus)\b/.test(text)) {
      return "compare";
    }
    
    // 默认意图
    return "explore";
  }

  /**
   * 推断子意图
   */
  private inferSubIntents(query: string, keywords: string[]): string[] {
    const subIntents: string[] = [];
    const text = query.toLowerCase();
    
    // 细分子意图
    if (/\b(详细|具体|详细说明|details|specific|elaborate)\b/.test(text)) {
      subIntents.push("detailed");
    }
    if (/\b(快速|简单|简要|quick|brief|simple)\b/.test(text)) {
      subIntents.push("quick");
    }
    if (/\b(最新|最近|最近更新|latest|recent|new)\b/.test(text)) {
      subIntents.push("recent");
    }
    if (/\b(相关|关联|类似|related|similar|connected)\b/.test(text)) {
      subIntents.push("related");
    }
    
    return subIntents;
  }

  /**
   * 推断目标类型
   */
  private inferTargetTypes(query: string, keywords: string[]): TargetContextType[] {
    const types: TargetContextType[] = [];
    const text = (query + " " + keywords.join(" ")).toLowerCase();
    
    if (/\b(技能|函数|工具|skill|function|tool|capability)\b/.test(text)) {
      types.push("skill");
    }
    if (/\b(记忆|记得|对话|经验|memory|conversation|experience|remember)\b/.test(text)) {
      types.push("memory");
    }
    if (/\b(资源|文件|文档|resource|file|document)\b/.test(text)) {
      types.push("resource");
    }
    if (/\b(经历|经验|学习|experience|learning|practice)\b/.test(text)) {
      types.push("experience");
    }
    if (/\b(知识|概念|理论|knowledge|concept|theory)\b/.test(text)) {
      types.push("knowledge");
    }
    
    // 默认搜索所有类型
    return types.length > 0 ? types : ["memory", "resource", "knowledge"];
  }

  /**
   * 生成类型化查询
   */
  private async generateTypedQueries(
    originalQuery: string,
    keywords: string[],
    primaryIntent: IntentType,
    sessionContext?: SessionContext
  ): Promise<TypedQuery[]> {
    const queries: TypedQuery[] = [];
    
    // 1. 原始查询 (最高优先级)
    queries.push({
      query: originalQuery,
      targetTypes: this.inferTargetTypes(originalQuery, keywords),
      intent: primaryIntent,
      priority: 1,
      confidence: 1.0,
    });

    // 2. 使用 expansion 模型扩展查询
    if (this.config.enableQueryExpansion && this.expansionEngine) {
      try {
        const expansion = await this.expansionEngine.expandQuery(originalQuery);
        
        for (const variant of expansion.variants.slice(0, this.config.numQueries - 1)) {
          queries.push({
            query: variant,
            targetTypes: this.inferTargetTypes(variant, keywords),
            intent: primaryIntent,
            priority: 2,
            confidence: 0.8,
          });
        }
      } catch (error) {
        log.warn(`查询扩展失败: ${error}`);
      }
    }

    // 3. 使用 LLM 扩展 (如果配置)
    if (this.config.mode === "llm" || this.config.mode === "hybrid") {
      if (this.llmExpander) {
        try {
          const llmKeywords = await this.llmExpander(originalQuery);
          
          for (const kw of llmKeywords.slice(0, 2)) {
            if (!queries.some(q => q.query === kw)) {
              queries.push({
                query: kw,
                targetTypes: this.inferTargetTypes(kw, []),
                intent: primaryIntent,
                priority: 2,
                confidence: 0.7,
              });
            }
          }
        } catch (error) {
          log.warn(`LLM 扩展失败: ${error}`);
        }
      }
    }

    // 4. 针对特定类型生成专门查询
    const targetTypes = this.inferTargetTypes(originalQuery, keywords);
    
    for (const type of targetTypes) {
      const specializedQuery = this.generateSpecializedQuery(originalQuery, type);
      if (specializedQuery && !queries.some(q => q.query === specializedQuery)) {
        queries.push({
          query: specializedQuery,
          targetTypes: [type],
          intent: primaryIntent,
          priority: 3,
          confidence: 0.6,
        });
      }
    }

    return queries;
  }

  /**
   * 生成专门化查询
   */
  private generateSpecializedQuery(query: string, type: TargetContextType): string | null {
    switch (type) {
      case "skill":
        return `skill for ${query}`;
      case "memory":
        return `remember ${query}`;
      case "resource":
        return `${query} document file`;
      case "experience":
        return `experience with ${query}`;
      case "knowledge":
        return `what is ${query}`;
      default:
        return null;
    }
  }

  /**
   * 构建推理过程描述
   */
  private buildReasoning(
    query: string,
    intent: IntentType,
    keywords: string[],
    expandedQueries: TypedQuery[]
  ): string {
    const parts: string[] = [];
    
    parts.push(`用户查询"${query}"的主要意图是[${intent}]`);
    parts.push(`提取关键词: [${keywords.join(", ")}]`);
    parts.push(`生成了 ${expandedQueries.length} 个类型化查询`);
    
    for (const q of expandedQueries) {
      parts.push(`  - ${q.query} (${q.targetTypes.join("/")}, P${q.priority})`);
    }
    
    return parts.join("; ");
  }

  /**
   * 构建会话上下文摘要
   */
  private buildSessionContext(sessionContext?: SessionContext): string {
    if (!sessionContext) return "无上下文";
    
    const parts: string[] = [];
    
    if (sessionContext.summary) {
      parts.push(`会话摘要: ${sessionContext.summary.slice(0, 100)}`);
    }
    
    if (sessionContext.recentMessages && sessionContext.recentMessages.length > 0) {
      const recent = sessionContext.recentMessages
        .slice(-this.config.maxRecentMessages)
        .map(m => `${m.role}: ${m.content.slice(0, 50)}`)
        .join(" | ");
      parts.push(`最近消息: ${recent}`);
    }
    
    if (sessionContext.currentTopic) {
      parts.push(`当前主题: ${sessionContext.currentTopic}`);
    }
    
    return parts.join(" | ") || "无上下文";
  }

  /**
   * 快速分析 (不使用模型，仅规则)
   */
  quickAnalyze(query: string): IntentAnalysis {
    const keywords = extractKeywords(query);
    const primaryIntent = this.inferPrimaryIntent(query, keywords);
    const subIntents = this.inferSubIntents(query, keywords);
    const targetTypes = this.inferTargetTypes(query, keywords);
    
    return {
      primaryIntent,
      subIntents,
      keywords,
      expandedQueries: [{
        query,
        targetTypes,
        intent: primaryIntent,
        priority: 1,
        confidence: 0.8,
      }],
      reasoning: `快速分析: 意图=${primaryIntent}, 关键词=[${keywords.join(", ")}]`,
      sessionContext: "无",
    };
  }

  /**
   * 销毁
   */
  destroy(): void {
    // expansionEngine 的清理由 SmartEmbeddingEngine 处理
    this.removeAllListeners();
  }
}

/**
 * 创建意图分析器
 */
export function createIntentAnalyzer(
  nsemConfig: NsemclawConfig,
  config?: Partial<IntentAnalyzerConfig>,
  llmExpander?: LLMQueryExpander
): IntentAnalyzer {
  return new IntentAnalyzer(nsemConfig, config, llmExpander);
}
