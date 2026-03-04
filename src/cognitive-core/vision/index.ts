/**
 * 视觉理解模块 (Vision Understanding Module)
 * 
 * 使用本地 VLM 模型 (Llava-Phi-3-mini-int4) 进行图片分析
 * 
 * 特点:
 * - 按需加载模型到 GPU
 * - 支持多种任务: 描述、OCR、UI分析、代码截图
 * - 空闲5分钟后自动卸载释放显存
 * 
 * 依赖:
 * - 模型文件: llava-phi-3-mini-int4.gguf + mmproj
 * - CLI 工具: llava-cli 或 llama-cli (需单独安装)
 */

export {
  VisionModelEngine,
  getVisionModelEngine,
  resetVisionModelEngine,
  type VisionModelConfig,
  type ImageAnalysisRequest,
  type ImageAnalysisResult,
} from "./VisionModelEngine.js";
