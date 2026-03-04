# 决策系统修复说明

## 问题背景

原来的 `DecisionStrategyEngine` 只是一个**学习框架/能力层**，虽然实现了完整的强化学习算法（UCB、ε-贪婪、汤普森采样等），但：
- ❌ 没有被实际初始化
- ❌ 没有集成到业务流程中
- ❌ 没有反馈收集机制

## 修复方案

### 1. 新增决策系统集成层

**文件**: `src/cognitive-core/integration/DecisionIntegration.ts`

将决策引擎与业务场景集成：

```typescript
// 工具调用决策
const { allow, requireConfirm, decisionId } = integration.decideToolAllow(context);

// 子代理决策
const { shouldSpawn, strategy, decisionId } = integration.decideSubagentSpawn(context);

// 回复策略决策
const { mode, decisionId } = integration.decideReplyMode(context);

// 提交反馈
integration.submitFeedback(decisionId, success, reward);
```

### 2. 工具调用决策钩子

**文件**: `src/agents/tool-decision-hook.ts`

集成到现有工具调用流程：

```typescript
// 在 pi-tools.before-tool-call.ts 中调用
const decisionResult = await decideToolCall({ toolName, params, ctx });

// 执行后自动提交反馈
submitToolCallFeedback({ decisionId, success, duration, error });
```

### 3. 子代理决策集成

**文件**: `src/cognitive-core/integration/SubagentDecisionIntegration.ts`

智能决策何时使用子代理：

```typescript
// 评估任务复杂度
const complexity = estimateTaskComplexity(taskDescription);

// 决策
const decision = decideSubagentUsage({ taskDescription, parentSessionKey, ... });

// 返回建议
// - shouldSpawn: 是否调用子代理
// - strategy: "fast" | "quality" | "none"
// - recommendedModel: 推荐模型
// - estimatedTime: 预计耗时
```

## 启用方法

### 环境变量

```bash
# 启用工具调用决策
export NSEM_ENABLE_TOOL_DECISION=true

# 启用子代理决策
export NSEM_ENABLE_SUBAGENT_DECISION=true

# 使用真实子代理（而非模拟）
export NSEM_USE_REAL_SUBAGENTS=true
```

### 代码中使用

#### 1. 直接使用决策集成

```typescript
import { getDecisionIntegration } from "./cognitive-core/integration/index.js";

const integration = getDecisionIntegration();

// 决策：记忆检索策略
const { strategy, decisionId } = integration.decideMemoryStrategy(query, urgency);
// strategy: "fast" | "balanced" | "deep"

// 后续提交反馈
integration.submitFeedback(decisionId, success, reward);
```

#### 2. 使用NSEM认知核心工具

```typescript
// 子代理决策
cognitive_core({
  action: "subagent_decide",
  task_description: "分析代码库并重构主要模块",
  available_models: ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet"],
  current_load: 0.7,
});

// 返回：
// {
//   should_spawn: true,
//   strategy: "quality",
//   recommended_model: "claude-3-5-sonnet",
//   estimated_time_ms: 45000,
//   confidence: 0.8,
//   reasoning: "任务复杂度 75%，当前负载 70%，选择质量优先策略"
// }
```

#### 3. 工具调用自动决策

工具调用会自动经过决策系统：

```typescript
// 在工具调用前，决策系统会：
// 1. 判断是否允许调用（防止循环、风险评估）
// 2. 选择执行策略（direct/sandbox/dry_run）
// 3. 执行后自动收集反馈

// 查看决策统计
import { getToolDecisionStats } from "./agents/tool-decision-hook.js";

const stats = getToolDecisionStats();
console.log(stats);
// {
//   totalDecisions: 150,
//   toolDecisions: 120,
//   avgReward: 0.65,
//   pendingDecisions: 5
// }
```

## 决策流程

### 工具调用决策流程

```
用户/LLM 发起工具调用
        │
        ▼
┌─────────────────────┐
│ 1. 循环检测          │── 检测到循环？──→ 阻止调用
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. 决策系统：是否允许 │── 决策阻止？──→ 阻止/需确认
│    decideToolAllow   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 3. 决策系统：执行策略 │── 选择策略：direct/sandbox/dry_run
│    decideToolStrategy│
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. 执行工具          │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 5. 提交反馈          │── 更新决策引擎
│    submitToolCallFeedback
└─────────────────────┘
```

### 子代理决策流程

```
收到任务
   │
   ▼
评估任务复杂度 ──→ 复杂度 < 0.4？──→ 直接处理
   │
   ▼
决策系统分析
   │
   ├── 负载高 ──→ 建议调用子代理
   ├── 复杂度高 ──→ 建议调用子代理
   └── 否则 ──→ 直接处理
   │
   ▼
选择策略
   ├── fast ──→ 轻量级模型，快速响应
   └── quality ──→ 强模型，深度处理
   │
   ▼
执行任务 ──→ 收集反馈 ──→ 优化策略
```

## 反馈机制

### 工具调用反馈

| 结果 | 奖励计算 |
|------|---------|
| 成功+快速(<1s) | +0.8 |
| 成功+正常(<5s) | +0.6 |
| 成功+慢速 | +0.4 |
| 失败 | -0.5 ~ -0.8 |
| 超时错误 | -0.7 |
| 权限错误 | -0.8 |

### 子代理任务反馈

```typescript
submitSubagentTaskFeedback({
  decisionId,
  taskCompleted: true,
  qualityScore: 0.9,      // 任务质量评分
  executionTime: 30000,   // 执行时间(ms)
});
// 奖励 = qualityScore * 0.7 + timeScore * 0.3
```

## 监控和调试

### 查看决策统计

```typescript
import { getDecisionIntegration } from "./cognitive-core/integration/index.js";

const integration = getDecisionIntegration();

// 决策统计
console.log(integration.getStats());
// {
//   totalDecisions: 500,
//   toolDecisions: 300,
//   subagentDecisions: 100,
//   replyDecisions: 100,
//   avgReward: 0.72
// }

// 决策引擎状态
console.log(integration.getEngineState());
// {
//   currentStrategy: "ucb",
//   totalDecisions: 500,
//   contextCount: 50,
//   averageReward: 0.72
// }

// 最近反馈
console.log(integration.getRecentFeedback(10));
```

### 调整探索率

```typescript
// 增加探索（学习阶段）
integration.adjustExploration(1.5);

// 减少探索（稳定阶段）
integration.adjustExploration(0.5);
```

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        业务层                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 工具调用      │ │ 子代理管理    │ │ 回复处理      │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    决策系统集成层                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  DecisionIntegration                                  │      │
│  │  - decideToolAllow()                                  │      │
│  │  - decideToolStrategy()                               │      │
│  │  - decideSubagentSpawn()                              │      │
│  │  - decideReplyMode()                                  │      │
│  │  - decideMemoryStrategy()                             │      │
│  │  - submitFeedback()                                   │      │
│  └────────────────────┬─────────────────────────────────┘      │
└───────────────────────┼─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    决策引擎层                                     │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  DecisionStrategyEngine                               │      │
│  │  - UCB                                               │      │
│  │  - ε-Greedy                                          │      │
│  │  - Thompson Sampling                                 │      │
│  │  - Softmax                                           │      │
│  └────────────────────┬─────────────────────────────────┘      │
└───────────────────────┼─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    元认知监控层                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  MetaCognitionMonitor                                 │      │
│  │  - 性能追踪                                           │      │
│  │  - 异常检测                                           │      │
│  │  - 策略评估                                           │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## 测试

运行决策系统测试：

```bash
# 决策引擎测试
pnpm test src/cognitive-core/decision/DecisionStrategyEngine.test.ts

# 子代理决策集成测试
pnpm test src/cognitive-core/multi-agent/MultiAgentCollaboration.test.ts
```

## 未来扩展

1. **自适应策略切换**: 根据任务类型自动选择最优策略
2. **跨会话学习**: 决策经验在不同 Agent 间共享
3. **可视化仪表盘**: 决策效果实时监控
4. **A/B 测试框架**: 对比不同策略的效果
