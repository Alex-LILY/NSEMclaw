# 视觉系统集成总结

## 已完成的功能

### 1. 模型下载地址更新

| 模型 | 新下载地址 |
|------|-----------|
| **决策模型** | `https://huggingface.co/matrixportalx/Phi-4-mini-instruct-Q4_K_M-GGUF/resolve/main/phi-4-mini-instruct-q4_k_m.gguf` |
| **视觉模型** | `https://huggingface.co/xtuner/llava-phi-3-mini-gguf/resolve/main/llava-phi-3-mini-int4.gguf` |
| **MMPROJ** | `https://huggingface.co/xtuner/llava-phi-3-mini-gguf/resolve/main/mmproj-llava-phi-3-mini-f16.gguf` |

### 2. 核心组件

#### VisionModelEngine (`src/cognitive-core/vision/VisionModelEngine.ts`)
- **按需加载**: 只在需要时加载到 GPU
- **自动卸载**: 空闲 5 分钟后自动释放显存
- **多任务支持**: describe(描述)、ocr(文字提取)、ui(UI分析)、code(代码截图)
- **显存友好**: 不占用常驻显存，适合偶尔使用

#### NSEMFusionCore 集成
```typescript
// 获取核心状态 (包含视觉模型状态)
const status = core.getStatus();
console.log(status.vision);  // { available, loaded, idleTime }

// 分析图片
const result = await core.analyzeImage({
  imagePath: '/path/to/image.png',
  taskType: 'describe'  // 'describe' | 'ocr' | 'ui' | 'code'
});
console.log(result.description);
```

#### 本地视觉工具 (`src/mcp/tools/analyze-image.ts`)
智能体可以通过 `local_vision` 工具使用视觉功能：
```json
{
  "name": "local_vision",
  "parameters": {
    "imagePath": "/path/to/image.png",
    "task": "describe"  // 或 "ocr", "ui", "code"
  }
}
```

### 3. CLI 命令

```bash
# 查看所有本地模型状态
npx nsemclaw-cli local-model list

# 安装视觉模型套件 (vision + mmproj)
npx nsemclaw-cli local-model vision

# 查看状态
npx nsemclaw-cli local-model status

# 安装单个模型
npx nsemclaw-cli local-model download vision
npx nsemclaw-cli local-model download mmproj
npx nsemclaw-cli local-model download decision
```

### 4. 导出模块

构建后可以通过以下路径导入：
```typescript
// 视觉引擎
import { getVisionModelEngine } from './dist/cognitive-core/vision/index.js';

// 模型下载工具
import { NSEM_PREDEFINED_MODELS, downloadModel } from './dist/cognitive-core/utils/model-downloader.js';
```

## 显存使用估计

| 状态 | 显存占用 |
|------|---------|
| 视觉模型未加载 | 0 GB |
| 视觉模型加载中 | ~1.4 GB |
| 决策模型 (常驻) | ~2.4 GB |
| 嵌入模型 (常驻) | ~0.3 GB |
| Reranker (常驻) | ~0.4 GB |
| **总计 (视觉加载时)** | ~4.5 GB |
| **总计 (视觉未加载)** | ~3.1 GB |

## 使用流程

1. **安装模型** (一次性):
   ```bash
   npx nsemclaw-cli local-model vision
   ```

2. **系统初始化**:
   ```typescript
   const core = new NSEMFusionCore();
   await core.initialize();  // 视觉引擎初始化但不加载模型
   ```

3. **分析图片** (按需加载):
   ```typescript
   // 第一次调用会加载模型 (~5-10秒)
   const result = await core.analyzeImage({ imagePath: 'test.png', taskType: 'describe' });
   
   // 后续调用直接使用已加载模型 (~500ms-2s)
   const result2 = await core.analyzeImage({ imagePath: 'test2.png', taskType: 'ocr' });
   ```

4. **自动卸载**:
   - 5 分钟无活动后自动卸载释放显存

## 注意事项

- 视觉模型是 **理解图片** 而非生成图片
- int4 量化对于理解任务足够 (识别物体、文字、UI布局等)
- 需要同时下载 `vision` 和 `mmproj` 两个文件才能正常工作
