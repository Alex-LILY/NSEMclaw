# NSEMclaw 深度自我排查指南

## 🔴 当前问题汇总

基于日志分析，发现以下问题：

### 1. QMD Collection 损坏 (高优先级)

**症状:**
```
qmd query failed: Collection not found: workspace-all
Pattern: 1/插件/screenshot-plugin/SKILL.md  (错误)
Files: 0
```

**原因:** `workspace-all` collection 的 pattern 被错误设置，导致无法索引文件

### 2. Telegram 命令同步失败 (中优先级)

**症状:**
```
command sync failed: HttpError: Network request for 'setMyCommands' failed!
```

**原因:** Telegram API 网络问题，不影响核心功能

---

## 🔧 修复步骤

### 步骤 1: 修复 QMD Collections

```bash
# 1. 先运行诊断脚本查看当前状态
node scripts/fix-qmd-collections.mjs

# 2. 执行修复
node scripts/fix-qmd-collections.mjs --fix
```

**手动修复 (如果脚本失败):**

```bash
# 删除损坏的 collection
qmd collection remove workspace-all
qmd collection remove sessions-main

# 重新创建
qmd collection add ~/.nsemclaw/workspace \
  --name workspace-all \
  --mask "**/*.md" \
  --chunk-size 800 \
  --chunk-overlap 100

qmd collection add ~/.nsemclaw/agents/main/qmd/sessions \
  --name sessions-main \
  --mask "**/*.md" \
  --chunk-size 800 \
  --chunk-overlap 100

# 验证
qmd collection list
```

### 步骤 2: 检查 Telegram 网络

```bash
# 运行诊断
node scripts/diagnose-telegram-commands.mjs

# 手动测试 API 连接
curl -v https://api.telegram.org/
```

**如果是代理问题:**

```bash
# 检查代理环境变量
echo $HTTP_PROXY
echo $HTTPS_PROXY

# 临时禁用代理测试
unset HTTP_PROXY
unset HTTPS_PROXY
```

### 步骤 3: 重启 NSEMclaw

```bash
# 完全停止
pkill -f nsemclaw

# 清除可能的锁文件
rm -f ~/.nsemclaw/*.lock

# 重新启动
pnpm start
```

---

## 📊 验证修复

### 验证 QMD

```bash
# 检查 collections 状态
qmd collection list

# 应该显示:
# workspace-all: pattern = **/*.md, files > 0
# sessions-main: pattern = **/*.md, files >= 0

# 测试查询
qmd query "测试" -c workspace-all --json -n 5
```

### 验证 Telegram

```bash
# 查看日志是否还有命令同步错误
tail -f ~/.nsemclaw/logs/nsemclaw.log | grep -i "command sync"
```

---

## 🔍 深度诊断命令

### 检查 NSEM 认知核心状态

```bash
# 检查记忆系统日志
tail -100 ~/.nsemclaw/logs/nsemclaw.log | grep -i "nsem\|memory\|fusion"

# 检查三层存储状态
tail -100 ~/.nsemclaw/logs/nsemclaw.log | grep -i "three-tier\|working\|short-term\|long-term"
```

### 检查 QMD 索引状态

```bash
# 查看所有 collections
qmd collection list --json | jq '.[] | {name, path, pattern, fileCount}'

# 检查索引数据库位置
ls -la ~/.nsemclaw/memory/

# 如果数据库损坏，可以重建:
rm -rf ~/.nsemclaw/memory/qmd
# 然后重启 NSEMclaw
```

### 检查模型文件

```bash
# 检查模型是否下载完整
ls -la ~/.nsemclaw/models/

# 检查模型文件大小 (如果为0或很小，需要重新下载)
find ~/.nsemclaw/models -name "*.gguf" -size -1M
```

---

## 🛡️ 预防措施

### 1. 定期备份配置

```bash
# 备份配置
cp ~/.nsemclaw/nsemclaw.json ~/.nsemclaw/nsemclaw.json.backup

# 备份记忆数据
tar czvf ~/nsemclaw-backup-$(date +%Y%m%d).tar.gz ~/.nsemclaw/workspace ~/.nsemclaw/memory
```

### 2. 监控日志

```bash
# 实时查看错误
journalctl -u nsemclaw -f 2>/dev/null || tail -f ~/.nsemclaw/logs/nsemclaw.log | grep -i error

# 查看特定模块日志
tail -f ~/.nsemclaw/logs/nsemclaw.log | grep -i "telegram\|memory\|qmd"
```

### 3. 自动修复脚本

创建 `~/.nsemclaw/health-check.sh`:

```bash
#!/bin/bash
# 健康检查脚本

# 检查 QMD collections
if ! qmd collection list | grep -q "workspace-all"; then
    echo "$(date): workspace-all collection missing, recreating..."
    qmd collection add ~/.nsemclaw/workspace --name workspace-all --mask "**/*.md"
fi

# 检查 NSEMclaw 进程
if ! pgrep -f "nsemclaw" > /dev/null; then
    echo "$(date): NSEMclaw not running, restarting..."
    cd ~/nsemclaw && pnpm start
fi
```

添加到 crontab:
```bash
*/5 * * * * ~/.nsemclaw/health-check.sh >> ~/.nsemclaw/health-check.log 2>&1
```

---

## 🆘 紧急恢复

如果系统完全无法启动:

```bash
# 1. 备份当前状态
mv ~/.nsemclaw ~/.nsemclaw.bak.$(date +%Y%m%d)

# 2. 重新初始化
mkdir -p ~/.nsemclaw

# 3. 从备份恢复关键配置
cp ~/.nsemclaw.bak.*/nsemclaw.json ~/.nsemclaw/ 2>/dev/null || echo "使用默认配置"

# 4. 重新启动
pnpm start
```

---

## 📞 获取更多帮助

如果以上步骤无法解决问题:

1. 收集完整日志: `tar czvf logs.tar.gz ~/.nsemclaw/logs/`
2. 检查系统状态: `uname -a`, `node -v`, `pnpm -v`
3. 查看最近的 Git 提交: `git log --oneline -10`
