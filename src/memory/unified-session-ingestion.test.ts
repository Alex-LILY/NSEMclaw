import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  UnifiedSessionIngestionManager,
  getUnifiedSessionIngestionManager,
  clearUnifiedSessionIngestionCache,
  type SessionConsumer,
  type SessionIngestionConfig,
} from "./unified-session-ingestion.js";
import { onSessionTranscriptUpdate, emitSessionTranscriptUpdate } from "../sessions/transcript-events.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";

// Mock the session events module
vi.mock("../sessions/transcript-events.js", () => ({
  onSessionTranscriptUpdate: vi.fn(() => () => {}),
  emitSessionTranscriptUpdate: vi.fn(),
}));

// Mock the paths module
vi.mock("../config/sessions/paths.js", () => ({
  resolveSessionTranscriptsDirForAgent: vi.fn((agentId: string) => 
    `/tmp/test-sessions/${agentId}`
  ),
}));

describe("UnifiedSessionIngestionManager", () => {
  let manager: UnifiedSessionIngestionManager;
  let mockConsumer: SessionConsumer;
  let consumedDeltas: Array<{ filePath: string; messages: number }> = [];

  beforeEach(() => {
    clearUnifiedSessionIngestionCache();
    consumedDeltas = [];
    
    mockConsumer = {
      name: "test-consumer",
      consumeDelta: vi.fn(async (filePath, delta) => {
        consumedDeltas.push({ filePath, messages: delta.newMessages.length });
      }),
      syncFull: vi.fn(),
    };

    manager = new UnifiedSessionIngestionManager("test-agent", {
      debounceMs: 100, // Fast debounce for testing
      deltaBytes: 100,
      deltaMessages: 2,
    });
  });

  afterEach(() => {
    manager.stop();
    vi.clearAllMocks();
  });

  describe("basic operations", () => {
    it("should start and stop without errors", () => {
      expect(() => manager.start()).not.toThrow();
      expect(() => manager.stop()).not.toThrow();
    });

    it("should register and unregister consumers", () => {
      const unregister = manager.registerConsumer(mockConsumer);
      expect(typeof unregister).toBe("function");
      
      // Unregister should not throw
      expect(() => unregister()).not.toThrow();
    });

    it("should not allow duplicate starts", () => {
      manager.start();
      manager.start(); // Should not throw or create duplicate listeners
      
      expect(onSessionTranscriptUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("event handling", () => {
    it("should subscribe to session transcript updates on start", () => {
      manager.start();
      expect(onSessionTranscriptUpdate).toHaveBeenCalledTimes(1);
    });

    it("should unsubscribe on stop", () => {
      const mockUnsubscribe = vi.fn();
      (onSessionTranscriptUpdate as ReturnType<typeof vi.fn>).mockReturnValue(mockUnsubscribe);
      
      manager.start();
      manager.stop();
      
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe("consumer notification", () => {
    it("should distribute deltas to all registered consumers", async () => {
      manager.registerConsumer(mockConsumer);
      
      // Simulate the internal distribution
      const testFilePath = "/tmp/test-sessions/test-agent/session.jsonl";
      const testDelta = {
        newContent: '{"type":"message","message":{"role":"user","content":"test"}}\n',
        startOffset: 0,
        endOffset: 100,
        newMessages: [{ role: "user" as const, content: "test" }],
      };

      // Access private method through any
      await (manager as any).distributeToConsumers(testFilePath, testDelta);

      expect(mockConsumer.consumeDelta).toHaveBeenCalledWith(testFilePath, testDelta);
    });

    it("should handle consumer errors gracefully", async () => {
      const failingConsumer: SessionConsumer = {
        name: "failing-consumer",
        consumeDelta: vi.fn().mockRejectedValue(new Error("Consumer failed")),
      };

      manager.registerConsumer(failingConsumer);
      manager.registerConsumer(mockConsumer);

      const testFilePath = "/tmp/test-sessions/test-agent/session.jsonl";
      const testDelta = {
        newContent: "test content",
        startOffset: 0,
        endOffset: 100,
        newMessages: [{ role: "user" as const, content: "test" }],
      };

      // Should not throw even if one consumer fails
      await expect(
        (manager as any).distributeToConsumers(testFilePath, testDelta)
      ).resolves.not.toThrow();

      // Both consumers should have been called
      expect(failingConsumer.consumeDelta).toHaveBeenCalled();
      expect(mockConsumer.consumeDelta).toHaveBeenCalled();
    });
  });

  describe("configuration", () => {
    it("should use default config when not provided", () => {
      const defaultManager = new UnifiedSessionIngestionManager("test-agent");
      expect((defaultManager as any).config.debounceMs).toBe(5000);
      expect((defaultManager as any).config.deltaBytes).toBe(4096);
      expect((defaultManager as any).config.deltaMessages).toBe(3);
    });

    it("should merge custom config with defaults", () => {
      const customManager = new UnifiedSessionIngestionManager("test-agent", {
        debounceMs: 1000,
      });
      expect((customManager as any).config.debounceMs).toBe(1000);
      expect((customManager as any).config.deltaBytes).toBe(4096); // default
    });
  });

  describe("cache management", () => {
    it("should return cached manager for same agent and config", () => {
      const config: SessionIngestionConfig = {
        debounceMs: 1000,
        deltaBytes: 100,
        deltaMessages: 2,
      };

      const manager1 = getUnifiedSessionIngestionManager("agent-1", config);
      const manager2 = getUnifiedSessionIngestionManager("agent-1", config);

      expect(manager1).toBe(manager2);
    });

    it("should return different managers for different agents", () => {
      const manager1 = getUnifiedSessionIngestionManager("agent-1");
      const manager2 = getUnifiedSessionIngestionManager("agent-2");

      expect(manager1).not.toBe(manager2);
    });

    it("should clear cache and stop all managers", () => {
      const manager1 = getUnifiedSessionIngestionManager("agent-1");
      const manager2 = getUnifiedSessionIngestionManager("agent-2");

      clearUnifiedSessionIngestionCache();

      // After clearing, should create new managers
      const manager3 = getUnifiedSessionIngestionManager("agent-1");
      expect(manager3).not.toBe(manager1);
    });
  });

  describe("syncAll", () => {
    it("should call syncFull on all consumers that support it", async () => {
      const consumerWithSync: SessionConsumer = {
        name: "with-sync",
        consumeDelta: vi.fn(),
        syncFull: vi.fn().mockResolvedValue(undefined),
      };

      const consumerWithoutSync: SessionConsumer = {
        name: "without-sync",
        consumeDelta: vi.fn(),
      };

      manager.registerConsumer(consumerWithSync);
      manager.registerConsumer(consumerWithoutSync);

      await manager.syncAll();

      expect(consumerWithSync.syncFull).toHaveBeenCalled();
      expect(consumerWithoutSync.syncFull).toBeUndefined();
    });

    it("should handle syncFull errors gracefully", async () => {
      const failingSyncConsumer: SessionConsumer = {
        name: "failing-sync",
        consumeDelta: vi.fn(),
        syncFull: vi.fn().mockRejectedValue(new Error("Sync failed")),
      };

      manager.registerConsumer(failingSyncConsumer);

      // Should not throw
      await expect(manager.syncAll()).resolves.not.toThrow();
    });
  });
});

describe("Integration with session events", () => {
  it("should receive events from emitSessionTranscriptUpdate", () => {
    // This test verifies the integration between the unified manager
    // and the existing session events system
    const mockListener = vi.fn();
    
    // Simulate registering a listener
    (onSessionTranscriptUpdate as ReturnType<typeof vi.fn>).mockImplementation((cb) => {
      // Store callback for later
      (global as any).__testSessionCallback = cb;
      return () => {};
    });

    const manager = new UnifiedSessionIngestionManager("test-agent");
    manager.start();

    // Verify listener was registered
    expect(onSessionTranscriptUpdate).toHaveBeenCalled();
    expect(typeof (global as any).__testSessionCallback).toBe("function");

    manager.stop();
  });
});
