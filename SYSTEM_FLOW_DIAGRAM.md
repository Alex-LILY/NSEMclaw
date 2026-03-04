# NSEM 系统整体流程图

## 1. 系统架构概览

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              用户输入层 (User Input)                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   文本消息   │  │   图片消息   │  │   文件上传   │  │   语音消息   │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              输入处理层 (Input Processing)                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                        消息类型识别 & 预处理                                    │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │    │
│  │  │ detectText()│    │detectImage()│    │detectFile() │    │detectVoice()│  │    │
│  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │    │
│  │         │                  │                  │                  │         │    │
│  │         ▼                  ▼                  ▼                  ▼         │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │    │
│  │  │  文本内容   │    │  图片路径   │    │  文件元数据  │    │  语音转文字  │  │    │
│  │  └─────────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘  │    │
│  └────────────────────────────┼───────────────────────────────────────────────┘    │
└───────────────────────────────┼────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           决策系统层 (Decision System)                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                      SmartDecisionService (智能决策服务)                      │    │
│  │                                                                              │    │
│  │  输入: { type: 'content_analysis', content: {...} }                          │    │
│  │                                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                    第1步: 内容类型识别                                  │    │    │
│  │  │                                                                       │    │    │
│  │  │   if (hasImage && userAsksAboutImage) {                               │    │    │
│  │  │       → 决策: 需要视觉识别                                             │    │    │
│  │  │       → action: "route_to_vision"                                     │    │    │
│  │  │       → priority: "immediate"                                         │    │    │
│  │  │   }                                                                   │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  │                              │                                              │    │
│  │                              ▼                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                    第2步: 情感 & 上下文分析                              │    │    │
│  │  │                                                                       │    │    │
│  │  │   EmotionalIntelligence.analyzeMood()                                 │    │    │
│  │  │   → 检测紧急程度、用户情绪、信任级别                                     │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  │                              │                                              │    │
│  │                              ▼                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                    第3步: 路由决策                                      │    │    │
│  │  │                                                                       │    │    │
│  │  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │    │
│  │  │   │  route_to_   │  │ route_to_    │  │ route_to_    │              │    │    │
│  │  │   │  vision      │  │ llm          │  │ tool         │              │    │    │
│  │  │   │  (视觉系统)   │  │ (语言模型)    │  │ (工具调用)    │              │    │    │
│  │  │   └──────────────┘  └──────────────┘  └──────────────┘              │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   视觉系统分支    │   │   LLM 分支      │   │   工具分支      │
│  (Vision Branch)│   │  (LLM Branch)   │   │  (Tool Branch)  │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         ▼                     ▼                     ▼
```

## 2. 图片请求处理详细流程

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         图片请求识别 & 路由流程                                        │
└─────────────────────────────────────────────────────────────────────────────────────┘

用户发送图片 + 文字:
┌──────────────────────────────────────┐
│ [图片: screenshot.png]               │
│ "这个按钮是什么意思？"               │
│ "提取这段文字"                       │
│ "分析这个UI界面"                     │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 1. 输入检测层                         │
│    - 检测到图片附件                   │
│    - 提取图片路径/URL                 │
│    - 保存到临时目录                   │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 2. 意图识别层                         │
│                                      │
│  分析用户文字中的关键词:              │
│  - "提取文字" → taskType: "ocr"      │
│  - "按钮/界面/UI" → taskType: "ui"   │
│  - "代码" → taskType: "code"         │
│  - 其他 → taskType: "describe"       │
│                                      │
│  如果没有文字 → 默认 "describe"      │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 3. 决策系统路由                       │
│                                      │
│  DecisionRequest {                   │
│    type: "content_analysis"          │
│    content: {                        │
│      hasImage: true                  │
│      imagePath: "/tmp/xxx.png"       │
│      userQuery: "这个按钮是什么"     │
│      suggestedTask: "ui"             │
│    }                                 │
│  }                                   │
│                                      │
│  → SmartDecisionService.decide()     │
│  → 返回: route_to_vision             │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 4. 视觉系统处理                       │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ VisionModelEngine              │  │
│  │                                │  │
│  │ if (!loaded) {                 │  │
│  │   loadModel() // 按需加载      │  │
│  │   ~5-10秒                      │  │
│  │ }                              │  │
│  │                                │  │
│  │ analyzeImage({                 │  │
│  │   imagePath,                   │  │
│  │   taskType: "ui"               │  │
│  │ })                             │  │
│  │                                │  │
│  │ → 返回图片描述文本             │  │
│  └────────────────────────────────┘  │
│                                      │
│  视觉识别结果:                        │
│  "这是一个设置页面的截图。            │
│   主要元素包括:                       │
│   - 返回按钮 (左上角)                │
│   - 标题: '设置'                     │
│   - 开关: '通知' (当前开启)          │
│   - 输入框: '用户名'                 │
│   - 保存按钮 (右下角蓝色)"           │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 5. 结果整合 & 回复生成                │
│                                      │
│  将视觉识别结果 + 用户问题            │
│  一起发送给主 LLM 生成最终回复        │
│                                      │
│  Context:                            │
│  [图片识别结果]                       │
│  用户问题: "这个按钮是什么意思？"     │
│                                      │
│  LLM 生成回复:                        │
│  "根据截图，这个按钮是'保存'按钮，    │
│   位于右下角，蓝色背景。              │
│   点击后会保存您的设置更改。"         │
└──────────────────────────────────────┘
```

## 3. 决策系统判断逻辑

```typescript
// 决策系统识别图片请求的核心逻辑
class ContentRouterDecision {
  
  decideRoute(request: ContentRequest): RouteDecision {
    const { content, userQuery, context } = request;
    
    // 条件1: 包含图片文件
    const hasImage = content.attachments?.some(
      a => a.type === 'image' || a.mimeType?.startsWith('image/')
    );
    
    // 条件2: 用户提到了图片
    const mentionsImage = /\b(图|图片|截图|界面|按钮|文字|识别|提取)\b/.test(userQuery);
    
    // 条件3: 图片相关的意图
    const imageIntents = [
      { pattern: /提取.*文字|OCR|文字识别/, task: 'ocr' },
      { pattern: /界面|UI|按钮|布局|元素/, task: 'ui' },
      { pattern: /代码|代码截图|程序/, task: 'code' },
    ];
    
    const matchedIntent = imageIntents.find(i => i.pattern.test(userQuery));
    
    // 决策逻辑
    if (hasImage && (mentionsImage || matchedIntent)) {
      return {
        route: 'vision',
        taskType: matchedIntent?.task || 'describe',
        priority: 'high',
        reasoning: '用户上传了图片并询问图片内容'
      };
    }
    
    // 其他路由...
    return { route: 'llm', priority: 'normal' };
  }
}
```

## 4. 视觉系统按需加载流程

```
┌───────────────────────────────────────────────────────────────┐
│                    视觉系统生命周期                             │
└───────────────────────────────────────────────────────────────┘

  系统启动
     │
     ▼
┌─────────────────┐
│ 初始化 Vision   │  ← 只创建引擎实例，不加载模型
│ Model Engine    │
│ (空载状态)      │
└────────┬────────┘
         │
         │    用户请求图片分析
         │    ┌─────────────────────────┐
         └───►│ analyzeImage() 被调用   │
              └───────────┬─────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │ 检查模型是否已加载?      │
              └───────────┬─────────────┘
                          │
              ┌───────────┴───────────┐
              │ 是                    │ 否
              ▼                       ▼
      ┌───────────────┐      ┌─────────────────┐
      │ 直接使用现有   │      │ 加载模型到 GPU  │
      │ 模型推理      │      │                 │
      │               │      │ • 加载 int4.gguf│
      │ ~500ms-2s     │      │ • 加载 mmproj   │
      │               │      │ • 创建上下文    │
      └───────┬───────┘      │                 │
              │              │ ~5-10秒         │
              │              └────────┬────────┘
              │                       │
              └───────────┬───────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │ 执行图片分析推理         │
              │                         │
              │ • 加载图片              │
              │ • 构建 prompt           │
              │ • 生成描述              │
              └───────────┬─────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │ 返回分析结果            │
              │ 启动空闲定时器          │
              │ (5分钟后卸载)           │
              └─────────────────────────┘
                          │
                          │   5分钟无新请求
                          │   ┌─────────────┐
                          └──►│ 自动卸载模型 │
                              │ 释放 GPU 显存│
                              └─────────────┘
```

## 5. 整体调用链

```
用户发送图片消息
    │
    ▼
┌─────────────────────────────┐
│ Gateway (消息网关)          │
│ - 接收消息                  │
│ - 解析附件                  │
│ - 保存图片到临时目录        │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Agent (智能体核心)          │
│ - 构建消息上下文            │
│ - 检测图片附件              │
│ - 触发决策流程              │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Decision System (决策系统)  │
│ - SmartDecisionService      │
│   - 识别图片意图            │
│   - 决策: route_to_vision   │
│   - 确定 taskType           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Vision System (视觉系统)    │
│ - VisionModelEngine         │
│   - 按需加载模型            │
│   - 分析图片                │
│   - 返回描述文本            │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ LLM (主语言模型)            │
│ - 接收视觉识别结果          │
│ - 结合用户问题              │
│ - 生成最终回复              │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Output (输出层)             │
│ - 格式化回复                │
│ - 发送给用户                │
└─────────────────────────────┘
```

## 6. 关键代码集成点

### 6.1 决策系统新增图片路由决策

```typescript
// src/cognitive-core/decision/DecisionModelEngine.ts

// 新增决策类型
export interface ImageAnalysisDecisionRequest {
  type: "image_analysis";
  imagePath: string;
  userQuery?: string;
  context?: {
    hasTextReference: boolean;
    mentionedKeywords: string[];
  };
}

// 在 DecisionModelEngine 中处理图片决策
async decideImageAnalysis(
  request: ImageAnalysisDecisionRequest,
  context: RichDecisionContext
): Promise<DecisionResponse> {
  // 分析用户意图，确定 taskType
  const taskType = this.inferImageTaskType(request.userQuery);
  
  return {
    decisionId: generateId(),
    decision: {
      action: "analyze_image",
      allow: true,
      requireConfirm: false,
      taskType,  // 'describe' | 'ocr' | 'ui' | 'code'
      routeTo: "vision_system"
    },
    confidence: 0.95,
    reasoning: `检测到图片分析请求，任务类型: ${taskType}`
  };
}

private inferImageTaskType(query?: string): string {
  if (!query) return "describe";
  
  if (/提取.*文字|OCR|文字识别|文本/i.test(query)) return "ocr";
  if (/界面|UI|按钮|布局|元素|组件/i.test(query)) return "ui";
  if (/代码|程序|函数|类/i.test(query)) return "code";
  
  return "describe";
}
```

### 6.2 NSEMFusionCore 整合流程

```typescript
// src/cognitive-core/NSEMFusionCore.ts

export class NSEMFusionCore {
  
  // 处理用户消息（包含可能的图片）
  async processUserMessage(message: UserMessage): Promise<ProcessResult> {
    const { text, attachments } = message;
    
    // 1. 检查是否有图片
    const imageAttachments = attachments?.filter(
      a => a.type === 'image'
    );
    
    if (imageAttachments && imageAttachments.length > 0) {
      // 2. 决策系统判断如何处理图片
      const decision = await this.smartDecisionService.decide({
        type: "image_analysis",
        imagePath: imageAttachments[0].path,
        userQuery: text,
      });
      
      // 3. 如果决策是路由到视觉系统
      if (decision.decision.routeTo === "vision_system") {
        const taskType = decision.decision.taskType as ImageTaskType;
        
        // 4. 调用视觉系统
        const visionResult = await this.analyzeImage({
          imagePath: imageAttachments[0].path,
          taskType,
        });
        
        // 5. 将视觉结果整合到上下文
        return {
          ...visionResult,
          routedThrough: "vision_system"
        };
      }
    }
    
    // 非图片消息走正常流程
    return this.processTextMessage(text);
  }
}
```

### 6.3 智能体工具集成

```typescript
// src/agents/nsemclaw-tools.ts

// 本地视觉工具已集成
const localVisionTool = createLocalVisionTool();

// 工具执行时自动路由到视觉系统
{
  name: "local_vision",
  execute: async (params) => {
    const engine = getVisionModelEngine();
    
    // 按需加载
    await engine.loadModel();
    
    // 分析图片
    const result = await engine.analyzeImage({
      imagePath: params.imagePath,
      taskType: params.task,
    });
    
    return result;
  }
}
```

## 7. 配置说明

```bash
# 启用图片路由决策
export NSEM_ENABLE_IMAGE_ROUTING=true

# 启用工具决策（包含视觉工具）
export NSEM_ENABLE_TOOL_DECISION=true

# 视觉模型空闲超时（毫秒）
export NSEM_VISION_IDLE_TIMEOUT=300000  # 5分钟
```

## 8. 状态监控

```typescript
// 获取视觉系统状态
const status = fusionCore.getStatus();

console.log(status.vision);
// {
//   available: true,      // 模型是否已安装
//   loaded: true,         // 是否已加载到 GPU
//   idleTime: 120000      // 已空闲时间（ms）
// }
```
