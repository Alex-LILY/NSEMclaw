/**
 * 知识迁移系统 - P2 实现
 *
 * 实现不同记忆系统之间的知识迁移
 * 支持: 同构迁移、异构迁移、增量迁移、全量迁移
 */

import type { MemAtom, LivingEdge, MemoryField } from "../types/index.js";
import { cosineSimilarity, generateId } from "../utils/common.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 知识包 - 可迁移的记忆单元集合 */
export interface KnowledgePackage {
  /** 唯一标识 */
  id: string;
  /** 元数据 */
  metadata: {
    name: string;
    description: string;
    sourceAgent: string;
    sourceVersion: string;
    createdAt: number;
    exportedAt: number;
    atomCount: number;
    edgeCount: number;
    fieldCount: number;
  };
  /** 记忆原子 */
  atoms: MemAtom[];
  /** 关系边 */
  edges: LivingEdge[];
  /** 记忆场 */
  fields: MemoryField[];
  /** 领域标签 */
  domainTags: string[];
  /** 知识图谱摘要 (用于快速匹配) */
  summary: {
    /** 主题嵌入 */
    topicEmbedding: number[];
    /** 关键词 */
    keywords: string[];
    /** 时间范围 */
    timeRange: { start: number; end: number };
  };
}

/** 迁移配置 */
export interface TransferConfig {
  /** 迁移策略 */
  strategy: "merge" | "replace" | "append" | "selective";
  /** 相似度阈值 (用于选择性迁移) */
  similarityThreshold: number;
  /** 是否包含边 */
  includeEdges: boolean;
  /** 是否包含场 */
  includeFields: boolean;
  /** 冲突解决策略 */
  conflictResolution: "keep-existing" | "keep-imported" | "merge" | "keep-both";
  /** 变换函数 (用于异构迁移) */
  transformFn?: (atom: MemAtom) => MemAtom;
  /** 验证函数 */
  validationFn?: (atom: MemAtom) => boolean;
}

/** 迁移结果 */
export interface TransferResult {
  /** 成功导入的记忆数 */
  importedAtoms: number;
  /** 成功导入的边数 */
  importedEdges: number;
  /** 成功导入的场数 */
  importedFields: number;
  /** 跳过的记忆数 (重复或无效) */
  skippedAtoms: number;
  /** 合并的记忆数 */
  mergedAtoms: number;
  /** 冲突数 */
  conflicts: number;
  /** 错误信息 */
  errors: string[];
  /** 导入的ID映射 (旧ID -> 新ID) */
  idMapping: Map<string, string>;
  /** 耗时 (毫秒) */
  durationMs: number;
}

/** 知识迁移记录 */
export interface TransferRecord {
  id: string;
  timestamp: number;
  sourcePackageId: string;
  sourceAgent: string;
  result: TransferResult;
  config: TransferConfig;
}

/** 迁移统计 */
export interface TransferStats {
  totalTransfers: number;
  totalAtomsImported: number;
  totalEdgesImported: number;
  totalFieldsImported: number;
  totalConflicts: number;
  averageDurationMs: number;
  successRate: number;
}

/** 知识源适配器接口 */
export interface KnowledgeSourceAdapter {
  /** 源标识 */
  sourceId: string;
  /** 导出知识 */
  export(): Promise<KnowledgePackage>;
  /** 导入知识 */
  import(pkg: KnowledgePackage, config: TransferConfig): Promise<TransferResult>;
  /** 获取可用知识包 */
  listAvailable(): Promise<Pick<KnowledgePackage, "id" | "metadata" | "summary">[]>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_TRANSFER_CONFIG: TransferConfig = {
  strategy: "selective",
  similarityThreshold: 0.7,
  includeEdges: true,
  includeFields: true,
  conflictResolution: "merge",
};

// ============================================================================
// 知识迁移系统
// ============================================================================

export class KnowledgeTransferSystem {
  private adapters = new Map<string, KnowledgeSourceAdapter>();
  private transferHistory: TransferRecord[] = [];
  private maxHistorySize = 100;

  /** 迁移事件回调 */
  onTransferStart?: (packageId: string, targetId: string) => void;
  onTransferComplete?: (record: TransferRecord) => void;
  onTransferError?: (packageId: string, error: Error) => void;

  // ========================================================================
  // 适配器管理
  // ========================================================================

  /**
   * 注册知识源适配器
   */
  registerAdapter(adapter: KnowledgeSourceAdapter): void {
    this.adapters.set(adapter.sourceId, adapter);
    console.log(`📚 知识源适配器已注册: ${adapter.sourceId}`);
  }

  /**
   * 取消注册适配器
   */
  unregisterAdapter(sourceId: string): void {
    this.adapters.delete(sourceId);
  }

  /**
   * 获取适配器
   */
  getAdapter(sourceId: string): KnowledgeSourceAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  /**
   * 列出所有适配器
   */
  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  // ========================================================================
  // 知识导出
  // ========================================================================

  /**
   * 从源导出知识包
   */
  async exportFromSource(sourceId: string): Promise<KnowledgePackage> {
    const adapter = this.adapters.get(sourceId);
    if (!adapter) {
      throw new Error(`未知知识源: ${sourceId}`);
    }

    return adapter.export();
  }

  /**
   * 创建知识包 (从原始数据)
   */
  createKnowledgePackage(
    name: string,
    data: {
      atoms: MemAtom[];
      edges?: LivingEdge[];
      fields?: MemoryField[];
      sourceAgent: string;
      sourceVersion: string;
      domainTags?: string[];
    },
  ): KnowledgePackage {
    const { atoms, edges = [], fields = [], sourceAgent, sourceVersion, domainTags = [] } = data;

    // 计算主题嵌入 (所有原子嵌入的平均)
    const topicEmbedding = this.computeTopicEmbedding(atoms);

    // 提取关键词
    const keywords = this.extractKeywords(atoms);

    // 计算时间范围
    const timestamps = atoms.flatMap((a) => [
      a.temporal.created,
      a.temporal.modified,
      a.temporal.lastAccessed,
    ]);
    const timeRange = {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps),
    };

    return {
      id: generateId("pkg", name + Date.now()),
      metadata: {
        name,
        description: `知识包: ${name} (${atoms.length} 记忆)`,
        sourceAgent,
        sourceVersion,
        createdAt: Date.now(),
        exportedAt: Date.now(),
        atomCount: atoms.length,
        edgeCount: edges.length,
        fieldCount: fields.length,
      },
      atoms: [...atoms],
      edges: [...edges],
      fields: [...fields],
      domainTags,
      summary: {
        topicEmbedding,
        keywords,
        timeRange,
      },
    };
  }

  // ========================================================================
  // 知识导入
  // ========================================================================

  /**
   * 迁移知识到目标源
   */
  async transfer(
    sourceId: string,
    targetId: string,
    config: Partial<TransferConfig> = {},
  ): Promise<TransferResult> {
    const fullConfig = { ...DEFAULT_TRANSFER_CONFIG, ...config };

    const sourceAdapter = this.adapters.get(sourceId);
    const targetAdapter = this.adapters.get(targetId);

    if (!sourceAdapter) {
      throw new Error(`源适配器未找到: ${sourceId}`);
    }
    if (!targetAdapter) {
      throw new Error(`目标适配器未找到: ${targetId}`);
    }

    if (sourceId === targetId) {
      throw new Error("源和目标不能相同");
    }

    this.onTransferStart?.(sourceId, targetId);

    const startTime = Date.now();

    try {
      // 1. 导出知识
      const pkg = await sourceAdapter.export();

      // 2. 导入到目标
      const result = await targetAdapter.import(pkg, fullConfig);

      // 3. 记录迁移
      const record: TransferRecord = {
        id: generateId("transfer", sourceId + targetId + Date.now()),
        timestamp: Date.now(),
        sourcePackageId: pkg.id,
        sourceAgent: pkg.metadata.sourceAgent,
        result: {
          ...result,
          durationMs: Date.now() - startTime,
        },
        config: fullConfig,
      };

      this.addTransferRecord(record);
      this.onTransferComplete?.(record);

      console.log(`✅ 知识迁移完成: ${sourceId} → ${targetId}`);
      console.log(`   导入记忆: ${result.importedAtoms}`);
      console.log(`   导入边: ${result.importedEdges}`);
      console.log(`   导入场: ${result.importedFields}`);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onTransferError?.(sourceId, err);
      throw err;
    }
  }

  /**
   * 直接导入知识包
   */
  async importPackage(
    targetId: string,
    pkg: KnowledgePackage,
    config: Partial<TransferConfig> = {},
  ): Promise<TransferResult> {
    const adapter = this.adapters.get(targetId);
    if (!adapter) {
      throw new Error(`目标适配器未找到: ${targetId}`);
    }

    return adapter.import(pkg, { ...DEFAULT_TRANSFER_CONFIG, ...config });
  }

  // ========================================================================
  // 知识匹配与选择
  // ========================================================================

  /**
   * 计算知识包与查询的相似度
   */
  calculatePackageSimilarity(pkg: KnowledgePackage, queryEmbedding: number[]): number {
    return cosineSimilarity(pkg.summary.topicEmbedding, queryEmbedding);
  }

  /**
   * 查找最相关的知识包
   */
  async findRelevantPackages(
    queryEmbedding: number[],
    threshold = 0.5,
  ): Promise<
    Array<{
      package: Pick<KnowledgePackage, "id" | "metadata" | "summary">;
      similarity: number;
      sourceId: string;
    }>
  > {
    const results: Array<{
      package: Pick<KnowledgePackage, "id" | "metadata" | "summary">;
      similarity: number;
      sourceId: string;
    }> = [];

    for (const [sourceId, adapter] of this.adapters) {
      const packages = await adapter.listAvailable();

      for (const pkg of packages) {
        const similarity = cosineSimilarity(pkg.summary.topicEmbedding, queryEmbedding);

        if (similarity >= threshold) {
          results.push({ package: pkg, similarity, sourceId });
        }
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * 选择性迁移 - 只迁移与查询相关的知识
   */
  async selectiveTransfer(
    sourceId: string,
    targetId: string,
    queryEmbedding: number[],
    topK = 10,
    config: Partial<TransferConfig> = {},
  ): Promise<TransferResult> {
    const adapter = this.adapters.get(sourceId);
    if (!adapter) {
      throw new Error(`源适配器未找到: ${sourceId}`);
    }

    // 导出完整知识
    const fullPkg = await adapter.export();

    // 选择最相关的原子
    const selectedAtoms = fullPkg.atoms
      .map((atom) => ({
        atom,
        similarity: cosineSimilarity(atom.embedding, queryEmbedding),
      }))
      .filter((item) => item.similarity >= (config.similarityThreshold ?? 0.5))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((item) => item.atom);

    // 选择相关的边
    const selectedAtomIds = new Set(selectedAtoms.map((a) => a.id));
    const selectedEdges = fullPkg.edges.filter(
      (e) => selectedAtomIds.has(e.from) && selectedAtomIds.has(e.to),
    );

    // 创建子知识包
    const subPkg: KnowledgePackage = {
      ...fullPkg,
      id: generateId("subpkg", fullPkg.id),
      atoms: selectedAtoms,
      edges: selectedEdges,
      metadata: {
        ...fullPkg.metadata,
        name: `${fullPkg.metadata.name} (选择性)`,
        description: `从 ${fullPkg.metadata.name} 选择 ${selectedAtoms.length} 个相关记忆`,
        atomCount: selectedAtoms.length,
        edgeCount: selectedEdges.length,
      },
    };

    return this.importPackage(targetId, subPkg, config);
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 计算主题嵌入
   */
  private computeTopicEmbedding(atoms: MemAtom[]): number[] {
    if (atoms.length === 0) return [];

    const dim = atoms[0]?.embedding.length ?? 0;
    const centroid = new Array(dim).fill(0);

    for (const atom of atoms) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += atom.embedding[i] ?? 0;
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= atoms.length;
    }

    return centroid;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(atoms: MemAtom[]): string[] {
    const wordFreq = new Map<string, number>();

    for (const atom of atoms) {
      const words = atom.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);

      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
      }
    }

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 添加迁移记录
   */
  private addTransferRecord(record: TransferRecord): void {
    this.transferHistory.push(record);

    if (this.transferHistory.length > this.maxHistorySize) {
      this.transferHistory.shift();
    }
  }

  // ========================================================================
  // 统计与历史
  // ========================================================================

  /**
   * 获取迁移历史
   */
  getTransferHistory(): TransferRecord[] {
    return [...this.transferHistory];
  }

  /**
   * 获取迁移统计
   */
  getStats(): TransferStats {
    if (this.transferHistory.length === 0) {
      return {
        totalTransfers: 0,
        totalAtomsImported: 0,
        totalEdgesImported: 0,
        totalFieldsImported: 0,
        totalConflicts: 0,
        averageDurationMs: 0,
        successRate: 0,
      };
    }

    const total = this.transferHistory.length;
    const successful = this.transferHistory.filter((r) => r.result.errors.length === 0).length;

    return {
      totalTransfers: total,
      totalAtomsImported: this.transferHistory.reduce((sum, r) => sum + r.result.importedAtoms, 0),
      totalEdgesImported: this.transferHistory.reduce((sum, r) => sum + r.result.importedEdges, 0),
      totalFieldsImported: this.transferHistory.reduce(
        (sum, r) => sum + r.result.importedFields,
        0,
      ),
      totalConflicts: this.transferHistory.reduce((sum, r) => sum + r.result.conflicts, 0),
      averageDurationMs:
        this.transferHistory.reduce((sum, r) => sum + r.result.durationMs, 0) / total,
      successRate: successful / total,
    };
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.transferHistory = [];
  }
}

// ============================================================================
// 内存知识源适配器 (用于 NSEMFusionCore)
// ============================================================================

import type { NSEMFusionCore } from "../NSEMFusionCore.js";

export class IntegratedNSEM2Adapter implements KnowledgeSourceAdapter {
  sourceId: string;
  private core: NSEMFusionCore;

  constructor(core: NSEMFusionCore) {
    this.core = core;
    this.sourceId = `nsem2-${core.getConfig().agentId}`;
  }

  async export(): Promise<KnowledgePackage> {
    const atoms = Array.from(this.core.getAtoms().values());
    const edges = Array.from(this.core.getEdges().values());
    const fields = Array.from(this.core.getFields().values());

    const pkg: KnowledgePackage = {
      id: generateId("pkg", this.sourceId + Date.now()),
      metadata: {
        name: `NSEM2 Export - ${this.sourceId}`,
        description: `从 ${this.sourceId} 导出的记忆数据`,
        sourceAgent: this.core.getConfig().agentId,
        sourceVersion: "2.0",
        createdAt: Date.now(),
        exportedAt: Date.now(),
        atomCount: atoms.length,
        edgeCount: edges.length,
        fieldCount: fields.length,
      },
      atoms,
      edges,
      fields,
      domainTags: [],
      summary: {
        topicEmbedding: this.computeCentroid(atoms.map((a) => a.embedding)),
        keywords: [],
        timeRange: {
          start: Math.min(...atoms.map((a) => a.temporal.created)),
          end: Math.max(...atoms.map((a) => a.temporal.lastAccessed)),
        },
      },
    };

    return pkg;
  }

  async import(pkg: KnowledgePackage, config: TransferConfig): Promise<TransferResult> {
    const startTime = Date.now();
    const idMapping = new Map<string, string>();
    const errors: string[] = [];

    let importedAtoms = 0;
    let importedEdges = 0;
    let importedFields = 0;
    let skippedAtoms = 0;
    let mergedAtoms = 0;
    let conflicts = 0;

    // 这里简化实现，实际应该调用 NSEMFusionCore 的方法
    // 由于 ingest 是异步方法，我们需要批量导入

    for (const atom of pkg.atoms) {
      try {
        // 检查冲突
        const existing = this.core.getAtoms().get(atom.id);

        if (existing) {
          switch (config.conflictResolution) {
            case "keep-existing":
              skippedAtoms++;
              continue;
            case "keep-imported":
              // 覆盖
              idMapping.set(atom.id, atom.id);
              importedAtoms++;
              break;
            case "merge":
              mergedAtoms++;
              idMapping.set(atom.id, atom.id);
              break;
            case "keep-both":
              // 生成新ID
              const newId = generateId("atom", atom.content + Date.now());
              idMapping.set(atom.id, newId);
              importedAtoms++;
              break;
          }
        } else {
          idMapping.set(atom.id, atom.id);
          importedAtoms++;
        }
      } catch (error) {
        errors.push(`导入原子 ${atom.id} 失败: ${error}`);
        conflicts++;
      }
    }

    return {
      importedAtoms,
      importedEdges,
      importedFields,
      skippedAtoms,
      mergedAtoms,
      conflicts,
      errors,
      idMapping,
      durationMs: Date.now() - startTime,
    };
  }

  async listAvailable(): Promise<Pick<KnowledgePackage, "id" | "metadata" | "summary">[]> {
    // 返回当前核心作为一个可用的知识包
    const atoms = Array.from(this.core.getAtoms().values());

    return [
      {
        id: this.sourceId,
        metadata: {
          name: `NSEM2 - ${this.sourceId}`,
          description: `${atoms.length} 个记忆原子`,
          sourceAgent: this.core.getConfig().agentId,
          sourceVersion: "2.0",
          createdAt: Date.now(),
          exportedAt: Date.now(),
          atomCount: atoms.length,
          edgeCount: this.core.getEdges().size,
          fieldCount: this.core.getFields().size,
        },
        summary: {
          topicEmbedding: this.computeCentroid(atoms.map((a) => a.embedding)),
          keywords: [],
          timeRange: {
            start:
              atoms.length > 0 ? Math.min(...atoms.map((a) => a.temporal.created)) : Date.now(),
            end:
              atoms.length > 0
                ? Math.max(...atoms.map((a) => a.temporal.lastAccessed))
                : Date.now(),
          },
        },
      },
    ];
  }

  private computeCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];

    const dim = embeddings[0]?.length ?? 0;
    const centroid = new Array(dim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += emb[i] ?? 0;
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createKnowledgeTransferSystem(): KnowledgeTransferSystem {
  return new KnowledgeTransferSystem();
}

export function createIntegratedNSEM2Adapter(core: NSEMFusionCore): IntegratedNSEM2Adapter {
  return new IntegratedNSEM2Adapter(core);
}

export { DEFAULT_TRANSFER_CONFIG };
