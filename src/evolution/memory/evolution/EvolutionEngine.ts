/**
 * 进化引擎 - 记忆的自我优化
 *
 * 模拟自然选择的进化过程:
 * 1. 选择: 识别高价值记忆
 * 2. 变异: 重组和提炼
 * 3. 竞争: 优胜劣汰
 * 4. 遗传: 压缩为晶体传递
 */

import type { MemoryEcosystem } from "../core/MemoryEcosystem.js";
import type { MemAtom, MemoryCrystal, EcosystemState, EvolutionOperation } from "../core/types.js";

export interface EvolutionConfig {
  /** 最小压缩原子数 */
  minCompressAtoms: number;

  /** 压缩触发比例 */
  compressRatio: number;

  /** 遗忘阈值 */
  forgetThreshold: number;

  /** 场合并阈值 */
  fieldMergeThreshold: number;

  /** 关系强化系数 */
  reinforcementBoost: number;
}

const DEFAULT_CONFIG: EvolutionConfig = {
  minCompressAtoms: 10,
  compressRatio: 0.3,
  forgetThreshold: 0.05,
  fieldMergeThreshold: 0.8,
  reinforcementBoost: 0.2,
};

export class EvolutionEngine {
  private ecosystem: MemoryEcosystem;
  private config: EvolutionConfig;
  private operations: EvolutionOperation[] = [];

  constructor(ecosystem: MemoryEcosystem, config: Partial<EvolutionConfig> = {}) {
    this.ecosystem = ecosystem;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 运行一轮完整进化
   */
  async run(): Promise<EcosystemState> {
    console.log("\n🧬 启动记忆进化周期...");
    const startTime = Date.now();

    // 1. 衰减旧记忆
    this.decayMemories();

    // 2. 清理遗忘记忆
    const forgotten = this.pruneForgotten();

    // 3. 合并相似场
    const mergedFields = this.mergeFields();

    // 4. 强化高频连接
    this.reinforceConnections();

    // 5. 压缩成熟记忆为晶体
    const newCrystals = await this.compressMature();

    // 6. 生成新洞察
    const insights = await this.generateInsights();

    const state = this.calculateState();

    console.log(`\n✅ 进化完成 (${Date.now() - startTime}ms)`);
    console.log(`   遗忘: ${forgotten} 原子`);
    console.log(`   场合并: ${mergedFields} 组`);
    console.log(`   新晶体: ${newCrystals} 个`);
    console.log(`   新洞察: ${insights} 个`);
    console.log(`   健康度: ${(state.health.overall * 100).toFixed(1)}%`);

    return state;
  }

  /**
   * 计算生态状态
   */
  calculateState(): EcosystemState {
    const atoms = this.ecosystem.getAtoms();
    const edges = this.ecosystem.getEdges();
    const fields = this.ecosystem.getFields();
    const crystals = this.ecosystem.getCrystals();

    const atomList = Array.from(atoms.values());

    // 统计
    const stats = {
      totalAtoms: atoms.size,
      totalEdges: edges.size,
      totalFields: fields.size,
      totalCrystals: crystals.size,
      avgAtomStrength:
        atomList.length > 0
          ? atomList.reduce((sum, a) => sum + a.strength.current, 0) / atomList.length
          : 0,
      networkDensity: atoms.size > 0 ? (edges.size * 2) / (atoms.size * (atoms.size - 1)) : 0,
    };

    // 健康度计算
    const weakAtoms = atomList.filter((a) => a.strength.current < 0.2).length;
    const fragmentation = weakAtoms / Math.max(atomList.length, 1);

    // 冗余度 - 边数与原子数的比例
    const redundancy = Math.min(1, edges.size / Math.max(atoms.size * 3, 1));

    // 覆盖度 - 场的利用率
    const fieldCoverage =
      fields.size > 0
        ? Array.from(fields.values()).reduce((sum, f) => sum + f.atoms.size, 0) /
          (fields.size * 100)
        : 0;

    // 活力 - 最近访问的原子比例
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const recentAccess = atomList.filter((a) => now - a.temporal.lastAccessed < weekMs).length;
    const vitality = recentAccess / Math.max(atomList.length, 1);

    const health = {
      overall: 0.6 * (1 - fragmentation) + 0.2 * redundancy + 0.2 * vitality,
      fragmentation,
      redundancy,
      coverage: Math.min(1, fieldCoverage),
      vitality,
    };

    // 热点区域
    const hotspots = Array.from(fields.values())
      .map((f) => ({
        fieldId: f.id,
        activity: f.vitality,
        trend: f.vitality > 0.5 ? ("rising" as const) : ("stable" as const),
      }))
      .sort((a, b) => b.activity - a.activity)
      .slice(0, 5);

    // 先组装基础状态，再生成推荐
    const state: EcosystemState = {
      timestamp: Date.now(),
      stats,
      health,
      hotspots,
      recommendedActions: [],
    };

    // 推荐操作
    state.recommendedActions = this.generateRecommendations(state);

    return state;
  }

  /**
   * 压缩指定原子为晶体
   */
  compress(atomIds: string[]): MemoryCrystal | null {
    if (atomIds.length < this.config.minCompressAtoms) return null;

    const atoms = this.ecosystem.getAtoms();
    const atomsToCompress = atomIds
      .map((id) => atoms.get(id))
      .filter((a): a is MemAtom => a !== undefined);

    if (atomsToCompress.length < this.config.minCompressAtoms) return null;

    // 提取共同主题
    const content = this.synthesizeContent(atomsToCompress);

    const crystal: MemoryCrystal = {
      id: `crystal-${Date.now()}`,
      type: this.determineCrystalType(atomsToCompress),
      abstract: content,
      sources: {
        atomIds: atomsToCompress.map((a) => a.id),
        timeRange: [
          Math.min(...atomsToCompress.map((a) => a.temporal.created)),
          Math.max(...atomsToCompress.map((a) => a.temporal.modified)),
        ],
        totalAtoms: atomsToCompress.length,
      },
      compression: {
        ratio: atomsToCompress.length / content.length,
        informationRetained: 0.8,
        method: "abstractive",
      },
      utility: {
        queryCount: 0,
        hitRate: 0,
        avgRelevance: 0,
      },
      expandability: {
        canExpand: true,
        expansionQuery: atomsToCompress[0]?.content.slice(0, 50) || "",
        sampleExpansion: atomsToCompress
          .slice(0, 3)
          .map((a) => a.content)
          .join("; "),
      },
    };

    // 存储晶体
    this.ecosystem["crystals"].set(crystal.id, crystal);

    // 降低被压缩原子的强度
    for (const atom of atomsToCompress) {
      atom.strength.current *= 0.5;
      atom.meta.compressionRatio = crystal.compression.ratio;
    }

    console.log(`💎 新晶体形成: ${crystal.id.slice(0, 16)}... (${atomsToCompress.length} 原子)`);

    return crystal;
  }

  /**
   * 强制进化触发 - 供外部调用
   */
  triggerForcedEvolution(): void {
    setTimeout(() => this.run(), 0);
  }

  // ==========================================================================
  // 私有进化步骤
  // ==========================================================================

  private decayMemories(): void {
    const now = Date.now();
    const atoms = this.ecosystem.getAtoms();

    for (const atom of atoms.values()) {
      const age = now - atom.temporal.lastAccessed;
      const decayFactor = Math.exp((-atom.temporal.decayRate * age) / (24 * 60 * 60 * 1000));

      // 基础衰减
      let newStrength = atom.strength.base * decayFactor;

      // 强化记忆衰减较慢
      newStrength += atom.strength.reinforcement * 0.1 * decayFactor;

      atom.strength.current = Math.min(1, newStrength);
    }
  }

  private pruneForgotten(): number {
    const atoms = this.ecosystem.getAtoms();
    const toRemove: string[] = [];

    for (const [id, atom] of atoms) {
      if (atom.strength.current < this.config.forgetThreshold) {
        // 检查是否有晶体备份
        const crystals = this.ecosystem.getCrystals();
        const hasBackup = Array.from(crystals.values()).some((c) => c.sources.atomIds.includes(id));

        if (hasBackup) {
          toRemove.push(id);
        }
      }
    }

    for (const id of toRemove) {
      atoms.delete(id);
      // 清理相关边
      this.removeEdgesForAtom(id);
    }

    return toRemove.length;
  }

  private removeEdgesForAtom(atomId: string): void {
    const edges = this.ecosystem.getEdges();
    for (const [id, edge] of edges) {
      if (edge.from === atomId || edge.to === atomId) {
        edges.delete(id);
      }
    }
  }

  private mergeFields(): number {
    const fields = this.ecosystem.getFields();
    const fieldList = Array.from(fields.values());
    let mergeCount = 0;

    for (let i = 0; i < fieldList.length; i++) {
      for (let j = i + 1; j < fieldList.length; j++) {
        const f1 = fieldList[i];
        const f2 = fieldList[j];

        if (!f1 || !f2) continue;

        // 计算场间距离
        const distance = this.ecosystem.getEmbeddingEngine().distance(f1.centroid, f2.centroid);
        const overlap = this.calculateFieldOverlap(f1, f2);

        if (distance < this.config.fieldMergeThreshold || overlap > 0.7) {
          // 合并f2到f1
          this.mergeField(f1, f2);
          fields.delete(f2.id);
          fieldList[j] = null as any;
          mergeCount++;
        }
      }
    }

    return mergeCount;
  }

  private calculateFieldOverlap(
    f1: import("../core/types.js").MemoryField,
    f2: import("../core/types.js").MemoryField,
  ): number {
    const intersection = new Set(Array.from(f1.atoms).filter((id) => f2.atoms.has(id)));
    const union = new Set([...f1.atoms, ...f2.atoms]);
    return intersection.size / union.size;
  }

  private mergeField(
    target: import("../core/types.js").MemoryField,
    source: import("../core/types.js").MemoryField,
  ): void {
    // 合并原子
    for (const atomId of source.atoms) {
      target.atoms.add(atomId);
    }

    // 更新质心
    target.centroid = this.ecosystem
      .getEmbeddingEngine()
      .weightedAverage(target.centroid, source.centroid, 0.3);

    // 扩大半径
    target.radius = Math.max(target.radius, source.radius) * 1.1;

    console.log(`🌌 场合并: ${target.name} ← ${source.name}`);
  }

  private reinforceConnections(): void {
    const edges = this.ecosystem.getEdges();
    const atoms = this.ecosystem.getAtoms();

    for (const edge of edges.values()) {
      const fromAtom = atoms.get(edge.from);
      const toAtom = atoms.get(edge.to);

      if (!fromAtom || !toAtom) continue;

      // 如果两个原子都被频繁访问，强化连接
      const fromFreq = fromAtom.temporal.accessCount;
      const toFreq = toAtom.temporal.accessCount;

      if (fromFreq > 5 && toFreq > 5) {
        edge.dynamicWeight.current = Math.min(
          1,
          edge.dynamicWeight.current + this.config.reinforcementBoost,
        );
        edge.dynamicWeight.history.push({
          timestamp: Date.now(),
          weight: edge.dynamicWeight.current,
          trigger: "co-activation",
        });
      }
    }
  }

  private async compressMature(): Promise<number> {
    const atoms = this.ecosystem.getAtoms();
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    // 找到成熟但活跃的记忆
    const matureGroups: Map<string, string[]> = new Map();

    for (const [id, atom] of atoms) {
      if (
        atom.temporal.accessCount > 10 &&
        now - atom.temporal.created > monthMs &&
        atom.strength.current > 0.3
      ) {
        // 按场分组
        const fields = this.ecosystem.getFields();
        for (const field of fields.values()) {
          if (field.atoms.has(id)) {
            const group = matureGroups.get(field.id) || [];
            group.push(id);
            matureGroups.set(field.id, group);
            break;
          }
        }
      }
    }

    let crystalCount = 0;
    for (const group of matureGroups.values()) {
      if (group.length >= this.config.minCompressAtoms) {
        const crystal = this.compress(group);
        if (crystal) crystalCount++;
      }
    }

    return crystalCount;
  }

  private async generateInsights(): Promise<number> {
    // 找到经常被一起访问但不直接连接的原子对
    const atoms = this.ecosystem.getAtoms();
    const edges = this.ecosystem.getEdges();
    const insightCount = 0;

    // 简化的洞察生成：基于时间接近性
    const recentAtoms = Array.from(atoms.values())
      .filter((a) => Date.now() - a.temporal.created < 7 * 24 * 60 * 60 * 1000)
      .slice(0, 100);

    for (const atom of recentAtoms) {
      // 如果新原子没有连接，尝试建立连接
      const hasEdge = Array.from(edges.values()).some(
        (e) => e.from === atom.id || e.to === atom.id,
      );

      if (!hasEdge) {
        // 找到最相似的原子建立连接
        const similar = await this.ecosystem.getQueryEngine().findSimilar(atom.embedding, 1);
        if (similar.length > 0 && similar[0].similarity > 0.8) {
          // 创建新边
          const edgeId = `${similar[0].atom.id}-${atom.id}`;
          edges.set(edgeId, {
            id: edgeId,
            from: similar[0].atom.id,
            to: atom.id,
            types: [
              {
                type: "associative",
                weight: similar[0].similarity,
                confidence: similar[0].similarity,
                learned: true,
              },
            ],
            dynamicWeight: {
              current: similar[0].similarity,
              history: [
                {
                  timestamp: Date.now(),
                  weight: similar[0].similarity,
                  trigger: "insight",
                },
              ],
              trend: "stable",
            },
            activation: {
              lastSpread: 0,
              spreadCount: 0,
              decayFactor: 0.9,
            },
          });
        }
      }
    }

    return insightCount;
  }

  private synthesizeContent(atoms: MemAtom[]): string {
    // 简化的内容合成
    // 实际应使用LLM进行摘要

    const topics = new Set<string>();
    for (const atom of atoms) {
      for (const tag of atom.meta.tags) {
        topics.add(tag);
      }
    }

    const summary = atoms
      .sort((a, b) => b.strength.current - a.strength.current)
      .slice(0, 5)
      .map((a) => a.content.slice(0, 100))
      .join("; ");

    return `[主题: ${Array.from(topics).slice(0, 5).join(", ")}] ${summary}`;
  }

  private determineCrystalType(atoms: MemAtom[]): MemoryCrystal["type"] {
    const types = atoms.map((a) => a.contentType);

    if (types.every((t) => t === "fact")) return "schema";
    if (types.every((t) => t === "experience")) return "narrative";
    if (types.some((t) => t === "pattern")) return "pattern";

    return "intuition";
  }

  private generateRecommendations(state: EcosystemState): EcosystemState["recommendedActions"] {
    const actions: EcosystemState["recommendedActions"] = [];

    if (state.health.fragmentation > 0.3) {
      actions.push({
        action: "merge",
        target: "fields",
        reason: "碎片化过高，需要合并场",
        priority: 0.8,
      });
    }

    if (state.stats.totalAtoms > 10000) {
      actions.push({
        action: "compress",
        target: "old_memories",
        reason: "原子数过多，需要压缩",
        priority: 0.7,
      });
    }

    if (state.health.vitality < 0.3) {
      actions.push({
        action: "prune",
        target: "inactive",
        reason: "活力过低，需要修剪",
        priority: 0.6,
      });
    }

    return actions.sort((a, b) => b.priority - a.priority);
  }
}
