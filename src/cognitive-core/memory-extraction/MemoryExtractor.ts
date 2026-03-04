/**
 * 记忆提取器 (Memory Extractor)
 * 
 * 从会话中提取8类记忆，对应 OpenViking 的 memory_extractor.py
 * 与 Nsemclaw 三层记忆架构融合
 */

import { createHash } from "crypto";
import type {
  Session,
  SessionMessage,
  ToolCallInfo,
  CandidateMemory,
  ToolSkillCandidateMemory,
  MemoryCategory,
  MemorySection,
  ExtractionResult,
  MemoryExtractionConfig,
  SectionConfig,
} from "./types.js";
import {
  MemoryCategory as MC,
  getMemorySection,
  getDefaultCategories,
  isToolSkillCandidate,
} from "./types.js";

/**
 * LLM 配置
 */
export interface LLMConfig {
  /** 获取完成 */
  getCompletion(prompt: string): Promise<string>;
  /** 是否可用 */
  isAvailable(): boolean;
}

/**
 * 提示模板
 */
interface PromptTemplate {
  render(variables: Record<string, string>): string;
}

/**
 * 记忆提取器
 * 
 * 对应 OpenViking 的 MemoryExtractor 类
 */
export class MemoryExtractor {
  private config: MemoryExtractionConfig;
  private llm: LLMConfig;
  private promptTemplate: PromptTemplate;

  constructor(config: MemoryExtractionConfig, llm: LLMConfig) {
    this.config = config;
    this.llm = llm;
    this.promptTemplate = this.createDefaultPromptTemplate();
  }

  /**
   * 主提取方法
   * 
   * 从会话中提取所有类别的记忆
   */
  async extract(session: Session): Promise<ExtractionResult> {
    const startTime = Date.now();

    if (!this.llm.isAvailable()) {
      console.warn("[MemoryExtractor] LLM not available, skipping extraction");
      return {
        memories: [],
        stats: { user: 0, agent: 0, tool: 0 },
        sessionId: session.id,
        processingTimeMs: 0,
        language: this.config.defaultLanguage,
      };
    }

    // 1. 检测输出语言
    const outputLanguage = this.detectOutputLanguage(session.messages);

    // 2. 格式化消息
    const formattedMessages = this.formatMessages(session.messages);

    // 3. 收集工具统计
    const toolStatsMap = this.collectToolStats(session.toolCalls);

    // 4. 调用 LLM 提取
    const candidates = await this.llmExtract({
      messages: formattedMessages,
      toolStats: toolStatsMap,
      summary: session.metadata.compressionSummary || "",
      userId: session.userId,
      outputLanguage,
    });

    // 5. 添加来源信息和分类
    const memories = candidates.map((c) => this.enrichCandidate(c, session));

    // 6. 统计
    const stats = {
      user: memories.filter((m) => getMemorySection(m.category) === "user").length,
      agent: memories.filter((m) => getMemorySection(m.category) === "agent").length,
      tool: memories.filter((m) => getMemorySection(m.category) === "tool").length,
    };

    return {
      memories,
      stats,
      sessionId: session.id,
      processingTimeMs: Date.now() - startTime,
      language: outputLanguage,
    };
  }

  /**
   * 创建记忆并持久化
   * 
   * 对应 OpenViking 的 create_memory 方法
   */
  async createMemory(
    candidate: CandidateMemory,
    session: Session
  ): Promise<UnifiedMemoryItem | null> {
    const section = getMemorySection(candidate.category);
    
    // 生成 URI
    const uri = this.generateUri(candidate, section, session);

    // 特殊处理 Profile
    if (candidate.category === MC.PROFILE) {
      return this.createProfileMemory(candidate, session, uri);
    }

    // 特殊处理工具/技能记忆
    if (isToolSkillCandidate(candidate)) {
      return this.createToolSkillMemory(candidate, session, uri);
    }

    // 普通记忆
    return {
      uri,
      section,
      category: candidate.category,
      abstract: candidate.abstract,
      overview: candidate.overview,
      content: candidate.content,
      sourceSession: session.id,
      metadata: {
        userId: session.userId,
        agentId: session.agentId,
        accountId: session.accountId,
        language: candidate.language,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        relatedUris: candidate.relatedUris,
      },
    };
  }

  /**
   * 合并记忆束 (L0/L1/L2)
   * 
   * 对应 OpenViking 的 _merge_memory_bundle
   */
  async mergeMemoryBundle(
    existing: {
      abstract: string;
      overview: string;
      content: string;
    },
    newMem: {
      abstract: string;
      overview: string;
      content: string;
    },
    category: MemoryCategory,
    outputLanguage: string
  ): Promise<{ abstract: string; overview: string; content: string; reason: string } | null> {
    const prompt = `
You are a memory merging assistant. Merge the following existing and new memories into a unified memory.

Category: ${category}
Output Language: ${outputLanguage}

Existing Memory:
- Abstract: ${existing.abstract}
- Overview: ${existing.overview}
- Content: ${existing.content}

New Memory:
- Abstract: ${newMem.abstract}
- Overview: ${newMem.overview}
- Content: ${newMem.content}

Please output the merged memory in JSON format:
{
  "decision": "merge",
  "abstract": "...",
  "overview": "...",
  "content": "...",
  "reason": "..."
}
`;

    try {
      const response = await this.llm.getCompletion(prompt);
      const data = this.parseJsonResponse(response);
      
      if (data?.decision === "merge" && data.abstract && data.content) {
        return {
          abstract: String(data.abstract),
          overview: String(data.overview || data.abstract),
          content: String(data.content),
          reason: String(data.reason || "merged"),
        };
      }
      return null;
    } catch (e) {
      console.error("[MemoryExtractor] Merge bundle failed:", e);
      return null;
    }
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 检测输出语言
   * 
   * 对应 OpenViking 的 _detect_output_language
   */
  private detectOutputLanguage(messages: SessionMessage[]): string {
    // 收集用户消息
    const userText = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    if (!userText) {
      return this.config.defaultLanguage;
    }

    // 检测特定语言脚本
    const patterns = {
      ko: /[\uac00-\ud7af]/,
      ru: /[\u0400-\u04ff]/,
      ar: /[\u0600-\u06ff]/,
      ja: /[\u3040-\u30ff\u31f0-\u31ff]/, // Kana
      zh: /[\u4e00-\u9fff]/, // Han
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(userText)) {
        return lang === "zh" ? "zh-CN" : lang;
      }
    }

    return this.config.defaultLanguage;
  }

  /**
   * 格式化消息
   * 
   * 对应 OpenViking 的 _format_message_with_parts
   */
  private formatMessages(messages: SessionMessage[]): string {
    const lines: string[] = [];

    for (const msg of messages) {
      let content = msg.content;

      // 如果有 parts，包含工具调用信息
      if (msg.parts && msg.parts.length > 0) {
        const partTexts = msg.parts.map((p) => {
          if (p.type === "text" && p.text) {
            return p.text;
          } else if (p.type === "tool_call") {
            return `[ToolCall] ${p.toolName}: ${JSON.stringify(p.toolInput)}`;
          } else if (p.type === "tool_result") {
            return `[ToolResult] ${p.toolStatus}: ${p.toolOutput?.slice(0, 500) || ""}`;
          }
          return "";
        });
        content = partTexts.filter(Boolean).join("\n");
      }

      if (content.trim()) {
        lines.push(`[${msg.role}]: ${content}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * 收集工具统计
   * 
   * 对应 OpenViking 的 _collect_tool_stats_from_messages
   */
  private collectToolStats(toolCalls: ToolCallInfo[]): Map<string, {
    durationMs: number;
    promptTokens: number;
    completionTokens: number;
    successTime: number;
    callCount: number;
  }> {
    const statsMap = new Map();

    for (const call of toolCalls) {
      const name = call.toolName;
      if (!name) continue;

      if (!statsMap.has(name)) {
        statsMap.set(name, {
          durationMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          successTime: 0,
          callCount: 0,
        });
      }

      const stats = statsMap.get(name);
      stats.callCount += 1;
      stats.durationMs += call.durationMs || 0;
      stats.promptTokens += call.promptTokens || 0;
      stats.completionTokens += call.completionTokens || 0;
      if (call.status === "completed") {
        stats.successTime += 1;
      }
    }

    return statsMap;
  }

  /**
   * LLM 提取
   */
  private async llmExtract(params: {
    messages: string;
    toolStats: Map<string, unknown>;
    summary: string;
    userId: string;
    outputLanguage: string;
  }): Promise<Array<Partial<CandidateMemory>>> {
    const prompt = this.promptTemplate.render({
      messages: params.messages,
      summary: params.summary,
      user: params.userId,
      outputLanguage: params.outputLanguage,
      toolStats: JSON.stringify(Object.fromEntries(params.toolStats), null, 2),
    });

    try {
      const response = await this.llm.getCompletion(prompt);
      const data = this.parseJsonResponse(response);
      
      if (data?.memories && Array.isArray(data.memories)) {
        return data.memories.map((m: Record<string, string>) => ({
          category: m.category as MemoryCategory,
          abstract: m.abstract,
          overview: m.overview || m.abstract,
          content: m.content,
          toolName: m.tool_name,
          skillName: m.skill_name,
        }));
      }
      return [];
    } catch (e) {
      console.error("[MemoryExtractor] LLM extraction failed:", e);
      return [];
    }
  }

  /**
   * 丰富候选记忆
   */
  private enrichCandidate(
    partial: Partial<CandidateMemory>,
    session: Session
  ): CandidateMemory {
    return {
      category: partial.category || MC.PATTERNS,
      abstract: partial.abstract || "",
      overview: partial.overview || partial.abstract || "",
      content: partial.content || "",
      sourceSession: session.id,
      userId: session.userId,
      language: this.detectOutputLanguage(session.messages),
      relatedUris: {
        resources: session.metadata.usedResources,
        skills: session.metadata.usedSkills,
      },
    } as CandidateMemory;
  }

  /**
   * 生成 URI
   */
  private generateUri(
    candidate: CandidateMemory,
    section: MemorySection,
    session: Session
  ): string {
    const category = candidate.category.toLowerCase();
    const id = this.generateId();

    switch (section) {
      case "user":
        if (candidate.category === MC.PROFILE) {
          return `viking://user/${session.userId}/memories/profile.md`;
        }
        return `viking://user/${session.userId}/memories/${category}/${id}.md`;

      case "agent": {
        const agentSpace = this.getAgentSpace(session.userId, session.agentId);
        return `viking://agent/${agentSpace}/memories/${category}/${id}.md`;
      }

      case "tool": {
        const toolSpace = this.getAgentSpace(session.userId, session.agentId);
        const name = (candidate as ToolSkillCandidateMemory).toolName ||
          (candidate as ToolSkillCandidateMemory).skillName ||
          id;
        return `viking://agent/${toolSpace}/memories/${category}/${name}.md`;
      }
    }
  }

  /**
   * 创建 Profile 记忆
   */
  private async createProfileMemory(
    candidate: CandidateMemory,
    session: Session,
    uri: string
  ): Promise<UnifiedMemoryItem> {
    // Profile 总是合并到 profile.md
    return {
      uri,
      section: "user",
      category: MC.PROFILE,
      abstract: candidate.abstract,
      overview: candidate.overview,
      content: candidate.content,
      sourceSession: session.id,
      metadata: {
        userId: session.userId,
        agentId: session.agentId,
        accountId: session.accountId,
        language: candidate.language,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isProfile: true,
      },
    };
  }

  /**
   * 创建工具/技能记忆
   */
  private createToolSkillMemory(
    candidate: ToolSkillCandidateMemory,
    session: Session,
    uri: string
  ): UnifiedMemoryItem {
    const section = getMemorySection(candidate.category);

    return {
      uri,
      section,
      category: candidate.category,
      abstract: candidate.abstract,
      overview: candidate.overview,
      content: candidate.content,
      sourceSession: session.id,
      metadata: {
        userId: session.userId,
        agentId: session.agentId,
        accountId: session.accountId,
        language: candidate.language,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        toolStats: {
          totalCalls: 1,
          successCount: candidate.successTime ? 1 : 0,
          failCount: candidate.successTime ? 0 : 1,
          totalTimeMs: candidate.durationMs || 0,
          totalTokens: (candidate.promptTokens || 0) + (candidate.completionTokens || 0),
          avgTimeMs: candidate.durationMs,
        },
      },
    };
  }

  /**
   * 获取代理空间 (MD5 hash)
   */
  private getAgentSpace(userId: string, agentId: string): string {
    return createHash("md5")
      .update(userId + agentId)
      .digest("hex")
      .slice(0, 12);
  }

  /**
   * 生成 ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 解析 JSON 响应
   */
  private parseJsonResponse(response: string): Record<string, unknown> | null {
    try {
      // 尝试提取 JSON 块
      const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) ||
        response.match(/```\s*([\s\S]*?)```/) ||
        response.match(/{[\s\S]*}/);
      
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      return JSON.parse(jsonStr.trim());
    } catch {
      return null;
    }
  }

  /**
   * 创建默认提示模板
   */
  private createDefaultPromptTemplate(): PromptTemplate {
    return {
      render: (vars: Record<string, string>) => `
You are a memory extraction assistant. Extract structured memories from the following conversation.

Session Summary: ${vars.summary || "None"}
User: ${vars.user}
Output Language: ${vars.outputLanguage}

Tool Usage Statistics:
${vars.toolStats || "None"}

Conversation:
${vars.messages}

Extract memories in the following categories:
- profile: User profile information (written to profile.md)
- preferences: User preferences (aggregated by topic)
- entities: Entities mentioned (projects, people, concepts)
- events: Significant events or decisions
- cases: Problem-solving cases with solutions
- patterns: Reusable patterns or workflows
- tools: Tool usage insights with statistics
- skills: Skill execution experiences

Output JSON format:
{
  "memories": [
    {
      "category": "profile|preferences|entities|events|cases|patterns|tools|skills",
      "abstract": "One-sentence summary (~100 tokens)",
      "overview": "Medium detail (~2k tokens)",
      "content": "Full narrative",
      "tool_name": "for tools category",
      "skill_name": "for skills category"
    }
  ]
}

Only extract significant, long-term valuable information. Skip trivial details.
`,
    };
  }
}

/**
 * 统一记忆项 (与 ThreeTierMemoryStore 集成)
 */
import type { UnifiedMemoryItem } from "./UnifiedMemoryStore.js";
export { UnifiedMemoryItem };

/**
 * 创建记忆提取器
 */
export function createMemoryExtractor(
  config: MemoryExtractionConfig,
  llm: LLMConfig
): MemoryExtractor {
  return new MemoryExtractor(config, llm);
}
