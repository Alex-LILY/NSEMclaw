# 决策策略引擎 (Decision Strategy Engine)

决策策略引擎是 OpenClaw NSEM认知核心的关键组件，实现了多种强化学习决策策略，支持上下文感知决策和贝叶斯反馈更新。

## 特性

- **多种决策策略**: ε-贪婪、UCB、汤普森采样、Softmax
- **上下文感知**: 根据相似上下文复用价值估计
- **贝叶斯更新**: 支持 Beta-伯努利和高斯汤普森采样
- **类型安全**: 完整的 TypeScript 类型支持
- **NSEM2Core 集成**: 与神经符号进化记忆系统深度集成

## 快速开始

```typescript
import {
  createDecisionEngine,
  actionFromMemAtom,
  contextFromActivatedMemory,
} from "./decision/index.js";

// 创建决策引擎
const engine = createDecisionEngine({
  defaultStrategy: "ucb",
  strategyParams: {
    type: "ucb",
    explorationCoefficient: Math.sqrt(2),
  },
});

// 定义动作
const actions = [
  { id: "a1", description: "选项1", type: "decision" },
  { id: "a2", description: "选项2", type: "decision" },
  { id: "a3", description: "选项3", type: "decision" },
];

// 执行决策
const result = engine.decide(actions);
console.log(`选择: ${result.action.description}`);
console.log(`置信度: ${result.confidence}`);
console.log(`策略: ${result.strategy}`);

// 反馈更新
engine.updateFeedback(result.recordId, 1.0, "决策效果很好");
```

## 决策策略

### ε-贪婪 (Epsilon-Greedy)

以 ε 概率随机探索，否则选择当前最优动作。

```typescript
const engine = createEpsilonGreedyEngine(0.1); // 10% 探索率

// 或使用通用配置
const engine = createDecisionEngine({
  defaultStrategy: "epsilon-greedy",
  strategyParams: {
    type: "epsilon-greedy",
    epsilon: 0.1,
    decayRate: 0.995, // 自适应衰减
    minEpsilon: 0.01,
  },
});
```

### UCB (Upper Confidence Bound)

UCB(a) = Q(a) + c \* √(2lnN / N(a))

```typescript
const engine = createUCBEngine(Math.sqrt(2));

// 或使用 UCB1-Tuned
const engine = createDecisionEngine({
  defaultStrategy: "ucb",
  strategyParams: {
    type: "ucb",
    explorationCoefficient: Math.sqrt(2),
    useTuned: true, // 考虑奖励方差
  },
});
```

### 汤普森采样 (Thompson Sampling)

从贝叶斯后验分布采样选择动作。

```typescript
// Beta-伯努利 (二元奖励)
const engine = createThompsonSamplingEngine();

// 高斯汤普森采样 (连续奖励)
const engine = createThompsonSamplingEngine(true);
```

### Softmax (Boltzmann)

P(a) = exp(Q(a)/τ) / Σexp(Q(i)/τ)

```typescript
const engine = createSoftmaxEngine(0.5); // 温度参数 τ
```

## 上下文感知决策

```typescript
const context: DecisionContext = {
  id: "ctx-1",
  embedding: [0.1, 0.2, 0.3, ...],  // 语义向量
  stateDescription: "当前状态描述",
  temporalContext: {
    timeOfDay: 12,
    dayOfWeek: 1,
  },
  agentContext: {
    userPreference: "...",
  },
};

const result = engine.decide(actions, context);
```

## 与 NSEM2Core 集成

```typescript
import { NSEM2Core, getNSEM2Core } from "../mind/nsem/NSEM2Core.js";
import { actionFromMemAtom, contextFromActivatedMemory } from "./decision/index.js";

// 获取激活的记忆
const activatedMemory = await nsem.activate({
  intent: "决策相关查询",
  strategy: "precise",
});

// 从记忆创建动作
const actions = activatedMemory.atoms.map((atom) =>
  actionFromMemAtom(atom.atom, { relevance: atom.relevance }),
);

// 从激活记忆创建上下文
const context = contextFromActivatedMemory(activatedMemory, {
  agentId: "agent-1",
});

// 执行决策
const result = engine.decide(actions, context);
```

## 贝叶斯反馈更新

```typescript
// 启用贝叶斯更新
const engine = createDecisionEngine({
  enableBayesianUpdate: true,
});

// 执行决策
const result = engine.decide(actions);

// 提供反馈 (奖励范围: [-1, 1])
engine.updateFeedback(result.recordId, 0.8);

// 批量反馈
engine.batchUpdateFeedback([
  { recordId: "...", reward: 1.0 },
  { recordId: "...", reward: 0.5 },
]);
```

## 策略性能监控

```typescript
// 获取策略统计
const stats = engine.getStrategyPerformance("ucb");
console.log(`平均奖励: ${stats.averageReward}`);
console.log(`探索率: ${stats.explorationRate}`);

// 获取所有策略统计
const allStats = engine.getStrategyPerformance() as Map<DecisionStrategyType, StrategyPerformance>;
```

## 动态调整

```typescript
// 切换策略
engine.switchStrategy("softmax", { type: "softmax", temperature: 0.8 });

// 调整探索参数
engine.adjustExploration(0.5); // 降低探索率

// 重置动作价值 (非平稳环境)
engine.resetActionValues();
```

## API 参考

### DecisionStrategyEngine

主要类，实现所有决策策略。

| 方法                                             | 描述         |
| ------------------------------------------------ | ------------ |
| `decide(actions, context?, strategy?)`           | 执行决策     |
| `updateFeedback(recordId, reward, description?)` | 更新反馈     |
| `batchUpdateFeedback(updates)`                   | 批量更新     |
| `evaluateConfidence(actionId, context?)`         | 评估置信度   |
| `getActionValue(actionId, context?)`             | 获取动作价值 |
| `switchStrategy(strategy, params?)`              | 切换策略     |
| `adjustExploration(factor)`                      | 调整探索参数 |
| `resetActionValues(contextId?)`                  | 重置价值     |
| `getDecisionHistory(limit?)`                     | 获取历史     |
| `getState()`                                     | 获取引擎状态 |
| `destroy()`                                      | 清理资源     |

### 类型定义

- `Action`: 动作定义
- `ActionValue`: 动作价值估计
- `DecisionContext`: 决策上下文
- `DecisionRecord`: 决策记录
- `DecisionOutcome`: 决策结果/反馈
- `DecisionResult`: 决策结果
- `StrategyPerformance`: 策略性能统计

## 测试

```bash
bun test src/cognitive-core/decision/DecisionStrategyEngine.test.ts
```

## 架构

```
DecisionStrategyEngine
├── 策略实现
│   ├── EpsilonGreedy
│   ├── UCB (with UCB1-Tuned variant)
│   ├── ThompsonSampling (Beta & Gaussian)
│   └── Softmax
├── 上下文管理
│   ├── ContextActionValues (上下文特定价值)
│   ├── GlobalActionValues (全局价值)
│   └── ContextSimilarity (上下文相似度计算)
├── 贝叶斯更新
│   ├── Beta-Bernoulli 更新
│   ├── Gaussian 更新
│   └── 标准 Q-learning 更新
└── 性能统计
    ├── 策略使用统计
    └── 收敛性分析
```

## 参考

- Auer, P., Cesa-Bianchi, N., & Fischer, P. (2002). Finite-time analysis of the multiarmed bandit problem.
- Chapelle, O., & Li, L. (2011). An empirical evaluation of thompson sampling.
- Sutton, R. S., & Barto, A. G. (2018). Reinforcement learning: An introduction.
