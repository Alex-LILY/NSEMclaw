/**
 * 记忆去重器 (Memory Deduplicator)
 * 
 * 对应 OpenViking 的 memory_deduplicator.py
 * 向量预过滤 + LLM 决策
 */

import type {
  CandidateMemory,
  MemoryCategory,
  MemorySection,
  DedupResult,
  ExistingMemoryAction,
  UnifiedMemoryItem,
} from "./types.js";
import { DedupDecision, MemoryActionDecision } from "./types.js";

/**
 * 向量嵌入器接口
 */
export interface Embedder {
  embed(text: string): Promise<{ denseVector: number[] }>;
}

/**
 * LLM 接口
 */
export interface LLMInterface {
  getCompletion(prompt: string): Promise<string>;
  isAvailable(): boolean;
}

/**
 * 存储查询接口
 */
export interface MemoryStorageQuery {
  searchSimilar(
    queryVector: number[],
    filters: {
      section?: MemorySection;
      category?: MemoryCategory;
      userId?: string;
    },
    limit: number
  ): Promise<Array<{ uri: string; score: number; abstract: string; content: string }>>;
}

/**
 * 去重配置
 */
export interface DeduplicatorConfig {
  /** 相似度阈值 */
  similarityThreshold: number;
  /** 最大相似记忆数 */
  maxSimilarMemories: number;
  /** 是否启用 LLM 决策 */
  useLLM: boolean;
}

/**
 * 记忆去重器
 * 
 * 对应 OpenViking 的 MemoryDeduplicator 类
 */
export class MemoryDeduplicator {
  private config: DeduplicatorConfig;
  private embedder: Embedder;
  private llm: LLMInterface;
  private storage: MemoryStorageQuery;

  constructor(
    config: DeduplicatorConfig,
    embedder: Embedder,
    llm: LLMInterface,
    storage: MemoryStorageQuery
  ) {
    this.config = {
      similarityThreshold: config.similarityThreshold ?? 0.85,
      maxSimilarMemories: config.maxSimilarMemories ?? 5,
      useLLM: config.useLLM ?? true,
    };
    this.embedder = embedder;
    this.llm = llm;
    this.storage = storage;
  }

  /**
   * 主去重方法
   * 
   * 对应 OpenViking 的 deduplicate 方法
   */
  async deduplicate(
    candidate: CandidateMemory,
    section: MemorySection,
    userId?: string
  ): Promise<DedupResult> {
    // Step 1: 向量预过滤 - 在同板块中查找相似记忆
    const similarMemories = await this.findSimilarMemories(
      candidate,
      section,
      userId
    );

    if (similarMemories.length === 0) {
      // 没有相似记忆，直接创建
      return {
        decision: DedupDecision.CREATE,
        candidate,
        similarMemories: [],
        actions: [],
        reason: "No similar memories found",
      };
    }

    // Step 2: 根据板块策略处理
    if (section === "tool") {
      // 工具板块总是合并
      return {
        decision: DedupDecision.NONE,
        candidate,
        similarMemories: similarMemories.map((m) => m.uri),
        actions: [
          {
            uri: similarMemories[0].uri,
            decision: MemoryActionDecision.MERGE,
            reason: "Tool memories always merge",
          },
        ],
        reason: "Tool memory always merges with existing",
      };
    }

    // Step 3: LLM 决策
    if (this.config.useLLM && this.llm.isAvailable()) {
      return await this.llmDecision(candidate, similarMemories);
    }

    // 无 LLM 时的默认策略：创建
    return {
      decision: DedupDecision.CREATE,
      candidate,
      similarMemories: similarMemories.map((m) => m.uri),
      actions: [],
      reason: "LLM not available, defaulting to CREATE",
    };
  }

  /**
   * 批量去重
   */
  async deduplicateBatch(
    candidates: CandidateMemory[],
    section: MemorySection,
    userId?: string
  ): Promise<DedupResult[]> {
    const results: DedupResult[] = [];
    
    for (const candidate of candidates) {
      const result = await this.deduplicate(candidate, section, userId);
      results.push(result);
    }
    
    return results;
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 查找相似记忆
   * 
   * 对应 OpenViking 的 _find_similar_memories
   */
  private async findSimilarMemories(
    candidate: CandidateMemory,
    section: MemorySection,
    userId?: string
  ): Promise<Array<{ uri: string; score: number; abstract: string; content: string }>> {
    try {
      // 生成候选的嵌入向量
      const queryText = `${candidate.abstract} ${candidate.content}`;
      const embedResult = await this.embedder.embed(queryText);
      const queryVector = embedResult.denseVector;

      // 搜索相似记忆
      const results = await this.storage.searchSimilar(
        queryVector,
        {
          section,
          category: candidate.category,
          userId,
        },
        this.config.maxSimilarMemories
      );

      // 过滤低于阈值的
      return results.filter((r) => r.score >= this.config.similarityThreshold);
    } catch (e) {
      console.error("[MemoryDeduplicator] Vector search failed:", e);
      return [];
    }
  }

  /**
   * LLM 决策
   * 
   * 对应 OpenViking 的 _llm_decision
   */
  private async llmDecision(
    candidate: CandidateMemory,
    similarMemories: Array<{ uri: string; score: number; abstract: string; content: string }>
  ): Promise<DedupResult> {
    const prompt = this.buildDecisionPrompt(candidate, similarMemories);

    try {
      const response = await this.llm.getCompletion(prompt);
      const decision = this.parseDecisionResponse(response);

      return {
        decision: decision.decision,
        candidate,
        similarMemories: similarMemories.map((m) => m.uri),
        actions: decision.actions,
        reason: decision.reason,
      };
    } catch (e) {
      console.error("[MemoryDeduplicator] LLM decision failed:", e);
      // 失败时默认创建
      return {
        decision: DedupDecision.CREATE,
        candidate,
        similarMemories: similarMemories.map((m) => m.uri),
        actions: [],
        reason: "LLM decision failed, defaulting to CREATE",
      };
    }
  }

  /**
   * 构建决策提示
   */
  private buildDecisionPrompt(
    candidate: CandidateMemory,
    similarMemories: Array<{ uri: string; abstract: string; content: string }>
  ): string {
    const similarList = similarMemories
      .map(
        (m, i) => `
[${i + 1}] URI: ${m.uri}
Abstract: ${m.abstract}
Content: ${m.content.slice(0, 500)}...
`
      )
      .join("\n");

    return `
You are a memory deduplication assistant. Decide how to handle the candidate memory based on existing similar memories.

Candidate Memory:
- Category: ${candidate.category}
- Abstract: ${candidate.abstract}
- Content: ${candidate.content.slice(0, 1000)}...

Similar Existing Memories:
${similarList}

Decision Options:
1. SKIP - The candidate is a duplicate, skip it
2. CREATE - Create the candidate as a new memory
3. NONE - Don't create candidate, but take actions on existing memories

For existing memories, you can decide to:
- MERGE - Merge candidate content into existing memory
- DELETE - Delete outdated/conflicting existing memory

Output JSON format:
{
  "decision": "skip|create|none",
  "reason": "explanation",
  "actions": [
    {
      "uri": "memory_uri",
      "decision": "merge|delete",
      "reason": "why"
    }
  ]
}

Rules:
- If candidate is very similar to existing, use SKIP or MERGE
- If candidate provides new information, use CREATE
- If existing memory is outdated, use DELETE then CREATE
- Profile category always uses MERGE, never DELETE
`;
  }

  /**
   * 解析决策响应
   */
  private parseDecisionResponse(response: string): {
    decision: DedupDecision;
    actions: ExistingMemoryAction[];
    reason: string;
  } {
    try {
      // 提取 JSON
      const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) ||
        response.match(/```\s*([\s\S]*?)```/) ||
        response.match(/{[\s\S]*}/);
      
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      const data = JSON.parse(jsonStr.trim());

      const decision = (data.decision || "create").toLowerCase();
      const reason = data.reason || "No reason provided";
      
      // 解析动作
      const actions: ExistingMemoryAction[] = [];
      if (data.actions && Array.isArray(data.actions)) {
        for (const action of data.actions) {
          if (action.uri && action.decision) {
            actions.push({
              uri: action.uri,
              decision: action.decision.toLowerCase() as MemoryActionDecision,
              reason: action.reason || "",
            });
          }
        }
      }

      // 映射决策
      let dedupDecision: DedupDecision;
      switch (decision) {
        case "skip":
          dedupDecision = DedupDecision.SKIP;
          break;
        case "none":
          dedupDecision = DedupDecision.NONE;
          break;
        case "create":
        default:
          dedupDecision = DedupDecision.CREATE;
          break;
      }

      return { decision: dedupDecision, actions, reason };
    } catch (e) {
      console.error("[MemoryDeduplicator] Failed to parse decision:", e);
      return {
        decision: DedupDecision.CREATE,
        actions: [],
        reason: "Parse error, defaulting to CREATE",
      };
    }
  }
}

/**
 * 创建记忆去重器
 */
export function createMemoryDeduplicator(
  config: DeduplicatorConfig,
  embedder: Embedder,
  llm: LLMInterface,
  storage: MemoryStorageQuery
): MemoryDeduplicator {
  return new MemoryDeduplicator(config, embedder, llm, storage);
}
