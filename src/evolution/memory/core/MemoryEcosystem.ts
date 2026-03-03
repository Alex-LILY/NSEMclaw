/**
 * 记忆生态系统 - 核心协调器
 *
 * 职责:
 * 1. 管理所有记忆原子的生命周期
 * 2. 协调进化引擎运行
 * 3. 处理查询和激活
 * 4. 维护与现有md/qmd文件的同步
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MarkdownBridge } from "../bridge/MarkdownBridge.js";
import { EvolutionEngine } from "../evolution/EvolutionEngine.js";
import { QueryEngine } from "../query/QueryEngine.js";
import { EmbeddingEngine } from "./embedding.js";
import type {
  MemAtom,
  LivingEdge,
  MemoryField,
  MemoryCrystal,
  MemoryQuery,
  ActivatedMemory,
  EcosystemState,
  MarkdownImportOptions,
  MarkdownExportOptions,
} from "./types.js";

export interface EcosystemConfig {
  /** 存储根目录 */
  rootDir: string;

  /** 自动保存间隔 (ms) */
  autoSaveInterval: number;

  /** 进化触发阈值 */
  evolutionThreshold: {
    minAtoms: number;
    healthThreshold: number;
    timeInterval: number;
  };

  /** 与md/qmd的同步策略 */
  syncStrategy: "ingest-only" | "bidirectional" | "evolution-only";

  /** 最大原子数 */
  maxAtoms: number;

  /** 压缩触发 */
  compressionTrigger: {
    atomCount: number;
    ageDays: number;
    strengthThreshold: number;
  };
}

const DEFAULT_CONFIG: EcosystemConfig = {
  rootDir: join(homedir(), ".nsemclaw", "evolution-memory"),
  autoSaveInterval: 5 * 60 * 1000, // 5分钟
  evolutionThreshold: {
    minAtoms: 100,
    healthThreshold: 0.7,
    timeInterval: 24 * 60 * 60 * 1000, // 1天
  },
  syncStrategy: "ingest-only",
  maxAtoms: 100000,
  compressionTrigger: {
    atomCount: 1000,
    ageDays: 7,
    strengthThreshold: 0.3,
  },
};

export class MemoryEcosystem {
  private config: EcosystemConfig;
  private atoms: Map<string, MemAtom> = new Map();
  private edges: Map<string, LivingEdge> = new Map();
  private fields: Map<string, MemoryField> = new Map();
  private crystals: Map<string, MemoryCrystal> = new Map();

  private embedding: EmbeddingEngine;
  private evolution: EvolutionEngine;
  private queryEngine: QueryEngine;
  private bridge: MarkdownBridge;

  private lastEvolution: number = 0;
  private saveTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: Partial<EcosystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 确保目录存在
    this.ensureDirectories();

    // 初始化引擎
    this.embedding = new EmbeddingEngine();
    this.evolution = new EvolutionEngine(this);
    this.queryEngine = new QueryEngine(this);
    this.bridge = new MarkdownBridge(this);

    // 加载已有数据
    this.load();
  }

  // ==========================================================================
  // 生命周期管理
  // ==========================================================================

  /**
   * 启动生态系统
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("🧠 记忆生态系统启动");
    console.log(`   原子数: ${this.atoms.size}`);
    console.log(`   关系数: ${this.edges.size}`);
    console.log(`   场数: ${this.fields.size}`);
    console.log(`   晶体数: ${this.crystals.size}`);

    // 自动保存
    this.saveTimer = setInterval(() => {
      this.save();
    }, this.config.autoSaveInterval);

    // 检查是否需要进化
    this.checkEvolution();

    // 如果配置了同步，启动监视
    if (this.config.syncStrategy !== "evolution-only") {
      this.bridge.startWatching();
    }
  }

  /**
   * 停止生态系统
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.bridge.stopWatching();
    this.save();

    console.log("🧠 记忆生态系统已停止");
  }

  // ==========================================================================
  // 记忆操作
  // ==========================================================================

  /**
   * 摄入新记忆
   */
  async ingest(
    content: string,
    options: {
      type?: MemAtom["contentType"];
      source?: string;
      agent?: string;
      workspace?: string;
      tags?: string[];
      strength?: number;
    } = {},
  ): Promise<MemAtom> {
    const id = this.generateId(content);

    // 检查是否已存在
    if (this.atoms.has(id)) {
      // 强化已有记忆
      return this.reinforce(id);
    }

    // 生成嵌入
    const embedding = await this.embedding.embed(content);

    const now = Date.now();
    const atom: MemAtom = {
      id,
      contentHash: this.hash(content),
      content,
      contentType: options.type || "fact",
      embedding,
      temporal: {
        created: now,
        modified: now,
        lastAccessed: now,
        accessCount: 1,
        decayRate: this.calculateDecayRate(options.type || "fact"),
      },
      spatial: {
        sourceFile: options.source,
        workspace: options.workspace,
        agent: options.agent,
      },
      strength: {
        current: options.strength || 0.5,
        base: options.strength || 0.5,
        reinforcement: 0,
        emotional: 0,
      },
      generation: 1,
      meta: {
        tags: options.tags || [],
        confidence: 1.0,
        source: options.agent ? "ai" : "user",
      },
    };

    this.atoms.set(id, atom);

    // 立即建立关系
    await this.establishRelations(atom);

    // 更新场
    this.updateFields(atom);

    console.log(`✨ 新记忆原子诞生: ${id.slice(0, 8)}... (${atom.contentType})`);

    return atom;
  }

  /**
   * 强化已有记忆
   */
  reinforce(atomId: string): MemAtom {
    const atom = this.atoms.get(atomId);
    if (!atom) throw new Error(`原子不存在: ${atomId}`);

    atom.strength.reinforcement++;
    atom.strength.current = Math.min(1, atom.strength.base + atom.strength.reinforcement * 0.1);
    atom.temporal.lastAccessed = Date.now();
    atom.temporal.accessCount++;

    return atom;
  }

  /**
   * 查询记忆 - 激活记忆场
   */
  async query(query: MemoryQuery): Promise<ActivatedMemory> {
    return this.queryEngine.activate(query);
  }

  /**
   * 遗忘记忆（软删除，进入潜意识）
   */
  forget(atomId: string, compress: boolean = true): void {
    const atom = this.atoms.get(atomId);
    if (!atom) return;

    if (compress && atom.strength.current > 0.3) {
      // 压缩为晶体
      this.evolution.compress([atomId]);
    }

    // 降低强度
    atom.strength.current *= 0.1;
    atom.temporal.decayRate *= 2;

    console.log(`🌙 记忆进入潜意识: ${atomId.slice(0, 8)}...`);
  }

  // ==========================================================================
  // 与现有md/qmd的桥接
  // ==========================================================================

  /**
   * 从md/qmd文件导入
   */
  async importFromMarkdown(options: MarkdownImportOptions): Promise<MemAtom[]> {
    return this.bridge.import(options);
  }

  /**
   * 导出到md/qmd文件
   */
  async exportToMarkdown(options: MarkdownExportOptions): Promise<string[]> {
    return this.bridge.export(options);
  }

  /**
   * 同步所有md/qmd文件
   */
  async syncAllMarkdown(): Promise<{
    imported: number;
    updated: number;
    unchanged: number;
  }> {
    const memoryDir = join(homedir(), ".nsemclaw", "memory");
    return this.bridge.syncDirectory(memoryDir);
  }

  // ==========================================================================
  // 进化管理
  // ==========================================================================

  /**
   * 手动触发进化
   */
  async evolve(): Promise<EcosystemState> {
    console.log("🧬 启动记忆进化...");

    const state = await this.evolution.run();
    this.lastEvolution = Date.now();

    return state;
  }

  /**
   * 获取当前生态状态
   */
  getState(): EcosystemState {
    return this.evolution.calculateState();
  }

  /**
   * 检查是否需要进化
   */
  private checkEvolution(): void {
    const state = this.getState();
    const { minAtoms, healthThreshold, timeInterval } = this.config.evolutionThreshold;

    const shouldEvolve =
      this.atoms.size >= minAtoms &&
      (state.health.overall < healthThreshold || Date.now() - this.lastEvolution > timeInterval);

    if (shouldEvolve) {
      setTimeout(() => this.evolve(), 1000);
    }
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  private ensureDirectories(): void {
    const dirs = [
      this.config.rootDir,
      join(this.config.rootDir, "atoms"),
      join(this.config.rootDir, "edges"),
      join(this.config.rootDir, "fields"),
      join(this.config.rootDir, "crystals"),
      join(this.config.rootDir, "meta"),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private generateId(content: string): string {
    return `atom-${this.hash(content).slice(0, 16)}`;
  }

  private hash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private calculateDecayRate(type: MemAtom["contentType"]): number {
    const rates: Record<MemAtom["contentType"], number> = {
      fact: 0.001,
      experience: 0.005,
      insight: 0.002,
      pattern: 0.0005,
      narrative: 0.003,
      intuition: 0.0001,
    };
    return rates[type] || 0.001;
  }

  private async establishRelations(newAtom: MemAtom): Promise<void> {
    // 找到相似的原子
    const similar = await this.queryEngine.findSimilar(newAtom.embedding, 10);

    for (const { atom, similarity } of similar) {
      if (atom.id === newAtom.id) continue;

      const edgeId = `${atom.id}-${newAtom.id}`;
      const edge: LivingEdge = {
        id: edgeId,
        from: atom.id,
        to: newAtom.id,
        types: [
          {
            type: "similar",
            weight: similarity,
            confidence: similarity,
            learned: true,
          },
        ],
        dynamicWeight: {
          current: similarity,
          history: [{ timestamp: Date.now(), weight: similarity, trigger: "birth" }],
          trend: "stable",
        },
        activation: {
          lastSpread: 0,
          spreadCount: 0,
          decayFactor: 0.9,
        },
      };

      this.edges.set(edgeId, edge);
    }
  }

  private updateFields(atom: MemAtom): void {
    // 找到或创建合适的场
    let bestField: MemoryField | null = null;
    let bestScore = -1;

    for (const field of this.fields.values()) {
      const dist = this.embedding.distance(atom.embedding, field.centroid);
      const score = 1 - dist / field.radius;

      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestField = field;
      }
    }

    if (bestField) {
      bestField.atoms.add(atom.id);
      // 更新质心
      bestField.centroid = this.embedding.weightedAverage(bestField.centroid, atom.embedding, 0.1);
    } else {
      // 创建新场
      this.createField(atom);
    }
  }

  private createField(seedAtom: MemAtom): MemoryField {
    const id = `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const field: MemoryField = {
      id,
      name: this.generateFieldName(seedAtom),
      description: seedAtom.content.slice(0, 100),
      centroid: seedAtom.embedding,
      radius: 0.5,
      atoms: new Set([seedAtom.id]),
      vitality: 1,
      fieldRelations: [],
      evolution: {
        created: Date.now(),
        snapshots: [],
      },
    };

    this.fields.set(id, field);
    console.log(`🌌 新记忆场诞生: ${field.name}`);

    return field;
  }

  private generateFieldName(atom: MemAtom): string {
    // 基于内容生成场名
    const words = atom.content
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    return words.join("-") || "unnamed-field";
  }

  // ==========================================================================
  // 持久化
  // ==========================================================================

  private save(): void {
    const data = {
      atoms: Array.from(this.atoms.values()),
      edges: Array.from(this.edges.values()),
      fields: Array.from(this.fields.values()),
      crystals: Array.from(this.crystals.values()),
      timestamp: Date.now(),
    };

    writeFileSync(
      join(this.config.rootDir, "meta", "snapshot.json"),
      JSON.stringify(data, null, 2),
    );
  }

  private load(): void {
    const snapshotPath = join(this.config.rootDir, "meta", "snapshot.json");
    if (!existsSync(snapshotPath)) return;

    try {
      const data = JSON.parse(readFileSync(snapshotPath, "utf-8"));

      for (const atom of data.atoms || []) {
        this.atoms.set(atom.id, atom);
      }
      for (const edge of data.edges || []) {
        this.edges.set(edge.id, edge);
      }
      for (const field of data.fields || []) {
        // 恢复Set
        field.atoms = new Set(field.atoms);
        this.fields.set(field.id, field);
      }
      for (const crystal of data.crystals || []) {
        this.crystals.set(crystal.id, crystal);
      }
    } catch (e) {
      console.error("加载记忆快照失败:", e);
    }
  }

  // ==========================================================================
  // 访问器
  // ==========================================================================

  getAtoms(): Map<string, MemAtom> {
    return this.atoms;
  }
  getEdges(): Map<string, LivingEdge> {
    return this.edges;
  }
  getFields(): Map<string, MemoryField> {
    return this.fields;
  }
  getCrystals(): Map<string, MemoryCrystal> {
    return this.crystals;
  }
  getConfig(): EcosystemConfig {
    return this.config;
  }
  getEmbeddingEngine(): EmbeddingEngine {
    return this.embedding;
  }
  getQueryEngine(): QueryEngine {
    return this.queryEngine;
  }
}

// 单例导出
let globalEcosystem: MemoryEcosystem | null = null;

export function getMemoryEcosystem(config?: Partial<EcosystemConfig>): MemoryEcosystem {
  if (!globalEcosystem) {
    globalEcosystem = new MemoryEcosystem(config);
  }
  return globalEcosystem;
}

export function resetMemoryEcosystem(): void {
  globalEcosystem = null;
}
