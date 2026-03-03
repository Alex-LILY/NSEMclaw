# 模型配置

Nsemclaw 支持多种 AI 模型提供商。

## 支持的提供商

- **Anthropic** (Claude)
- **OpenAI** (GPT)
- **Google** (Gemini)
- **Ollama** (本地模型)
- **AWS Bedrock**
- **Azure OpenAI**
- **Cohere**
- **Mistral**

## 配置示例

### Anthropic Claude

```json
{
  "models": {
    "default": "anthropic/claude-4",
    "profiles": ["fast", "coding", "creative"]
  }
}
```

### 模型回退

配置模型失败时的自动回退：

```json
{
  "models": {
    "default": "anthropic/claude-4",
    "fallbacks": ["openai/gpt-5", "google/gemini-2.5-pro"]
  }
}
```

## 认证配置

### API 密钥

```bash
nsemclaw auth profile add anthropic --key YOUR_API_KEY
```

### OAuth

支持通过 OAuth 连接到：

- OpenAI
- Anthropic
- Google

## 模型选择策略

1. **默认模型**: 用于大多数对话
2. **快速模型**: 用于简单任务
3. **代码模型**: 用于编程任务
4. **创意模型**: 用于生成任务

## 成本优化

- 使用 `cache: true` 启用提示缓存
- 配置 `maxTokens` 限制响应长度
- 设置 `thinking: "low"` 减少推理开销
