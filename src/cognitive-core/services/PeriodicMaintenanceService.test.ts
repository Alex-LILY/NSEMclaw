/**
 * PeriodicMaintenanceService 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PeriodicMaintenanceService,
  createPeriodicMaintenanceService,
  MaintenanceTaskType,
} from "./PeriodicMaintenanceService.js";

// Mock NSEM2Core
const mockEvolve = vi.fn();
const mockGetStats = vi.fn();

const mockCore = {
  evolve: mockEvolve,
  getStats: mockGetStats,
};

describe("PeriodicMaintenanceService", () => {
  let service: PeriodicMaintenanceService;

  beforeEach(() => {
    mockEvolve.mockReset();
    mockGetStats.mockReset();

    mockEvolve.mockResolvedValue(undefined);
    mockGetStats.mockReturnValue({
      memory: { total: 100, shortTerm: 50, longTerm: 50 },
      edges: 200,
      cache: { hitRate: 0.8 },
      resources: { cpu: 0.5, memory: 0.6 },
      storage: { totalVectors: 1000 },
    });

    service = createPeriodicMaintenanceService(mockCore as any, {
      autoStart: false,
    });
  });

  afterEach(() => {
    service.stop();
  });

  describe("生命周期", () => {
    it("应该成功创建服务", () => {
      expect(service).toBeDefined();
      expect(service.start).toBeDefined();
      expect(service.stop).toBeDefined();
    });

    it("应该启动服务", () => {
      service.start();
      expect(service.isRunning()).toBe(true);
    });

    it("应该停止服务", () => {
      service.start();
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it("支持自动启动", () => {
      const autoService = createPeriodicMaintenanceService(mockCore as any, {
        autoStart: true,
      });
      expect(autoService.isRunning()).toBe(true);
      autoService.stop();
    });
  });

  describe("任务执行", () => {
    it("应该执行衰减任务", async () => {
      const result = await service.runTask("hourly-decay");

      expect(result.status).toBe("success");
      expect(mockEvolve).toHaveBeenCalled();
    });

    it("应该执行清理任务", async () => {
      const result = await service.runTask("daily-prune");

      expect(result.status).toBe("success");
    });

    it("应该执行合并场任务", async () => {
      const result = await service.runTask("daily-merge-fields");

      expect(result.status).toBe("success");
    });

    it("未知任务ID应该抛出错误", async () => {
      await expect(service.runTask("unknown-task")).rejects.toThrow("Task not found: unknown-task");
    });

    it("任务执行失败应该返回失败状态", async () => {
      mockEvolve.mockRejectedValueOnce(new Error("Evolve failed"));

      const result = await service.runTask("hourly-decay");

      expect(result.status).toBe("failed");
    });
  });

  describe("调度器", () => {
    it("应该注册任务调度", () => {
      service.scheduleTask("analyze-patterns" as MaintenanceTaskType, {
        interval: 60000,
      });

      const tasks = service.listScheduledTasks();
      expect(tasks.some((t) => t.type === "analyze-patterns")).toBe(true);
    });

    it("应该取消任务调度", () => {
      service.scheduleTask("compress-vectors" as MaintenanceTaskType, {
        interval: 60000,
      });

      service.unscheduleTask("compress-vectors");

      const tasks = service.listScheduledTasks();
      expect(tasks.some((t) => t.type === "compress-vectors")).toBe(false);
    });
  });

  describe("任务管理", () => {
    it("应该添加任务", () => {
      service.addTask({
        id: "test-task",
        type: "decay",
        schedule: "hourly",
        enabled: true,
        runCount: 0,
        failureCount: 0,
      });

      const task = service.getTask("test-task");
      expect(task).toBeDefined();
      expect(task?.type).toBe("decay");
    });

    it("应该移除任务", () => {
      service.addTask({
        id: "task-to-remove",
        type: "prune",
        schedule: "daily",
        enabled: true,
        runCount: 0,
        failureCount: 0,
      });

      const removed = service.removeTask("task-to-remove");
      expect(removed).toBe(true);
      expect(service.getTask("task-to-remove")).toBeUndefined();
    });

    it("应该更新任务", () => {
      service.addTask({
        id: "task-to-update",
        type: "decay",
        schedule: "hourly",
        enabled: true,
        runCount: 0,
        failureCount: 0,
      });

      const updated = service.updateTask("task-to-update", { enabled: false });
      expect(updated).toBe(true);

      const task = service.getTask("task-to-update");
      expect(task?.enabled).toBe(false);
    });

    it("应该启用/禁用任务", () => {
      service.addTask({
        id: "toggle-task",
        type: "decay",
        schedule: "hourly",
        enabled: false,
        runCount: 0,
        failureCount: 0,
      });

      service.enableTask("toggle-task");
      expect(service.getTask("toggle-task")?.enabled).toBe(true);

      service.disableTask("toggle-task");
      expect(service.getTask("toggle-task")?.enabled).toBe(false);
    });

    it("应该获取所有任务", () => {
      const allTasks = service.getAllTasks();
      expect(allTasks.length).toBeGreaterThan(0);
    });
  });

  describe("统计信息", () => {
    it("应该返回统计信息", () => {
      const stats = service.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalRuns).toBeGreaterThanOrEqual(0);
      expect(stats.successCount).toBeGreaterThanOrEqual(0);
      expect(stats.failureCount).toBeGreaterThanOrEqual(0);
      expect(stats.tasks).toBeDefined();
      expect(stats.execution).toBeDefined();
    });

    it("应该记录任务执行", async () => {
      await service.runTask("hourly-decay");

      const stats = service.getStats();
      expect(stats.totalRuns).toBe(1);
      expect(stats.successCount).toBe(1);
    });

    it("应该记录失败任务", async () => {
      mockEvolve.mockRejectedValueOnce(new Error("Failed"));

      await service.runTask("hourly-decay");

      const stats = service.getStats();
      expect(stats.failureCount).toBe(1);
    });

    it("应该返回执行结果", async () => {
      await service.runTask("hourly-decay");
      await service.runTask("daily-prune");

      const results = service.getResults();
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it("应该按任务ID过滤结果", async () => {
      await service.runTask("hourly-decay");

      const results = service.getResults("hourly-decay");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.taskId === "hourly-decay")).toBe(true);
    });
  });

  describe("结果管理", () => {
    it("应该清除结果", async () => {
      await service.runTask("hourly-decay");

      let results = service.getResults();
      expect(results.length).toBeGreaterThan(0);

      service.clearResults();

      results = service.getResults();
      expect(results.length).toBe(0);
    });
  });

  describe("批量任务执行", () => {
    it("应该运行所有任务", async () => {
      const results = await service.runAllTasks();

      expect(Array.isArray(results)).toBe(true);
    });

    it("应该按类型运行任务", async () => {
      // 添加多个 decay 类型的任务
      service.addTask({
        id: "extra-decay",
        type: "decay",
        schedule: "daily",
        enabled: true,
        runCount: 0,
        failureCount: 0,
      });

      const results = await service.runTasksByType("decay");

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("边界条件", () => {
    it("应该处理极短间隔", () => {
      expect(() => {
        service.scheduleTask("short-interval" as MaintenanceTaskType, {
          interval: 1, // 1ms
        });
      }).not.toThrow();
    });

    it("应该处理并发任务限制", async () => {
      // 添加多个任务并同时执行
      service.addTask({
        id: "concurrent-1",
        type: "decay",
        schedule: "hourly",
        enabled: true,
        runCount: 0,
        failureCount: 0,
      });
      service.addTask({
        id: "concurrent-2",
        type: "prune",
        schedule: "daily",
        enabled: true,
        runCount: 0,
        failureCount: 0,
      });

      const promises = [
        service.runTask("concurrent-1"),
        service.runTask("concurrent-2"),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r.status).toBe("success"));
    });

    it("停止后服务不再运行", () => {
      service.start();
      service.stop();

      expect(service.isRunning()).toBe(false);
    });
  });
});
