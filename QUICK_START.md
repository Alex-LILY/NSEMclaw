# Unified Core V2 快速开始

## ⚡ 三步启用

### 第 1 步：添加配置

编辑 `nsemclaw.config.json`：

```json
{
  "agents": {
    "defaults": {
      "unifiedCoreV2": {
        "enabled": true,
        "mode": "three-tier"
      }
    }
  }
}
```

### 第 2 步：验证集成

```bash
node test-unified-core-v2-integration.mjs
```

### 第 3 步：启动应用

```bash
npm start
```

## 🔧 三种模式

| 模式 | 配置 | 适用场景 |
|------|------|---------|
| `three-tier` | 只用新系统 | 全新部署 |
| `hybrid` | 新旧系统并存 | 渐进迁移 |
| `unified-nsem2` | 现有系统 + 新提取 | 最小改动 |

## 📊 验证结果

运行 `node test-unified-core-v2-integration.mjs` 后，你应该看到：

```
✅ 第 1 步: 文件存在性验证
   ✅ UnifiedCoreV2 核心
   ✅ search-manager 适配器
   ✅ search-manager.ts
   ...

✅ 第 2 步: search-manager.ts 修改验证
   ✅ UnifiedCoreV2Adapter 导入
   ✅ UNIFIED_CORE_V2_CACHE 缓存
   ...

✅ 所有检查通过！
```

## 🚀 快速测试

### 测试记忆存储

```typescript
// 在代码中获取管理器
const { manager } = await getMemorySearchManager({
  cfg: nsemclawConfig,
  agentId: "my-agent",
});

// 如果是 UnifiedCoreV2Adapter，可以使用新功能
if (manager && "ingest" in manager) {
  await manager.ingest("用户偏好 TypeScript", embedding);
}
```

### 测试会话提取

```typescript
// 开始会话
const sessionId = manager.startSession("user-123");

// 记录消息
manager.recordMessage(sessionId, { role: "user", content: "..." });
manager.recordMessage(sessionId, { role: "assistant", content: "..." });

// 结束会话（自动触发 8类提取）
await manager.endSession(sessionId);
```

## 📝 配置文件模板

### 最小配置

```json
{
  "agents": {
    "defaults": {
      "unifiedCoreV2": {
        "enabled": true,
        "mode": "three-tier"
      }
    }
  }
}
```

### 完整配置

```json
{
  "agents": {
    "defaults": {
      "unifiedCoreV2": {
        "enabled": true,
        "mode": "three-tier",
        "extraction": {
          "enabled": true,
          "sections": {
            "user": true,
            "agent": true,
            "tool": false
          }
        },
        "session": {
          "enabled": true,
          "maxMessages": 50
        }
      }
    },
    "list": [
      {
        "id": "special-agent",
        "unifiedCoreV2": {
          "mode": "hybrid"
        }
      }
    ]
  }
}
```

## 🔄 切换模式

### 切换到混合模式

```json
{
  "unifiedCoreV2": {
    "enabled": true,
    "mode": "hybrid"
  }
}
```

### 禁用新系统

```json
{
  "unifiedCoreV2": {
    "enabled": false
  }
}
```

## 🐛 故障排除

### 问题：找不到模块

**解决**：先编译 TypeScript
```bash
npx tsc --noEmit
```

### 问题：配置不生效

**检查**：确认配置格式正确
```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('./nsemclaw.config.json')).agents.defaults.unifiedCoreV2)"
```

### 问题：初始化失败

**查看日志**：搜索 `Unified Core V2` 相关日志
```bash
grep "Unified Core V2" logs/app.log
```

## 📚 相关文档

| 文档 | 内容 |
|------|------|
| `UNIFIED_CORE_V2_INTEGRATION_SUMMARY.md` | 集成总结 |
| `src/cognitive-core/FUSION_SOLUTION.md` | 融合方案详解 |
| `src/cognitive-core/WHY_THIS_IS_BETTER.md` | 对比说明 |
| `src/cognitive-core/example-usage.ts` | 代码示例 |

## ✨ 一键启用脚本

```bash
# 1. 备份配置
cp nsemclaw.config.json nsemclaw.config.json.bak

# 2. 添加 Unified Core V2 配置
jq '.agents.defaults.unifiedCoreV2 = {"enabled": true, "mode": "three-tier"}' nsemclaw.config.json > tmp.json && mv tmp.json nsemclaw.config.json

# 3. 验证
node test-unified-core-v2-integration.mjs

# 4. 启动
npm start
```

## 🎯 验证清单

- [ ] 运行 `node test-unified-core-v2-integration.mjs` 通过
- [ ] 应用启动无错误
- [ ] 记忆搜索功能正常
- [ ] 会话结束触发记忆提取（如果启用）
- [ ] 日志中出现 `Unified Core V2 已启动`

---

**完成！** 🎉

Unified Core V2 现在应该已经集成到你的应用中了。
