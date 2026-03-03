/**
 * Markdown桥接 - 连接进化记忆与现有文件
 *
 * 功能:
 * 1. 从md/qmd文件摄取记忆
 * 2. 将进化后的记忆导出为md/qmd
 * 3. 监视文件变化
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  watch,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import type { MemoryEcosystem } from "../core/MemoryEcosystem.js";
import type { MemAtom, MarkdownImportOptions, MarkdownExportOptions } from "../core/types.js";

interface WatchHandle {
  path: string;
  watcher: ReturnType<typeof watch>;
}

export class MarkdownBridge {
  private ecosystem: MemoryEcosystem;
  private watches: Map<string, WatchHandle> = new Map();
  private importCache: Map<string, { mtime: number; atoms: string[] }> = new Map();

  constructor(ecosystem: MemoryEcosystem) {
    this.ecosystem = ecosystem;
  }

  // ==========================================================================
  // 导入
  // ==========================================================================

  /**
   * 从md/qmd文件导入记忆
   */
  async import(options: MarkdownImportOptions): Promise<MemAtom[]> {
    const content = readFileSync(options.filePath, "utf-8");
    const stats = statSync(options.filePath);

    // 检查缓存
    const cached = this.importCache.get(options.filePath);
    if (cached && cached.mtime >= stats.mtime.getTime()) {
      const atoms: MemAtom[] = [];
      for (const id of cached.atoms) {
        const atom = this.ecosystem.getAtoms().get(id);
        if (atom) atoms.push(atom);
      }
      return atoms;
    }

    // 解析策略
    let parsed: Array<{ content: string; type: MemAtom["contentType"]; tags: string[] }>;

    switch (options.parseStrategy) {
      case "atomic":
        parsed = this.parseAtomic(content);
        break;
      case "section":
        parsed = this.parseSection(content);
        break;
      case "semantic":
        parsed = await this.parseSemantic(content);
        break;
      default:
        parsed = this.parseSection(content);
    }

    // 创建记忆原子
    const atoms: MemAtom[] = [];
    const atomIds: string[] = [];

    for (const item of parsed) {
      const atom = await this.ecosystem.ingest(item.content, {
        type: item.type,
        source: options.filePath,
        agent: options.agent,
        workspace: options.workspace,
        tags: item.tags,
      });
      atoms.push(atom);
      atomIds.push(atom.id);
    }

    // 更新缓存
    this.importCache.set(options.filePath, {
      mtime: stats.mtime.getTime(),
      atoms: atomIds,
    });

    console.log(`📥 导入 ${atoms.length} 个记忆原子从 ${basename(options.filePath)}`);

    return atoms;
  }

  /**
   * 同步整个目录
   */
  async syncDirectory(dirPath: string): Promise<{
    imported: number;
    updated: number;
    unchanged: number;
  }>;
  async syncDirectory(
    dirPath: string,
    pattern?: RegExp,
  ): Promise<{
    imported: number;
    updated: number;
    unchanged: number;
  }> {
    const result = { imported: 0, updated: 0, unchanged: 0 };

    if (!existsSync(dirPath)) {
      console.log(`⚠️ 目录不存在: ${dirPath}`);
      return result;
    }

    const files = readdirSync(dirPath)
      .filter((f) => f.endsWith(".md") || f.endsWith(".qmd"))
      .map((f) => join(dirPath, f));

    for (const file of files) {
      const stats = statSync(file);
      const cached = this.importCache.get(file);

      if (!cached) {
        const atoms = await this.import({
          filePath: file,
          parseStrategy: "section",
          watch: false,
        });
        result.imported += atoms.length;
      } else if (cached.mtime < stats.mtime.getTime()) {
        const atoms = await this.import({
          filePath: file,
          parseStrategy: "section",
          watch: false,
        });
        result.updated += atoms.length;
      } else {
        result.unchanged++;
      }
    }

    console.log(
      `📂 同步完成: ${result.imported} 导入, ${result.updated} 更新, ${result.unchanged} 未变`,
    );

    return result;
  }

  // ==========================================================================
  // 导出
  // ==========================================================================

  /**
   * 导出记忆为md/qmd
   */
  async export(options: MarkdownExportOptions): Promise<string[]> {
    const exportedFiles: string[] = [];

    if (!existsSync(options.targetDir)) {
      mkdirSync(options.targetDir, { recursive: true });
    }

    switch (options.strategy) {
      case "crystal":
        exportedFiles.push(...(await this.exportCrystals(options)));
        break;
      case "field":
        exportedFiles.push(...(await this.exportFields(options)));
        break;
      case "narrative":
        exportedFiles.push(...(await this.exportNarrative(options)));
        break;
      case "full":
        exportedFiles.push(...(await this.exportFull(options)));
        break;
    }

    console.log(`📤 导出 ${exportedFiles.length} 个文件到 ${options.targetDir}`);

    return exportedFiles;
  }

  // ==========================================================================
  // 文件监视
  // ==========================================================================

  /**
   * 开始监视文件变化
   */
  startWatching(dirs?: string[]): void {
    const watchDirs = dirs || [this.getDefaultMemoryDir()];

    for (const dir of watchDirs) {
      if (!existsSync(dir)) continue;

      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (!filename.endsWith(".md") && !filename.endsWith(".qmd")) return;

        const filepath = join(dir, filename);

        if (eventType === "change") {
          console.log(`📝 文件变化: ${filename}`);
          this.handleFileChange(filepath);
        }
      });

      this.watches.set(dir, { path: dir, watcher });
      console.log(`👁️ 开始监视: ${dir}`);
    }
  }

  /**
   * 停止监视
   */
  stopWatching(): void {
    for (const { path, watcher } of this.watches.values()) {
      watcher.close();
      console.log(`🛑 停止监视: ${path}`);
    }
    this.watches.clear();
  }

  private async handleFileChange(filepath: string): Promise<void> {
    try {
      // 删除旧的原子
      const cached = this.importCache.get(filepath);
      if (cached) {
        for (const id of cached.atoms) {
          this.ecosystem["atoms"].delete(id);
        }
      }

      // 重新导入
      await this.import({
        filePath: filepath,
        parseStrategy: "section",
        watch: false,
      });
    } catch (e) {
      console.error(`处理文件变化失败: ${filepath}`, e);
    }
  }

  // ==========================================================================
  // 解析策略
  // ==========================================================================

  private parseAtomic(
    content: string,
  ): Array<{ content: string; type: MemAtom["contentType"]; tags: string[] }> {
    // 按段落分割，每个段落作为一个原子
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    return paragraphs.map((p) => ({
      content: p,
      type: "fact" as const,
      tags: this.extractTags(p),
    }));
  }

  private parseSection(
    content: string,
  ): Array<{ content: string; type: MemAtom["contentType"]; tags: string[] }> {
    // 按标题分割
    const sections: Array<{ content: string; type: MemAtom["contentType"]; tags: string[] }> = [];
    const lines = content.split("\n");

    let currentSection: string[] = [];
    let currentTitle = "";
    let currentType: MemAtom["contentType"] = "fact";

    for (const line of lines) {
      // 检测标题
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch) {
        // 保存上一个section
        if (currentSection.length > 0) {
          sections.push({
            content: `# ${currentTitle}\n\n${currentSection.join("\n")}`,
            type: currentType,
            tags: this.extractTags(currentTitle + " " + currentSection.join(" ")),
          });
        }

        currentTitle = headerMatch[2];
        currentSection = [];
        currentType = this.inferTypeFromTitle(currentTitle);
      } else {
        currentSection.push(line);
      }
    }

    // 保存最后一个section
    if (currentSection.length > 0) {
      sections.push({
        content: currentTitle
          ? `# ${currentTitle}\n\n${currentSection.join("\n")}`
          : currentSection.join("\n"),
        type: currentType,
        tags: this.extractTags(currentTitle + " " + currentSection.join(" ")),
      });
    }

    return sections.filter((s) => s.content.length > 50);
  }

  private async parseSemantic(
    content: string,
  ): Promise<Array<{ content: string; type: MemAtom["contentType"]; tags: string[] }>> {
    // 语义解析：尝试识别语义单元
    // 这是一个简化版本，实际可以使用NLP

    const sections = this.parseSection(content);
    const semanticUnits: Array<{ content: string; type: MemAtom["contentType"]; tags: string[] }> =
      [];

    for (const section of sections) {
      // 如果section太长，进一步分割
      if (section.content.length > 1000) {
        const sentences = section.content.match(/[^.!?。！？]+[.!?。！？]+/g) || [section.content];

        let currentUnit = "";
        for (const sentence of sentences) {
          if (currentUnit.length + sentence.length < 500) {
            currentUnit += sentence;
          } else {
            if (currentUnit.length > 50) {
              semanticUnits.push({
                content: currentUnit.trim(),
                type: section.type,
                tags: section.tags,
              });
            }
            currentUnit = sentence;
          }
        }

        if (currentUnit.length > 50) {
          semanticUnits.push({
            content: currentUnit.trim(),
            type: section.type,
            tags: section.tags,
          });
        }
      } else {
        semanticUnits.push(section);
      }
    }

    return semanticUnits;
  }

  private extractTags(text: string): string[] {
    const tags: string[] = [];

    // 提取#标签
    const hashTags = text.match(/#\w+/g);
    if (hashTags) tags.push(...hashTags.map((t) => t.slice(1)));

    // 提取关键词
    const keywords = text.toLowerCase().match(/\b\w{4,}\b/g);

    if (keywords) {
      const freq = new Map<string, number>();
      for (const kw of keywords) {
        freq.set(kw, (freq.get(kw) || 0) + 1);
      }

      // 取高频词
      const topKeywords = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([kw]) => kw);

      tags.push(...topKeywords);
    }

    return [...new Set(tags)];
  }

  private inferTypeFromTitle(title: string): MemAtom["contentType"] {
    const lower = title.toLowerCase();

    if (lower.includes("经验") || lower.includes("经历") || lower.includes("experience")) {
      return "experience";
    }
    if (lower.includes("洞察") || lower.includes("insight") || lower.includes("发现")) {
      return "insight";
    }
    if (lower.includes("模式") || lower.includes("pattern") || lower.includes("规律")) {
      return "pattern";
    }
    if (lower.includes("故事") || lower.includes("narrative") || lower.includes("narrative")) {
      return "narrative";
    }
    if (lower.includes("直觉") || lower.includes("intuition") || lower.includes("感觉")) {
      return "intuition";
    }

    return "fact";
  }

  // ==========================================================================
  // 导出策略
  // ==========================================================================

  private async exportCrystals(options: MarkdownExportOptions): Promise<string[]> {
    const crystals = this.ecosystem.getCrystals();
    const files: string[] = [];

    for (const crystal of crystals.values()) {
      const filename = `${crystal.id}.md`;
      const filepath = join(options.targetDir, filename);

      const content = this.formatCrystalAsMarkdown(crystal, options.includeMeta);
      writeFileSync(filepath, content);
      files.push(filepath);
    }

    return files;
  }

  private async exportFields(options: MarkdownExportOptions): Promise<string[]> {
    const fields = this.ecosystem.getFields();
    const atoms = this.ecosystem.getAtoms();
    const files: string[] = [];

    for (const field of fields.values()) {
      const filename = `field-${field.name}.md`;
      const filepath = join(options.targetDir, filename);

      let content = `# ${field.name}\n\n`;
      content += `${field.description}\n\n`;

      if (options.includeMeta) {
        content += `## 元数据\n\n`;
        content += `- 原子数: ${field.atoms.size}\n`;
        content += `- 活力: ${(field.vitality * 100).toFixed(1)}%\n`;
        content += `- 创建: ${new Date(field.evolution.created).toISOString()}\n\n`;
      }

      content += `## 记忆\n\n`;

      for (const atomId of field.atoms) {
        const atom = atoms.get(atomId);
        if (atom && atom.strength.current > 0.2) {
          content += `### ${atom.contentType}\n\n`;
          content += `${atom.content}\n\n`;

          if (options.includeMeta) {
            content += `- 强度: ${(atom.strength.current * 100).toFixed(1)}%\n`;
            content += `- 访问: ${atom.temporal.accessCount}次\n\n`;
          }
        }
      }

      writeFileSync(filepath, content);
      files.push(filepath);
    }

    return files;
  }

  private async exportNarrative(options: MarkdownExportOptions): Promise<string[]> {
    // 按时间线导出为叙事
    const atoms = this.ecosystem.getAtoms();
    const atomList = Array.from(atoms.values())
      .filter((a) => a.strength.current > 0.3)
      .sort((a, b) => a.temporal.created - b.temporal.created);

    if (atomList.length === 0) return [];

    const filepath = join(options.targetDir, "narrative.md");

    let content = `# 记忆叙事\n\n`;
    content += `> 自动生成于 ${new Date().toISOString()}\n\n`;

    let currentDate = "";
    for (const atom of atomList) {
      const date = new Date(atom.temporal.created).toISOString().split("T")[0];

      if (date !== currentDate) {
        currentDate = date;
        content += `## ${date}\n\n`;
      }

      content += `### ${atom.contentType}\n\n`;
      content += `${atom.content}\n\n`;

      if (options.includeMeta) {
        content += `*[强度: ${(atom.strength.current * 100).toFixed(0)}% | `;
        content += `访问: ${atom.temporal.accessCount}次]*\n\n`;
      }
    }

    writeFileSync(filepath, content);
    return [filepath];
  }

  private async exportFull(options: MarkdownExportOptions): Promise<string[]> {
    // 导出所有内容
    const atoms = this.ecosystem.getAtoms();
    const files: string[] = [];

    // 按类型分组
    const byType = new Map<MemAtom["contentType"], MemAtom[]>();
    for (const atom of atoms.values()) {
      const list = byType.get(atom.contentType) || [];
      list.push(atom);
      byType.set(atom.contentType, list);
    }

    for (const [type, typeAtoms] of byType) {
      const filename = `${type}s.md`;
      const filepath = join(options.targetDir, filename);

      let content = `# ${type} 记忆\n\n`;
      content += `共 ${typeAtoms.length} 条\n\n`;

      for (const atom of typeAtoms.sort((a, b) => b.strength.current - a.strength.current)) {
        content += `---\n\n`;
        content += `${atom.content}\n\n`;

        if (options.includeMeta) {
          content += `**元数据**\n`;
          content += `- ID: \`${atom.id}\`\n`;
          content += `- 强度: ${(atom.strength.current * 100).toFixed(1)}%\n`;
          content += `- 访问: ${atom.temporal.accessCount}次\n`;
          content += `- 标签: ${atom.meta.tags.join(", ")}\n\n`;
        }
      }

      writeFileSync(filepath, content);
      files.push(filepath);
    }

    return files;
  }

  private formatCrystalAsMarkdown(
    crystal: import("../core/types.js").MemoryCrystal,
    includeMeta: boolean,
  ): string {
    let content = `# 记忆晶体: ${crystal.type}\n\n`;

    content += `## 摘要\n\n`;
    content += `${crystal.abstract}\n\n`;

    if (includeMeta) {
      content += `## 压缩信息\n\n`;
      content += `- 来源原子: ${crystal.sources.totalAtoms}\n`;
      content += `- 压缩比: ${crystal.compression.ratio.toFixed(2)}\n`;
      content += `- 保留信息: ${(crystal.compression.informationRetained * 100).toFixed(1)}%\n`;
      content += `- 时间范围: ${new Date(crystal.sources.timeRange[0]).toISOString()} ~ ${new Date(crystal.sources.timeRange[1]).toISOString()}\n\n`;
    }

    if (crystal.expandability.canExpand) {
      content += `## 展开提示\n\n`;
      content += `${crystal.expandability.expansionQuery}\n\n`;
      content += `### 示例\n\n`;
      content += `${crystal.expandability.sampleExpansion}\n\n`;
    }

    return content;
  }

  private getDefaultMemoryDir(): string {
    const { homedir } = require("node:os");
    return join(homedir(), ".nsemclaw", "memory");
  }
}
