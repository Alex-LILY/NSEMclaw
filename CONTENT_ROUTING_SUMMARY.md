# 内容路由系统总结

## 系统流程图

```
用户发送消息
    │
    ▼
┌─────────────────────────────────────────────┐
│  NSEMFusionCore.processUserMessage()        │
│  处理用户消息（支持文本+图片）               │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  ContentRouter.routeMessage()               │
│  智能路由决策                                │
└──────────────┬──────────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
无图片/纯文本          检测到图片
    │                     │
    ▼                     ▼
┌─────────┐      ┌─────────────────────────────┐
│ route:  │      │ 分析用户意图                │
│ "llm"   │      │ - 提取文字 → task: "ocr"    │
└─────────┘      │ - UI分析   → task: "ui"     │
                 │ - 代码     → task: "code"   │
                 │ - 其他     → task: "describe"
                 └──────────┬──────────────────┘
                            │
                            ▼
                 ┌─────────────────────────────┐
                 │ route: "vision"             │
                 │ 执行视觉分析                 │
                 └──────────┬──────────────────┘
                            │
                            ▼
                 ┌─────────────────────────────┐
                 │ VisionModelEngine           │
                 │ .analyzeImage()             │
                 │                             │
                 │ 按需加载模型 → 分析图片      │
                 │ → 返回描述文本               │
                 └──────────┬──────────────────┘
                            │
                            ▼
                 ┌─────────────────────────────┐
                 │ 返回 ContentRoutingResult   │
                 │ {                           │
                 │   decision: { route, taskType },
                 │   visionResult: {           │
                 │     description,            │
                 │     detectedText,           │
                 │     uiElements              │
                 │   },                        │
                 │   enrichedContext: "整合后的上下文"
                 │ }                           │
                 └─────────────────────────────┘
```

## 核心代码示例

### 1. 处理用户消息

```typescript
import { NSEMFusionCore } from './dist/cognitive-core/NSEMFusionCore.js';

const core = new NSEMFusionCore();
await core.initialize();

// 用户发送图片+文字
const result = await core.processUserMessage({
  userId: "user-123",
  sessionId: "session-456",
  text: "这个按钮是什么意思？",
  attachments: [{
    type: "image",
    path: "/tmp/screenshot.png"
  }]
});

console.log(result.decision);
// { route: "vision", taskType: "ui", priority: "high" }

console.log(result.visionResult?.description);
// "这是一个设置页面的截图。主要元素包括：
//  - 返回按钮 (左上角)
//  - 标题: '设置'
//  - 开关: '通知' (当前开启)
//  - 保存按钮 (右下角蓝色)"

// 使用增强后的上下文发送给 LLM
const enrichedContext = result.enrichedContext;
```

### 2. 快速路由（不执行视觉分析）

```typescript
// 只做路由决策，不加载视觉模型
const decision = core.routeUserMessageFast({
  text: "提取这段文字",
  attachments: [{ type: "image", path: "/tmp/doc.png" }]
});

console.log(decision);
// { route: "vision", taskType: "ocr" }
```

### 3. 直接使用视觉系统

```typescript
// 绕过路由，直接分析图片
const result = await core.analyzeImage({
  imagePath: "/tmp/code.png",
  taskType: "code"
});

console.log(result.description);
```

## 任务类型说明

| 任务类型 | 用途 | 示例查询 |
|---------|------|---------|
| `describe` | 通用描述 | "这是什么？" "描述这张图片" |
| `ocr` | 文字提取 | "提取文字" "OCR" "这段文字是什么" |
| `ui` | UI分析 | "这个按钮做什么" "分析界面" |
| `code` | 代码分析 | "解释这段代码" "找出bug" |

## 视觉系统按需加载

```
第一次调用 analyzeImage()
    │
    ▼
检查模型是否已加载 ──否──► 加载模型到 GPU (~5-10秒)
    │                        │
    是                       ▼
    │                  ┌─────────────┐
    └─────────────────►│ 执行分析    │
                       │ (~1-2秒)    │
                       └──────┬──────┘
                              │
                              ▼
                       启动空闲定时器
                       (5分钟后卸载)
```

## 配置

```bash
# 启用内容路由（默认启用）
export NSEM_ENABLE_CONTENT_ROUTING=true

# 视觉模型空闲超时（默认5分钟）
export NSEM_VISION_IDLE_TIMEOUT=300000
```
