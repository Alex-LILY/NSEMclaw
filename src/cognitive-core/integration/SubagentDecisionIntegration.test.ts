/**
 * 子代理决策集成测试
 */

import { describe, it, expect } from "vitest";
import {
  estimateTaskComplexity,
  estimateTokens,
  decideSubagentUsage,
  decideBatchSubagentUsage,
} from "./SubagentDecisionIntegration.js";

describe("SubagentDecisionIntegration", () => {
  describe("任务复杂度评估", () => {
    it("应该识别简单任务", () => {
      const task = "移动文件到另一个目录";
      const complexity = estimateTaskComplexity(task);

      expect(complexity).toBeLessThan(0.5);
    });

    it("应该识别复杂任务", () => {
      const task = "分析整个代码库的架构问题并提供重构方案";
      const complexity = estimateTaskComplexity(task);

      expect(complexity).toBeGreaterThan(0.5);
    });

    it("应该根据关键词调整复杂度", () => {
      const simpleTask = "快速修复 bug";
      const complexTask = "重构核心架构";

      const simpleComplexity = estimateTaskComplexity(simpleTask);
      const complexComplexity = estimateTaskComplexity(complexTask);

      expect(complexComplexity).toBeGreaterThan(simpleComplexity);
    });

    it("应该根据长度调整复杂度", () => {
      const shortTask = "修复";
      const longTask = "a".repeat(2000);

      const shortComplexity = estimateTaskComplexity(shortTask);
      const longComplexity = estimateTaskComplexity(longTask);

      expect(longComplexity).toBeGreaterThanOrEqual(shortComplexity);
    });
  });

  describe("Token 估算", () => {
    it("应该估算中文文本", () => {
      const text = "这是一个测试文本";
      const tokens = estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it("应该估算英文文本", () => {
      const text = "This is a test sentence with some words";
      const tokens = estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it("英文应该比中文使用更少的 tokens", () => {
      // 中文约 1.5 tokens/字，英文约 1 token/词
      const chineseText = "测试".repeat(10); // 20 字符，约 30 tokens
      const englishText = "test ".repeat(10); // 10 词，约 10 tokens

      const chineseTokens = estimateTokens(chineseText);
      const englishTokens = estimateTokens(englishText);

      expect(chineseTokens).toBeGreaterThan(englishTokens);
    });
  });

  describe("子代理使用决策", () => {
    it("应该为简单任务建议直接处理", () => {
      const decision = decideSubagentUsage({
        taskDescription: "移动文件",
        parentSessionKey: "test-session",
        availableModels: ["gpt-4o"],
        currentLoad: 0.3,
      });

      expect(decision.shouldSpawn).toBe(false);
      expect(decision.strategy).toBe("none");
    });

    it("应该为高负载建议调用子代理", () => {
      const decision = decideSubagentUsage({
        taskDescription: "分析代码库",
        parentSessionKey: "test-session",
        availableModels: ["gpt-4o"],
        currentLoad: 0.8,
      });

      expect(decision.shouldSpawn).toBe(true);
      expect(decision.strategy).toBeTruthy();
    });

    it("应该为复杂任务建议调用子代理", () => {
      const decision = decideSubagentUsage({
        taskDescription: "重构整个微服务架构并优化数据库设计",
        parentSessionKey: "test-session",
        availableModels: ["gpt-4o"],
        currentLoad: 0.3,
      });

      expect(decision.shouldSpawn).toBe(true);
    });

    it("应该返回推荐模型", () => {
      const decision = decideSubagentUsage({
        taskDescription: "复杂任务",
        parentSessionKey: "test-session",
        availableModels: ["gpt-4o", "gpt-4o-mini"],
        currentLoad: 0.5,
      });

      // 质量策略应该推荐更强的模型
      if (decision.strategy === "quality") {
        expect(decision.recommendedModel).toBeTruthy();
      }
    });

    it("应该返回预估时间", () => {
      const decision = decideSubagentUsage({
        taskDescription: "测试任务",
        parentSessionKey: "test-session",
        availableModels: ["gpt-4o"],
        currentLoad: 0.5,
      });

      expect(decision.estimatedTime).toBeGreaterThan(0);
    });

    it("应该返回决策理由", () => {
      const decision = decideSubagentUsage({
        taskDescription: "测试任务",
        parentSessionKey: "test-session",
        availableModels: ["gpt-4o"],
        currentLoad: 0.5,
      });

      expect(decision.reasoning).toBeTruthy();
      expect(decision.reasoning.length).toBeGreaterThan(0);
    });

    it("应该在禁用时返回保守决策", () => {
      // 通过环境变量禁用
      const originalEnv = process.env.NSEM_ENABLE_SUBAGENT_DECISION;
      process.env.NSEM_ENABLE_SUBAGENT_DECISION = "false";

      const decision = decideSubagentUsage({
        taskDescription: "复杂任务需要子代理",
        parentSessionKey: "test-session",
        availableModels: ["gpt-4o"],
        currentLoad: 0.9,
      });

      expect(decision.shouldSpawn).toBe(false);

      process.env.NSEM_ENABLE_SUBAGENT_DECISION = originalEnv;
    });
  });

  describe("批量子代理决策", () => {
    it("应该为批量任务分配策略", () => {
      const tasks = [
        { id: "1", description: "简单任务 1", priority: 5 },
        { id: "2", description: "复杂架构分析", priority: 8 },
        { id: "3", description: "简单任务 2", priority: 3 },
      ];

      const batchDecision = decideBatchSubagentUsage({
        tasks,
        parentSessionKey: "test-batch",
        availableModels: ["gpt-4o"],
        currentLoad: 0.5,
      });

      expect(batchDecision.tasks).toHaveLength(3);
      expect(batchDecision.recommendedParallel).toBeGreaterThan(0);
      expect(batchDecision.totalEstimatedTime).toBeGreaterThan(0);
    });

    it("应该根据负载限制并行数", () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        description: `任务 ${i}`,
        priority: 5,
      }));

      const highLoadDecision = decideBatchSubagentUsage({
        tasks,
        parentSessionKey: "test-batch",
        availableModels: ["gpt-4o"],
        currentLoad: 0.9, // 高负载
      });

      const lowLoadDecision = decideBatchSubagentUsage({
        tasks,
        parentSessionKey: "test-batch",
        availableModels: ["gpt-4o"],
        currentLoad: 0.2, // 低负载
      });

      // 低负载时应该有更高的并行数
      expect(lowLoadDecision.recommendedParallel).toBeGreaterThanOrEqual(
        highLoadDecision.recommendedParallel
      );
    });
  });
});
