# Nsem 2.1 算法修复方案

## 概述

通过对比 OpenViking 实际代码，发现 Nsem 2.1 的以下算法实现存在问题或缺失。

## 严重问题 (必须修复)

### 1. 热度评分算法 - 完全错误 ❌

**当前实现 (Nsem 2.1):**
```typescript
// HotnessScorer.ts - 线性衰减，过于简单
decayHotness(decayRate: number = 0.95): void {
  this.hotnessScore *= decayRate;
}
activate(uri: string): number {
  const currentHotness = this.hotnessMap.get(uri) ?? 0.5;
  const newHotness = Math.min(1, currentHotness + 0.1); // 简单加法
  return newHotness;
}
```

**OpenViking 实际算法:**
```python
# memory_lifecycle.py
import math

def hotness_score(
    active_count: int,
    updated_at: Optional[datetime],
    now: Optional[datetime] = None,
    half_life_days: float = 7.0,
) -> float:
    """
    Formula: score = sigmoid(log1p(active_count)) * time_decay(updated_at)
    """
    if now is None:
        now = datetime.now(timezone.utc)
    
    # 频率组件: sigmoid(log1p(active_count))
    freq = 1.0 / (1.0 + math.exp(-math.log1p(active_count)))
    
    # 时间衰减组件: exp(-decay_rate * age_days)
    if updated_at is None:
        return 0.0
    
    age_days = max((now - updated_at).total_seconds() / 86400.0, 0.0)
    decay_rate = math.log(2) / half_life_days
    recency = math.exp(-decay_rate * age_days)
    
    return freq * recency
```

**差异分析:**
| 维度 | Nsem 2.1 | OpenViking | 影响 |
|------|----------|------------|------|
| 频率计算 | 简单加法 | sigmoid(log1p(count)) | 2.1无法正确处理高频访问 |
| 时间衰减 | 固定比率乘法 | 指数衰减(半衰期) | 2.1衰减不符合记忆规律 |
| 时间感知 | 无 | 基于 updated_at | 2.1无法区分新旧记忆 |
| 半衰期 | 无 | 可配置(默认7天) | 2.1不可调 |

**修复方案:**
```typescript
// lifecycle/HotnessScorer.ts
export interface HotnessConfig {
  halfLifeDays: number;  // 新增: 半衰期天数
  // ... 其他配置
}

export function computeHotnessScore(
  activeCount: number,
  updatedAt: Date | undefined,
  now: Date = new Date(),
  halfLifeDays: number = 7.0
): number {
  // 频率组件: sigmoid(log1p(active_count))
  const freq = 1.0 / (1.0 + Math.exp(-Math.log1p(activeCount)));
  
  // 时间衰减组件
  if (!updatedAt) return 0.0;
  
  const ageDays = Math.max((now.getTime() - updatedAt.getTime()) / 86400000, 0);
  const decayRate = Math.log(2) / halfLifeDays;
  const recency = Math.exp(-decayRate * ageDays);
  
  return freq * recency;
}
```

---

### 2. 分数传播算法 - 公式错误 ❌

**当前实现 (Nsem 2.1):**
```typescript
// HierarchicalRetriever.ts - 错误的传播方向
const propagatedScore = currentScore * params.alpha + result.score * (1 - params.alpha);
```

**OpenViking 实际算法:**
```python
# hierarchical_retriever.py:319
final_score = (
    alpha * score + (1 - alpha) * current_score if current_score else score
)
# 含义: 子节点分数 * alpha + 父节点分数 * (1 - alpha)
```

**差异分析:**
- Nsem 2.1: `parent * alpha + child * (1-alpha)` - 父节点权重过高
- OpenViking: `child * alpha + parent * (1-alpha)` - 子节点权重更高

**修复方案:**
```typescript
// HierarchicalRetriever.ts
const propagatedScore = result.score * alpha + currentScore * (1 - alpha);
// 或更准确地:
const propagatedScore = currentScore 
  ? result.score * alpha + currentScore * (1 - alpha)
  : result.score;
```

---

### 3. 收敛检测算法 - 逻辑不完整 ⚠️

**当前实现 (Nsem 2.1):**
```typescript
// 简单的集合比较
const changed = !this.setsEqual(prevTopkUris, currentTopk);
if (!changed) {
  convergenceRounds++;
  if (convergenceRounds >= maxConvergenceRounds) break;
}
```

**OpenViking 实际算法:**
```python
# hierarchical_retriever.py:343-358
current_topk = sorted(
    collected_by_uri.values(),
    key=lambda x: x.get("_final_score", 0),
    reverse=True,
)[:limit]
current_topk_uris = {c.get("uri", "") for c in current_topk}

# 关键: 检查 top-k 是否稳定且数量足够
if current_topk_uris == prev_topk_uris and len(current_topk_uris) >= limit:
    convergence_rounds += 1
    if convergence_rounds >= self.MAX_CONVERGENCE_ROUNDS:
        break
else:
    convergence_rounds = 0
    prev_topk_uris = current_topk_uris
```

**差异:**
- OpenViking 检查 `len(current_topk_uris) >= limit`，Nsem 2.1 缺少此检查

**修复方案:**
```typescript
const currentTopk = this.getTopkUris(collected, limit);
const topkComplete = currentTopk.size >= limit;  // 新增检查

if (this.setsEqual(prevTopkUris, currentTopk) && topkComplete) {
  convergenceRounds++;
  if (convergenceRounds >= maxConvergenceRounds) break;
} else {
  convergenceRounds = 0;
  prevTopkUris = currentTopk;
}
```

---

## 中等问题 (建议修复)

### 4. 缺少重排序 (Rerank) 支持 ⚠️

**OpenViking 特性:**
```python
# hierarchical_retriever.py:303-311
if self._rerank_client and mode == RetrieverMode.THINKING:
    documents = []
    for r in results:
        doc = r["abstract"]
        documents.append(doc)
    
    rerank_scores = self._rerank_client.rerank_batch(query, documents)
    query_scores = rerank_scores
```

**Nsem 2.1 状态:** ❌ 完全缺失

**修复方案:**
需要添加 RerankClient 接口和集成。

---

### 5. 缺少稀疏向量支持 ⚠️

**OpenViking 特性:**
```python
# 支持 dense + sparse + hybrid
query_vector = result.dense_vector
sparse_query_vector = result.sparse_vector

results = await self.vector_store.search_children_in_tenant(
    query_vector=query_vector,
    sparse_query_vector=sparse_query_vector,  # 稀疏向量
)
```

**Nsem 2.1 状态:** ⚠️ 接口有，但未实际实现

---

### 6. 缺少意图分析模块 ⚠️

**OpenViking 特性:**
```python
# intent_analyzer.py - 完整的意图分析
class IntentAnalyzer:
    async def analyze(
        self,
        compression_summary: str,
        messages: List[Message],
        current_message: Optional[str] = None,
        context_type: Optional[ContextType] = None,
        target_abstract: str = "",
    ) -> QueryPlan:
        # 使用 LLM 分析会话上下文，生成多个 TypedQuery
```

**Nsem 2.1 状态:** ❌ 完全缺失

---

## 轻微问题 (可选修复)

### 7. 目录层级处理不完善

**OpenViking:**
```python
# Only recurse into directories (L0/L1). L2 files are terminal hits.
if uri not in visited and r.get("level", 2) != 2:
    heapq.heappush(dir_queue, (-final_score, uri))
```

**Nsem 2.1:**
```typescript
// 没有明确检查 level，只检查 isLeaf
if (!result.context.isLeaf) {
  dirQueue.push([-propagatedScore, result.uri]);
}
```

### 8. 缺少 VikingFS 完整抽象

OpenViking 有完整的文件系统抽象 (VikingFS)，Nsem 2.1 只有简单的 Map 存储。

---

## 修复优先级

| 优先级 | 问题 | 影响 | 工作量 |
|--------|------|------|--------|
| 🔴 P0 | 热度评分算法错误 | 严重影响检索质量 | 中等 |
| 🔴 P0 | 分数传播公式错误 | 影响分层检索准确性 | 小 |
| 🟡 P1 | 收敛检测不完整 | 可能提前终止或过度检索 | 小 |
| 🟡 P1 | 缺少重排序 | 影响检索精度 | 大 |
| 🟢 P2 | 缺少意图分析 | 影响复杂查询 | 大 |
| 🟢 P2 | 缺少稀疏向量 | 影响特定场景 | 中等 |

---

## 立即修复代码

### 修复 1: 热度评分算法

```typescript
// lifecycle/HotnessScorer.ts

/**
 * 计算热度评分 (修正版，参考 OpenViking)
 * Formula: score = sigmoid(log1p(active_count)) * time_decay(updated_at)
 */
export function computeHotnessScore(
  activeCount: number,
  updatedAt: Date | undefined,
  now: Date = new Date(),
  halfLifeDays: number = 7.0
): number {
  // 频率组件: sigmoid(log1p(active_count))
  const logCount = Math.log1p(activeCount);
  const freq = 1.0 / (1.0 + Math.exp(-logCount));
  
  // 时间衰减组件: exp(-decay_rate * age_days)
  if (!updatedAt) {
    return 0.0;
  }
  
  const ageMs = now.getTime() - updatedAt.getTime();
  const ageDays = Math.max(ageMs / 86400000, 0);
  const decayRate = Math.log(2) / halfLifeDays;
  const recency = Math.exp(-decayRate * ageDays);
  
  return freq * recency;
}

// 更新 HotnessScorer 类
export class HotnessScorer {
  private config: HotnessConfig;
  // ...

  /**
   * 获取热度评分 (使用正确算法)
   */
  getHotness(uri: string, now?: Date): number {
    const context = this.contexts.get(uri);
    if (!context) return 0;
    
    return computeHotnessScore(
      context.activeCount,
      context.updatedAt,
      now,
      this.config.halfLifeDays
    );
  }
}
```

### 修复 2: 分数传播算法

```typescript
// retrieval/HierarchicalRetriever.ts

// 修正传播公式
const propagatedScore = currentScore !== undefined
  ? result.score * alpha + currentScore * (1 - alpha)  // 子节点权重更高
  : result.score;
```

### 修复 3: 收敛检测

```typescript
// retrieval/HierarchicalRetriever.ts

// 完整的收敛检测
const currentTopk = this.getTopkUris(collected, limit);
const topkComplete = currentTopk.size >= limit;  // 确保有足够的候选

const isConverged = this.setsEqual(prevTopkUris, currentTopk) && topkComplete;

if (isConverged) {
  convergenceRounds++;
  if (convergenceRounds >= maxConvergenceRounds) {
    break;
  }
} else {
  convergenceRounds = 0;
  prevTopkUris = currentTopk;
}
```

---

## 测试验证

修复后需要验证的测试用例:

```typescript
// 热度评分测试
describe("HotnessScorer", () => {
  it("应该正确计算热度评分", () => {
    const score = computeHotnessScore(
      10,  // activeCount
      new Date(Date.now() - 86400000),  // 1天前
      new Date(),
      7.0  // 半衰期7天
    );
    
    // 高频访问 + 最近更新 = 高热度
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("应该正确处理旧记忆", () => {
    const score = computeHotnessScore(
      10,
      new Date(Date.now() - 30 * 86400000),  // 30天前
      new Date(),
      7.0
    );
    
    // 虽然访问多，但时间久远，热度应较低
    expect(score).toBeLessThan(0.3);
  });
});
```

---

## 参考

- OpenViking: `/home/kade/下载/OpenViking-main/openviking/retrieve/`
- 热度算法: `memory_lifecycle.py`
- 分层检索: `hierarchical_retriever.py`
- 意图分析: `intent_analyzer.py`
