# QMD 快速配置指南

## 一键开启 QMD

我们提供了三个脚本来快速配置 QMD：

### 方法 1: Shell 脚本（推荐）

```bash
# 轻量模式 - 仅 BM25，内存占用最低 (~100MB)
./scripts/qmd-quick-setup.sh lite

# 平衡模式 - BM25 + 向量搜索 (~500MB)
./scripts/qmd-quick-setup.sh balanced

# 完整模式 - NSEM + QMD 混合，最高召回率 (~1GB+)
./scripts/qmd-quick-setup.sh full
```

### 方法 2: Node.js 脚本

```bash
# 查看当前状态
node ./scripts/memory-backend.mjs status

# 切换到不同后端
node ./scripts/memory-backend.mjs qmd      # QMD only
node ./scripts/memory-backend.mjs nsem     # NSEM only
node ./scripts/memory-backend.mjs hybrid   # NSEM + QMD
node ./scripts/memory-backend.mjs builtin  # Builtin only
```

### 方法 3: 手动配置

编辑 `nsemclaw.json`：

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "backend": "qmd",
        "qmd": {
          "command": "qmd",
          "searchMode": "search",
          "mcporter": {
            "enabled": true,
            "serverName": "qmd"
          }
        }
      }
    }
  }
}
```

## 配置后重启

```bash
# 停止网关
nsemclaw stop

# 启动网关
nsemclaw start

# 检查状态
nsemclaw memory status

# 构建索引（首次）
nsemclaw memory index --force
```

## 模式对比

| 模式 | 后端 | 搜索能力 | 内存占用 | 适合场景 |
|------|------|---------|---------|---------|
| **lite** | QMD | BM25 | ~100MB | 低内存设备 |
| **balanced** | QMD | BM25 + 向量 | ~500MB | 日常使用 |
| **full** | NSEM+QMD | 全部 | ~1GB+ | 最高质量 |

## 故障排除

### QMD 未安装

```bash
# 安装 qmd
npm install -g qmd

# 或者使用 Homebrew
brew install qmd
```

### mcporter 未安装（可选）

```bash
npm install -g @nakleiderer/mcporter
```

### 模型下载失败

检查网络连接，或手动下载模型到 `~/.nsemclaw/models/`。
