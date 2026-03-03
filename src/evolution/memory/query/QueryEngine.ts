/**
 * 查询引擎 - 激活记忆场
 *
 * 实现类神经网络的激活传播:
 * 1. 种子激活: 从查询向量开始
 * 2. 场激活: 找到相关记忆场
 * 3. 传播: 在场内和场间传播激活
 * 4. 涌现: 发现新的关联
 */

import type { MemoryEcosystem } from "../core/MemoryEcosystem.js";
import type { MemAtom, MemoryField, MemoryQuery, ActivatedMemory } from "../core/types.js";
import type { Vector } from "../core/embedding.js";

export interface QueryConfig {
  /** 最大传播深度 */
  maxDepth: number;

  /** 激活阈值 */
  activationThreshold: number;

  /** 衰减系数 */
  decayFactor: number;

  /** 最大返回结果 */
  maxResults: number;

  /** 温度参数（探索vs利用） */
  temperature: number;
}

const DEFAULT_CONFIG: QueryConfig = {
  maxDepth: 3,
  activationThreshold: 0.3,
  decayFactor: 0.7,
  maxResults: 10,
  temperature: 0.5,
};

export class QueryEngine {
  private ecosystem: MemoryEcosystem;
  private config: QueryConfig;

  constructor(ecosystem: MemoryEcosystem, config: Partial<QueryConfig> = {}) {
    this.ecosystem = ecosystem;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 激活记忆 - 核心查询方法
   */
  async activate(query: MemoryQuery): Promise<ActivatedMemory> {
    const embedding = await this.ecosystem.getEmbeddingEngine().embed(query.intent);

    // 初始化激活状态
    const activationMap = new Map<
      string,
      {
        level: number;
        depth: number;
        path: string[];
      }
    >();

    // 1. 种子激活 - 找到最相似的原子
    const seeds = await this.findSimilar(embedding, 20);

    for (const { atom, similarity } of seeds) {
      if (similarity >= this.config.activationThreshold) {
        activationMap.set(atom.id, {
          level: similarity,
          depth: 0,
          path: [atom.id],
        });
      }
    }

    // 2. 传播激活
    this.spreadActivation(activationMap);

    // 3. 场激活
    const fields = this.activateFields(activationMap);

    // 4. 发现涌现关系
    const emergentRelations = this.discoverEmergentRelations(activationMap);

    // 5. 组装结果
    const atoms = this.assembleAtoms(activationMap, query);

    // 6. 更新访问统计
    this.updateAccessStats(atoms.map((a) => a.atom.id));

    // 7. 计算整体语义
    const semantic = this.computeSemantic(atoms);

    return {
      atoms,
      fields,
      emergentRelations,
      semantic,
    };
  }

  /**
   * 找到相似的原子
   */
  async findSimilar(
    embedding: Vector,
    topK: number = 10,
    minSimilarity: number = 0,
  ): Promise<Array<{ atom: MemAtom; similarity: number }>> {
    const atoms = this.ecosystem.getAtoms();
    const results: Array<{ atom: MemAtom; similarity: number }> = [];

    for (const atom of atoms.values()) {
      // 应用约束
      if (atom.strength.current < 0.1) continue; // 太弱的跳过

      const similarity = this.ecosystem.getEmbeddingEngine().similarity(embedding, atom.embedding);

      if (similarity >= minSimilarity) {
        results.push({ atom, similarity });
      }
    }

    // 排序并取Top K
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  /**
   * 快速语义搜索
   */
  async semanticSearch(
    query: string,
    options: {
      maxResults?: number;
      minStrength?: number;
      contentTypes?: MemAtom["contentType"][];
    } = {},
  ): Promise<Array<{ atom: MemAtom; score: number; snippet: string }>> {
    const embedding = await this.ecosystem.getEmbeddingEngine().embed(query);
    const similar = await this.findSimilar(embedding, options.maxResults || 10);

    return similar
      .filter(({ atom }) => {
        if (options.minStrength && atom.strength.current < options.minStrength) {
          return false;
        }
        if (options.contentTypes && !options.contentTypes.includes(atom.contentType)) {
          return false;
        }
        return true;
      })
      .map(({ atom, similarity }) => ({
        atom,
        score: similarity * atom.strength.current,
        snippet: this.extractSnippet(atom.content, query),
      }));
  }

  /**
   * 关联发现 - 找到两个原子之间的路径
   */
  findAssociation(fromId: string, toId: string, maxDepth: number = 5): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[], depth: number) => {
      if (depth > maxDepth) return;
      if (current === toId) {
        paths.push([...path]);
        return;
      }

      visited.add(current);

      // 找到所有相关的边
      const edges = this.findEdgesFrom(current);

      for (const edge of edges) {
        const next = edge.from === current ? edge.to : edge.from;
        if (!visited.has(next)) {
          path.push(next);
          dfs(next, path, depth + 1);
          path.pop();
        }
      }

      visited.delete(current);
    };

    dfs(fromId, [fromId], 0);

    return paths;
  }

  /**
   * 联想生成 - 基于给定原子生成相关想法
   */
  async generateAssociations(
    atomIds: string[],
    count: number = 5,
  ): Promise<Array<{ content: string; confidence: number; basis: string[] }>> {
    // 获取种子原子的语义中心
    const embeddings: Vector[] = [];
    for (const id of atomIds) {
      const atom = this.ecosystem.getAtoms().get(id);
      if (atom) embeddings.push(atom.embedding);
    }

    if (embeddings.length === 0) return [];

    // 计算质心
    const centroid = this.computeCentroid(embeddings);

    // 在质心附近搜索，但排除已知原子
    const similar = await this.findSimilar(centroid, count * 3);
    const knownSet = new Set(atomIds);

    const associations = similar
      .filter(({ atom }) => !knownSet.has(atom.id))
      .slice(0, count)
      .map(({ atom, similarity }) => ({
        content: atom.content,
        confidence: similarity,
        basis: this.findAssociation(atomIds[0], atom.id, 3)[0] || [atomIds[0], atom.id],
      }));

    return associations;
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  private spreadActivation(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
  ): void {
    const edges = this.ecosystem.getEdges();

    for (let depth = 0; depth < this.config.maxDepth; depth++) {
      const currentLevel = Array.from(activationMap.entries()).filter(
        ([_, info]) => info.depth === depth,
      );

      for (const [atomId, info] of currentLevel) {
        // 找到所有相关边
        for (const edge of edges.values()) {
          if (edge.from !== atomId && edge.to !== atomId) continue;

          const neighborId = edge.from === atomId ? edge.to : edge.from;

          // 计算传播后的激活水平
          const newLevel = info.level * edge.dynamicWeight.current * this.config.decayFactor;

          if (newLevel >= this.config.activationThreshold) {
            const existing = activationMap.get(neighborId);

            if (!existing || existing.level < newLevel) {
              activationMap.set(neighborId, {
                level: newLevel,
                depth: depth + 1,
                path: [...info.path, neighborId],
              });
            }
          }
        }
      }
    }
  }

  private activateFields(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
  ): Array<{ field: MemoryField; overlap: number }> {
    const fields = this.ecosystem.getFields();
    const results: Array<{ field: MemoryField; overlap: number }> = [];

    for (const field of fields.values()) {
      // 计算重叠度
      const activeAtoms = Array.from(activationMap.keys());
      const overlapCount = activeAtoms.filter((id) => field.atoms.has(id)).length;
      const overlap = overlapCount / Math.max(activeAtoms.length, field.atoms.size);

      if (overlap > 0.3) {
        results.push({ field, overlap });
        field.vitality = Math.min(1, field.vitality + 0.1);
      }
    }

    results.sort((a, b) => b.overlap - a.overlap);
    return results.slice(0, 5);
  }

  private discoverEmergentRelations(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
  ): ActivatedMemory["emergentRelations"] {
    const relations: ActivatedMemory["emergentRelations"] = [];
    const atoms = Array.from(activationMap.entries());
    const edges = this.ecosystem.getEdges();

    // 检查所有激活的原子对
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const [id1, info1] = atoms[i];
        const [id2, info2] = atoms[j];

        // 检查是否已有直接连接
        const directEdge = Array.from(edges.values()).find(
          (e) => (e.from === id1 && e.to === id2) || (e.from === id2 && e.to === id1),
        );

        if (!directEdge) {
          // 通过公共邻居计算间接连接强度
          const commonNeighbors = this.findCommonNeighbors(id1, id2);

          if (commonNeighbors.length > 0) {
            const strength =
              Math.min(info1.level, info2.level) * (1 - 1 / (commonNeighbors.length + 1));

            relations.push({
              from: id1,
              to: id2,
              via: commonNeighbors,
              strength,
              isNovel: true,
            });
          }
        }
      }
    }

    relations.sort((a, b) => b.strength - a.strength);
    return relations.slice(0, 10);
  }

  private assembleAtoms(
    activationMap: Map<string, { level: number; depth: number; path: string[] }>,
    query: MemoryQuery,
  ): ActivatedMemory["atoms"] {
    const atoms: ActivatedMemory["atoms"] = [];
    const maxResults = query.constraints?.maxResults || this.config.maxResults;

    const sorted = Array.from(activationMap.entries())
      .sort((a, b) => b[1].level - a[1].level)
      .slice(0, maxResults);

    for (const [id, info] of sorted) {
      const atom = this.ecosystem.getAtoms().get(id);
      if (atom) {
        atoms.push({
          atom,
          activation: info.level,
          relevance: info.level * atom.strength.current,
          spreadDepth: info.depth,
          path: info.path,
        });
      }
    }

    return atoms;
  }

  private computeSemantic(atoms: ActivatedMemory["atoms"]): ActivatedMemory["semantic"] {
    if (atoms.length === 0) {
      return { centroid: [], coherence: 0, coverage: 0 };
    }

    // 计算质心
    const embeddings = atoms.map((a) => a.atom.embedding);
    const centroid = this.computeCentroid(embeddings);

    // 计算一致性（原子间的平均相似度）
    let coherenceSum = 0;
    let coherenceCount = 0;

    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const sim = this.ecosystem
          .getEmbeddingEngine()
          .similarity(atoms[i].atom.embedding, atoms[j].atom.embedding);
        coherenceSum += sim;
        coherenceCount++;
      }
    }

    const coherence = coherenceCount > 0 ? coherenceSum / coherenceCount : 1;

    // 计算覆盖度（激活原子的比例）
    const totalAtoms = this.ecosystem.getAtoms().size;
    const coverage = totalAtoms > 0 ? atoms.length / totalAtoms : 0;

    return { centroid, coherence, coverage };
  }

  private findEdgesFrom(atomId: string) {
    const edges = this.ecosystem.getEdges();
    return Array.from(edges.values()).filter((e) => e.from === atomId || e.to === atomId);
  }

  private findCommonNeighbors(id1: string, id2: string): string[] {
    const neighbors1 = new Set(
      this.findEdgesFrom(id1).map((e) => (e.from === id1 ? e.to : e.from)),
    );
    const neighbors2 = new Set(
      this.findEdgesFrom(id2).map((e) => (e.from === id2 ? e.to : e.from)),
    );

    return Array.from(neighbors1).filter((n) => neighbors2.has(n));
  }

  private computeCentroid(embeddings: Vector[]): Vector {
    if (embeddings.length === 0) return [];

    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += emb[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  private updateAccessStats(atomIds: string[]): void {
    const atoms = this.ecosystem.getAtoms();
    const now = Date.now();

    for (const id of atomIds) {
      const atom = atoms.get(id);
      if (atom) {
        atom.temporal.lastAccessed = now;
        atom.temporal.accessCount++;
      }
    }
  }

  private extractSnippet(content: string, query: string, maxLength: number = 200): string {
    // 找到查询词的位置
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();

    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) {
      return content.slice(0, maxLength);
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 50);

    let snippet = content.slice(start, end);

    if (start > 0) snippet = "..." + snippet;
    if (end < content.length) snippet = snippet + "...";

    return snippet;
  }
}
