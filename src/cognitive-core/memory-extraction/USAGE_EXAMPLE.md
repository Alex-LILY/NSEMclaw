# NSEM 2.1 + 记忆提取系统 - 使用示例

## 快速开始

```typescript
import { NSEM21CoreWithExtraction, MemoryCategory } from "./index.js";

// 1. 初始化核心 (包含记忆提取系统)
const core = new NSEM21CoreWithExtraction({
  nsemConfig: config,
  
  // 记忆提取配置
  memoryExtraction: {
    enabled: true,
    
    // 会话配置
    session: {
      maxMessages: 50,
      maxDurationMs: 30 * 60 * 1000, // 30分钟
      autoExtract: true,
    },
    
    // 三个板块配置 (你的三个板块)
    sections: {
      // 板块一: 用户记忆
      user: {
        enabled: true,
        categories: [
          MemoryCategory.PROFILE,      // 用户画像
          MemoryCategory.PREFERENCES,  // 用户偏好
          MemoryCategory.ENTITIES,     // 实体记忆
          MemoryCategory.EVENTS,       // 事件记录
        ],
        storagePath: "viking://user/{userId}/memories",
      },
      
      // 板块二: 代理记忆
      agent: {
        enabled: true,
        categories: [
          MemoryCategory.CASES,        // 案例
          MemoryCategory.PATTERNS,     // 模式
        ],
        storagePath: "viking://agent/{agentSpace}/memories",
      },
      
      // 板块三: 工具/技能记忆
      tool: {
        enabled: true,
        categories: [
          MemoryCategory.TOOLS,        // 工具统计
          MemoryCategory.SKILLS,       // 技能经验
        ],
        storagePath: "viking://agent/{agentSpace}/tools",
      },
    },
  },
});

await core.start();
```

## 完整对话流程示例

```typescript
// 2. 开始新会话
const sessionId = core.startSession("user-123", "agent-456", "account-1");

// 3. 模拟对话 (自动收集)

// 用户输入
core.recordMessage(sessionId, {
  role: "user",
  content: "我想学习 Rust 的所有权系统",
});

// 助手回复
core.recordMessage(sessionId, {
  role: "assistant",
  content: "Rust 的所有权系统是...",
});

// 工具调用: 搜索代码
core.recordToolCall(sessionId, {
  toolName: "code_search",
  skillUri: "viking://agent/skills/code_search",
  input: { query: "rust ownership example", language: "rust" },
  output: JSON.stringify({ results: [...] }),
  status: "completed",
  durationMs: 150,
  promptTokens: 100,
  completionTokens: 200,
});

// 更多对话...
core.recordMessage(sessionId, {
  role: "user",
  content: "能不能给我一些具体的例子？",
});

core.recordMessage(sessionId, {
  role: "assistant",
  content: "好的，以下是所有权转移的例子...",
});

// 工具调用: 运行代码
core.recordToolCall(sessionId, {
  toolName: "code_run",
  skillUri: "viking://agent/skills/code_run",
  input: { code: "fn main() {...}", language: "rust" },
  output: "Compiled successfully",
  status: "completed",
  durationMs: 500,
  promptTokens: 50,
  completionTokens: 20,
});

// 4. 结束会话 → 自动触发记忆提取
const extractionResult = await core.endSession(sessionId);

console.log("提取的记忆:");
console.log(`- 用户板块: ${extractionResult.stats.user}`);
console.log(`- 代理板块: ${extractionResult.stats.agent}`);
console.log(`- 工具板块: ${extractionResult.stats.tool}`);

// 输出示例:
// 提取的记忆:
// - 用户板块: 2 (PROFILE: 用户想学习Rust, PREFERENCES: 喜欢通过例子学习)
// - 代理板块: 1 (CASES: Rust所有权教学案例)
// - 工具板块: 2 (TOOLS: code_search统计, code_run统计)
```

## 检索时自动使用三个板块

```typescript
// 5. 后续检索自动利用提取的记忆
const result = await core.retrieve({
  query: "Rust 所有权",
  userId: "user-123",
  agentId: "agent-456",
});

// 检索结果包含:
// - result.items: 混合检索结果
// - result.sectionContexts.user: 用户偏好 "喜欢通过例子学习"
// - result.sectionContexts.agent: 相关教学案例
```

## 获取用户画像

```typescript
// 获取累计的用户画像
const profile = await core.getUserProfile("user-123");

console.log(profile?.content);
// 输出:
// ## 用户画像
// - **技术兴趣**: Rust, 系统编程
// - **学习偏好**: 通过具体例子学习
// - **常用工具**: code_search, code_run
// - **学习时间**: 晚间
```

## 获取工具统计

```typescript
// 查看 code_search 工具的使用统计
const stats = await core.getToolStats("code_search", "user-123", "agent-456");

console.log(stats);
// 输出:
// {
//   totalCalls: 50,
//   successRate: 0.96,
//   avgTimeMs: 150.5,
//   avgTokens: 2500
// }
```

## 架构流程对应

```
OpenViking 流程                    Nsemclaw 实现
─────────────────────────────────────────────────────
Agent 对话                    →    core.recordMessage()
                              →    core.recordToolCall()
                              
会话结束                      →    core.endSession()
  ↓                           
自动压缩内容                   →    SessionManager 自动收集
  ↓                           
触发记忆提取                   →    MemoryExtractor.extract()
  ↓                           
提取8类记忆                   →    分配到三个板块
  - PROFILE/PREFERENCES       →    user/ 板块
  - CASES/PATTERNS            →    agent/ 板块
  - TOOLS/SKILLS              →    tool/ 板块
  ↓                           
记忆去重                      →    MemoryDeduplicator.deduplicate()
  ↓                           
长期记忆存储                   →    UnifiedMemoryStore.storeMemory()
  - user/{space}/memories/    →    用户板块
  - agent/{space}/memories/   →    代理板块
  - agent/{space}/tools/      →    工具板块
```

## 事件监听

```typescript
// 监听记忆提取事件
core.on("memoriesExtracted", ({ sessionId, memories, processingTimeMs }) => {
  console.log(`会话 ${sessionId} 提取了 ${memories.length} 条记忆`);
});

// 监听会话事件
core.on("sessionStarted", ({ sessionId }) => {
  console.log(`会话开始: ${sessionId}`);
});
```

这个实现与你的"三个板块记忆"架构完全对应，并集成了 OpenViking 的完整记忆提取流程。
