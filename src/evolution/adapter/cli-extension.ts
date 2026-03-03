/**
 * NSEM CLI 扩展示例
 *
 * 展示如何在现有 memory CLI 中集成 NSEM 功能
 *
 * 实际集成建议:
 * 1. 修改 src/cli/memory-cli.ts，将 getMemorySearchManager 替换为 getEnhancedMemoryManager
 * 2. 在 status 命令中添加 NSEM 状态显示
 * 3. 添加 nsem 子命令用于管理进化记忆
 */

import type { Command } from "commander";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { formatHelpExamples } from "../../cli/help-format.js";
import { loadConfig } from "../../config/config.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { isRich, theme, colorize } from "../../terminal/theme.js";
import { getEnhancedMemoryManager, clearNSEMCache } from "./integration.js";

/**
 * 注册 NSEM 扩展命令
 *
 * 使用: 在 src/cli/memory-cli.ts 的 registerMemoryCli 中添加:
 *   registerNSEMExtension(memory);
 */
export function registerNSEMExtension(memory: Command) {
  const nsem = memory
    .command("nsem")
    .description("NSEM进化记忆管理 (Neuro-Symbolic Evolutionary Memory)");

  // nsem status - 显示NSEM状态
  nsem
    .command("status")
    .description("显示NSEM进化记忆状态")
    .option("--agent <id>", "Agent id")
    .option("--json", "输出JSON格式")
    .action(async (opts: { agent?: string; json?: boolean }) => {
      const cfg = loadConfig();
      const agentId = opts.agent?.trim() || resolveDefaultAgentId(cfg);

      const { manager, nsemEnabled } = await getEnhancedMemoryManager({
        cfg,
        agentId,
      });

      if (!manager) {
        defaultRuntime.error("Memory manager unavailable");
        process.exitCode = 1;
        return;
      }

      if (!nsemEnabled) {
        defaultRuntime.log("NSEM is disabled for this agent.");
        defaultRuntime.log("Enable it in config: agents.[id].nsem.enabled = true");
        return;
      }

      const state = manager.getEcosystemState?.();
      if (!state) {
        defaultRuntime.error("Failed to get NSEM state");
        return;
      }

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(state, null, 2));
        return;
      }

      const rich = isRich();
      const heading = (text: string) => colorize(rich, theme.heading, text);
      const muted = (text: string) => colorize(rich, theme.muted, text);
      const info = (text: string) => colorize(rich, theme.info, text);
      const success = (text: string) => colorize(rich, theme.success, text);
      const warn = (text: string) => colorize(rich, theme.warn, text);

      const healthPct = Math.round(state.health.overall * 100);
      const healthColor =
        healthPct > 70 ? theme.success : healthPct > 40 ? theme.warn : theme.error;

      const lines = [
        `${heading("NSEM Evolutionary Memory")} ${muted(`(${agentId})`)}`,
        "",
        `${muted("Statistics:")}`,
        `  记忆原子: ${info(state.stats.totalAtoms.toString())}`,
        `  关系边: ${info(state.stats.totalEdges.toString())}`,
        `  记忆场: ${info(state.stats.totalFields.toString())}`,
        `  记忆晶体: ${info(state.stats.totalCrystals.toString())}`,
        "",
        `${muted("Health:")}`,
        `  整体健康: ${colorize(rich, healthColor, `${healthPct}%`)}`,
        `  碎片化: ${Math.round(state.health.fragmentation * 100)}%`,
        `  活力: ${Math.round(state.health.vitality * 100)}%`,
      ];

      if (state.hotspots.length > 0) {
        lines.push("", `${muted("Hotspots:")}`);
        for (const spot of state.hotspots.slice(0, 5)) {
          lines.push(`  ${spot.fieldId.slice(0, 30)}... (${Math.round(spot.activity * 100)}%)`);
        }
      }

      if (state.recommendedActions.length > 0) {
        lines.push("", `${muted("Recommended Actions:")}`);
        for (const action of state.recommendedActions.slice(0, 3)) {
          const priorityColor =
            action.priority > 0.7 ? theme.error : action.priority > 0.4 ? theme.warn : theme.muted;
          lines.push(`  ${colorize(rich, priorityColor, `[${action.action}]`)} ${action.reason}`);
        }
      }

      defaultRuntime.log(lines.join("\n"));
      await manager.close?.();
    });

  // nsem evolve - 手动触发进化
  nsem
    .command("evolve")
    .description("手动触发记忆进化")
    .option("--agent <id>", "Agent id")
    .action(async (opts: { agent?: string }) => {
      const cfg = loadConfig();
      const agentId = opts.agent?.trim() || resolveDefaultAgentId(cfg);

      const { manager, nsemEnabled } = await getEnhancedMemoryManager({
        cfg,
        agentId,
      });

      if (!manager) {
        defaultRuntime.error("Memory manager unavailable");
        process.exitCode = 1;
        return;
      }

      if (!nsemEnabled) {
        defaultRuntime.error("NSEM is disabled for this agent.");
        process.exitCode = 1;
        return;
      }

      defaultRuntime.log("Starting memory evolution...");
      await manager.evolve?.();

      const state = manager.getEcosystemState?.();
      if (state) {
        defaultRuntime.log(
          `Evolution complete. Health: ${Math.round(state.health.overall * 100)}%`,
        );
      }

      await manager.close?.();
    });

  // nsem associate - 联想搜索
  nsem
    .command("associate")
    .description("联想搜索 - 发现隐性关联")
    .argument("<query>", "查询内容")
    .option("--agent <id>", "Agent id")
    .option("--count <n>", "返回结果数", "5")
    .action(async (query: string, opts: { agent?: string; count?: string }) => {
      const cfg = loadConfig();
      const agentId = opts.agent?.trim() || resolveDefaultAgentId(cfg);

      const { manager, nsemEnabled } = await getEnhancedMemoryManager({
        cfg,
        agentId,
      });

      if (!manager) {
        defaultRuntime.error("Memory manager unavailable");
        process.exitCode = 1;
        return;
      }

      if (!nsemEnabled) {
        defaultRuntime.error("NSEM is disabled for this agent.");
        process.exitCode = 1;
        return;
      }

      const count = parseInt(opts.count || "5", 10);
      const results = await manager.associativeSearch?.(query, count);

      if (!results || results.length === 0) {
        defaultRuntime.log("No associations found.");
        return;
      }

      const rich = isRich();
      const lines: string[] = [colorize(rich, theme.heading, `Associations for: "${query}"`), ""];

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        lines.push(
          `${i + 1}. ${colorize(rich, theme.success, `${Math.round(r.confidence * 100)}%`)}`,
        );
        lines.push(`   ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`);
        lines.push("");
      }

      defaultRuntime.log(lines.join("\n"));
      await manager.close?.();
    });

  // nsem clear - 清理缓存
  nsem
    .command("clear")
    .description("清理NSEM缓存")
    .option("--agent <id>", "指定agent (默认全部)")
    .action((opts: { agent?: string }) => {
      if (opts.agent) {
        clearNSEMCache(opts.agent);
        defaultRuntime.log(`NSEM cache cleared for ${opts.agent}.`);
      } else {
        clearNSEMCache();
        defaultRuntime.log("All NSEM cache cleared.");
      }
    });

  // 添加帮助示例
  nsem.addHelpText(
    "after",
    () =>
      `\n${theme.heading("Examples:")}${formatHelpExamples([
        ["nsemclaw memory nsem status", "Show NSEM ecosystem status."],
        ["nsemclaw memory nsem evolve", "Trigger manual memory evolution."],
        ['nsemclaw memory nsem associate "learning"', "Find associations with 'learning'."],
      ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/advanced/nsem", "docs.nsemclaw.ai/advanced/nsem")}\n`,
  );
}
