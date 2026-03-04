#!/usr/bin/env node
/**
 * 适配器集成测试脚本
 * 
 * 运行方式: node test-adapter-integration.mjs
 */

import { 
  createUnifiedMemoryService,
  createThreeTierSearchManager,
  TripleHybridSearchManager,
  DefaultFormatConverter,
} from "./src/cognitive-core/adapter/index.js";

console.log("🧠 适配器层集成测试\n");

// 测试 1: 基础 ThreeTierSearchManager
console.log("测试 1: ThreeTierSearchManager");
console.log("-".repeat(50));

try {
  const manager = createThreeTierSearchManager({
    agentId: "test-agent",
    workingMemoryCapacity: 10,
  });

  const status = manager.status();
  console.log("✅ ThreeTierSearchManager 创建成功");
  console.log("   Provider:", status.provider);
  console.log("   Backend:", status.backend);
  console.log("   Working Memory:", status.custom.workingMemory.count, "/", status.custom.workingMemory.capacity);
} catch (err) {
  console.error("❌ ThreeTierSearchManager 创建失败:", err.message);
}

console.log();

// 测试 2: 格式转换器
console.log("测试 2: FormatConverter");
console.log("-".repeat(50));

try {
  const converter = new DefaultFormatConverter({
    agentId: "test-agent",
    userId: "user-123",
  });

  const markdownItem = {
    path: "memory/user/preferences.md",
    content: "## User Preferences\n- 喜欢 TypeScript\n- 偏好简洁的代码风格",
    heading: "User Preferences",
  };

  const structured = converter.toStructured(markdownItem);
  console.log("✅ Markdown → 结构化转换成功");
  console.log("   URI:", structured.uri);
  console.log("   Category:", structured.category);
  console.log("   Section:", structured.section);
  console.log("   Abstract:", structured.abstract.slice(0, 50) + "...");

  const backToMarkdown = converter.toMarkdown(structured);
  console.log("✅ 结构化 → Markdown 转换成功");
  console.log("   Path:", backToMarkdown.path);
} catch (err) {
  console.error("❌ 格式转换失败:", err.message);
}

console.log();

// 测试 3: 统一服务
console.log("测试 3: UnifiedMemoryService");
console.log("-".repeat(50));

try {
  const service = createUnifiedMemoryService({
    agentId: "test-agent",
    userId: "user-123",
    storage: {
      enableThreeTier: true,
      workingMemoryCapacity: 10,
    },
    session: {
      enableSessionManager: false, // 简化测试
    },
    api: {
      preferNew: true,
    },
  });

  // 初始化（不传现有管理器）
  await service.initialize();

  const status = service.getStatus();
  console.log("✅ UnifiedMemoryService 初始化成功");
  console.log("   Initialized:", status.initialized);
  console.log("   Storage Type:", status.storage.type);
  console.log("   Working Memory:", status.storage.workingMemorySize);
  console.log("   API - Legacy Available:", status.api.legacyAvailable);
  console.log("   API - New Available:", status.api.newAvailable);

  // 测试记忆存储
  await service.storeMemory({
    uri: "viking://user/preferences",
    content: "用户喜欢 TypeScript 和简洁的代码风格",
    category: "preferences",
  });
  console.log("✅ 记忆存储成功");

  // 搜索
  const results = await service.unifiedSearch("TypeScript", {
    maxResults: 5,
    includeLegacy: false,
    includeNew: true,
  });
  console.log("✅ 搜索完成");
  console.log("   Results:", results.stats.total);
  console.log("   Search Time:", results.stats.searchTimeMs, "ms");

  // 清理
  await service.destroy();
  console.log("✅ 服务销毁成功");
} catch (err) {
  console.error("❌ UnifiedMemoryService 测试失败:", err.message);
  console.error(err.stack);
}

console.log();
console.log("=".repeat(50));
console.log("测试完成！");
console.log();
console.log("下一步:");
console.log("1. 查看集成指南: src/cognitive-core/adapter/INTEGRATION_GUIDE.md");
console.log("2. 修改 search-manager.ts 集成 ThreeTier");
console.log("3. 在 Agent Runner 中集成 SessionManager");
console.log("4. 配置 nsemclaw.config.json 启用 ThreeTier");
