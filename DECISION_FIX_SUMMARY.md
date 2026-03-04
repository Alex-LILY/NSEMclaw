# 决策系统修复总结

## 修复前的问题

原来的 `DecisionStrategyEngine` 只是一个**未使用的学习框架**：
- ✅ 有完整的强化学习算法（UCB/ε-贪婪/汤普森采样）
- ❌ 没有被实例化
- ❌ 没有集成到业务流程
- ❌ 没有反馈收集

## 修复后的架构

```
业务代码 → 决策系统集成层 → 决策引擎 → 元认知监控
                ↓
            反馈收集 → 策略优化
```

## 新增文件

| 文件 | 功能 |
|------|------|
| `src/cognitive-core/integration/DecisionIntegration.ts` | 决策系统集成主模块 |
| `src/cognitive-core/integration/SubagentDecisionIntegration.ts` | 子代理决策集成 |
| `src/agents/tool-decision-hook.ts` | 工具调用决策钩子 |

## 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/agents/pi-tools.before-tool-call.ts` | 集成工具调用决策 |
| `src/agents/tools/cognitive-core-tool.ts` | 添加 `subagent_decide` 动作 |
| `src/cognitive-core/integration/index.ts` | 导出决策集成模块 |
| `src/cognitive-core/index.ts` | 导出决策集成类型 |

## 核心功能

### 1. 工具调用决策
```typescript
// 自动在工具调用前决策
const { allow, requireConfirm, decisionId } = decideToolAllow(context);

// 执行后自动反馈
submitToolCallFeedback({ decisionId, success, duration });
```

### 2. 子代理决策
```typescript
const decision = decideSubagentUsage({
  taskDescription: "分析代码库",
  currentLoad: 0.7,
  availableModels: ["gpt-4o", "claude-3-5-sonnet"],
});

// 返回：shouldSpawn, strategy, recommendedModel, estimatedTime
```

### 3. 记忆检索策略决策
```typescript
const { strategy } = integration.decideMemoryStrategy(query, urgency);
// strategy: "fast" | "balanced" | "deep"
```

## 启用方式

```bash
# 环境变量
export NSEM_ENABLE_TOOL_DECISION=true
export NSEM_ENABLE_SUBAGENT_DECISION=true
```

## 使用示例

### NSEM认知核心工具
```typescript
cognitive_core({
  action: "subagent_decide",
  task_description: "重构数据库模块",
  current_load: 0.7,
});
// 返回：建议策略、推荐模型、预计耗时、理由
```

### 直接使用
```typescript
import { getDecisionIntegration } from "./cognitive-core/integration/index.js";

const integration = getDecisionIntegration();
const decision = integration.decideMemoryStrategy("查询", 0.8);
```

## 反馈机制

| 场景 | 奖励计算 |
|------|---------|
| 工具成功+快速 | +0.8 |
| 工具失败 | -0.5 ~ -0.8 |
| 子代理任务高质量 | +0.7 ~ +1.0 |
| 用户满意 | +0.8 |

## 演示

```bash
# 运行演示
node examples/decision-system-demo.mjs
```

## 下一步建议

1. **更多业务集成点**: 回复策略、记忆检索策略等
2. **可视化**: 决策效果监控仪表盘
3. **跨会话学习**: 决策经验持久化共享
