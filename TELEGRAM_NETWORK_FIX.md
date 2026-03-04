# Telegram 网络问题修复报告

## 🔴 问题诊断

### 根本原因
1. **IPv6 连接超时** - 系统尝试使用 IPv6 连接 Telegram API 失败
2. **IPv4 延迟高** - IPv4 连接需要 1300ms+，超过默认超时时间
3. **默认超时太短** - Grammy 默认超时无法应对高延迟网络

### 诊断结果
```
✅ IPv4 可访问 (1301ms)
❌ IPv6 失败: Timeout
```

---

## ✅ 已执行的修复

### 1. 增加 Telegram 超时时间

**修改文件:** `~/.nsemclaw/nsemclaw.json`

```json
"channels": {
  "telegram": {
    "timeoutSeconds": 60
  }
}
```

### 2. 创建 IPv4 优先启动脚本

**创建文件:** `start-with-ipv4.sh`

```bash
export NODE_OPTIONS="--dns-result-order=ipv4first"
```

### 3. 修复 QMD Collections

**已修复:**
- `workspace-all` - 26 个文件已索引
- `sessions-main` - 10 个文件已索引

---

## 🚀 后续使用建议

### 方法 1: 使用 IPv4 优先启动 (推荐)

```bash
./start-with-ipv4.sh
```

### 方法 2: 手动设置环境变量后启动

```bash
export NODE_OPTIONS="--dns-result-order=ipv4first"
pnpm start
```

### 方法 3: 添加到系统配置

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
echo 'export NODE_OPTIONS="--dns-result-order=ipv4first"' >> ~/.bashrc
```

---

## 📊 修复效果验证

### 修复前
```
[telegram] command sync failed: Network request failed
[telegram] deleteWebhook failed: Network request failed
```

### 修复后 (预期)
```
[telegram] ✅ command sync successful
[telegram] ✅ webhook configured
```

---

## 🛡️ 预防措施

### 1. 监控网络延迟

```bash
# 定期检查 Telegram API 延迟
ping -c 3 api.telegram.org
```

### 2. 日志监控

```bash
# 监控 Telegram 错误
tail -f ~/.nsemclaw/logs/nsemclaw.log | grep -i "telegram.*error\|telegram.*fail"
```

### 3. 自动重启

```bash
# 创建监控脚本 ~/.nsemclaw/monitor.sh
#!/bin/bash
if ! pgrep -f "nsemclaw" > /dev/null; then
    echo "$(date): NSEMclaw 未运行，重新启动..."
    cd ~/Nsemclaw && ./start-with-ipv4.sh
fi
```

---

## 📝 总结

| 问题 | 修复前 | 修复后 |
|------|--------|--------|
| Telegram API 连接 | IPv6 超时，IPv4 延迟 1300ms | IPv4 优先，超时 60 秒 |
| QMD Collections | workspace-all 损坏 | 已重建，26 个文件 |
| 网络配置 | 默认 | IPv4 优先 + 60秒超时 |

**核心问题:** IPv6 网络不通 + 高延迟网络环境
**解决方案:** 强制 IPv4 + 增加超时时间
