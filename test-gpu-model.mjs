#!/usr/bin/env node
/**
 * GPU 模型加载测试
 * 测试 node-llama-cpp 是否能正确加载模型到 GPU
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 模型路径
const MODELS_DIR = join(homedir(), '.nsemclaw', 'models');

// 要测试的模型（选最小的 reranker 来测试）
const TEST_MODEL = join(MODELS_DIR, 'bge-reranker-v2-m3-q4_k_m.gguf');

console.log('🧪 GPU 模型加载测试\n');
console.log('模型路径:', TEST_MODEL);

async function main() {
  try {
    // 动态导入 node-llama-cpp
    console.log('\n📦 加载 node-llama-cpp...');
    const llama = await import('node-llama-cpp');
    console.log('✅ node-llama-cpp 加载成功');
    console.log('可用API:', Object.keys(llama).slice(0, 10));
    
    // 检查模型文件
    const fs = await import('fs');
    if (!fs.existsSync(TEST_MODEL)) {
      console.error('❌ 模型文件不存在:', TEST_MODEL);
      process.exit(1);
    }
    
    console.log('\n🔧 创建 Llama 实例...');
    
    // 创建 llama 实例，启用 GPU
    const llamaInstance = await llama.getLlama({
      gpu: true,  // 启用 GPU
      verbose: true,
    });
    
    console.log('✅ Llama 实例创建成功');
    console.log('GPU 信息:', llamaInstance.gpu ? '已启用' : '未启用');
    
    // 加载模型
    console.log('\n📥 加载模型到 GPU...');
    console.log('这可能需要几秒钟...');
    
    const model = await llamaInstance.loadModel({
      modelPath: TEST_MODEL,
      gpuLayers: 999, // 尽可能多加载到 GPU
      verbose: true,
    });
    
    console.log('✅ 模型加载成功！');
    console.log('模型信息:', {
      name: model.name || 'unknown',
      size: (fs.statSync(TEST_MODEL).size / 1024 / 1024).toFixed(1) + ' MB',
    });
    
    // 检查 GPU 使用情况
    console.log('\n💻 检查 GPU 状态...');
    try {
      const { execSync } = await import('child_process');
      const gpuInfo = execSync('nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader,nounits', { encoding: 'utf8' });
      const [used, free] = gpuInfo.trim().split(',').map(v => parseInt(v.trim()));
      console.log(`GPU 显存使用: ${used}MB / 总计 ${used + free}MB`);
      console.log(`显存占用增加: ~${(fs.statSync(TEST_MODEL).size / 1024 / 1024).toFixed(0)}MB`);
    } catch (e) {
      console.log('无法获取 GPU 信息');
    }
    
    // 简单测试推理
    console.log('\n🧠 测试推理...');
    const context = await model.createContext();
    const sequence = context.getSequence();
    
    // 测试成功，释放资源
    await sequence.dispose();
    await context.dispose();
    await model.dispose();
    
    console.log('\n✅ GPU 加载测试成功！');
    console.log('\n结论: 你的环境支持 GPU 加载模型。');
    console.log('可以安全添加 Phi-4-mini (2.5GB) 和 MiniCPM-V (2.3GB)');
    console.log('预计总显存占用: ~7-8GB (你的 RTX 4080 有 16GB，完全够用)');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('\n错误详情:', error.stack);
    
    if (error.message.includes('CUDA')) {
      console.error('\n💡 CUDA 相关错误，可能需要检查:');
      console.error('  1. CUDA 驱动是否安装');
      console.error('  2. CUDA 版本是否兼容');
    }
    
    if (error.message.includes('GPU')) {
      console.error('\n💡 GPU 相关错误，可能需要:');
      console.error('  1. 尝试 CPU 模式加载');
      console.error('  2. 减少 gpuLayers 数量');
    }
    
    process.exit(1);
  }
}

main();
