# 路径解析和命令可用性修复总结

## 修复的问题列表

### 1. mcporter 未安装时崩溃 ✅ 已修复
**文件**: `src/memory/qmd-manager.ts`

**问题**: 当 `mcporter.enabled=true` 但 mcporter 未安装时，系统会尝试 spawn 不存在的命令，导致 ENOENT 错误。

**修复内容**:
- 新增 `isMcporterAvailable()` 方法检查 mcporter 是否安装
- 在搜索前检查 mcporter 可用性
- 如果 mcporter 配置启用但不可用，自动回退到直接 qmd 命令
- 只记录一次警告，避免日志刷屏

```typescript
// 修复前
const mcporterEnabled = this.qmd.mcporter.enabled;

// 修复后
const mcporterActuallyAvailable = this.qmd.mcporter.enabled 
  ? await this.isMcporterAvailable()
  : false;
const mcporterEnabled = this.qmd.mcporter.enabled && mcporterActuallyAvailable;
```

---

### 2. NSEM2Adapter.readFile 直接使用相对路径 ✅ 已修复
**文件**: `src/cognitive-core/integration/NSEM2Adapter.ts`

**问题**: `readFile` 直接使用 `params.relPath` 而不解析到绝对路径。

**修复内容**:
- 添加路径解析逻辑，将相对路径转换为基于 workspace 的绝对路径
- 添加 ENOENT 错误处理，返回空文本而不是抛出错误
- 正确处理 `from` 参数（1-based 转换为 0-based）

---

### 3. Docker spawn 无可用性检查 ✅ 已修复
**文件**: `src/agents/sandbox/docker.ts`

**问题**: 直接 spawn docker 命令，没有检查 docker 是否安装。

**修复内容**:
- 新增 `isDockerAvailable()` 函数检查 docker 可用性
- 在 spawn 前检查 docker 是否可用
- 添加 spawn 错误处理，捕获 ENOENT 错误
- 返回清晰的错误信息

---

### 4. SSH Tunnel spawn 无可用性检查 ✅ 已修复
**文件**: `src/infra/ssh-tunnel.ts`

**问题**: 直接 spawn `/usr/bin/ssh`，没有检查 ssh 是否安装。

**修复内容**:
- 新增 `isSshAvailable()` 函数检查 ssh 可用性
- 在 startSshPortForward 开始处检查 ssh 是否可用
- 添加 spawn 错误处理

---

### 5. NSEMFusionAdapter.readFile 路径问题 ✅ 已修复（之前）
**文件**: `src/memory/fusion/nsem-fusion-adapter.ts`

**问题**: 同 NSEM2Adapter，直接使用 `params.relPath`。

**修复内容**: 已在此前的修复中解决。

---

## 通用修复模式

### 模式 1: 命令可用性检查
```typescript
// 可用性缓存
let commandAvailable: boolean | null = null;
let checkPromise: Promise<boolean> | null = null;

async function isCommandAvailable(): Promise<boolean> {
  if (commandAvailable !== null) return commandAvailable;
  if (checkPromise) return checkPromise;
  
  checkPromise = new Promise((resolve) => {
    const child = spawn("command", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    setTimeout(() => { child.kill(); resolve(false); }, 5000);
  });
  
  return checkPromise;
}
```

### 模式 2: 路径解析
```typescript
let absPath: string;
if (path.isAbsolute(params.relPath)) {
  absPath = params.relPath;
} else {
  const workspaceDir = resolveAgentWorkspaceDir(config, agentId);
  absPath = path.resolve(workspaceDir, params.relPath);
}
```

### 模式 3: ENOENT 错误处理
```typescript
try {
  content = await fs.readFile(absPath, "utf-8");
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    return { text: "", path: params.relPath };
  }
  throw err;
}
```

---

## 测试建议

1. **mcporter 回退测试**:
   - 配置 `memory.qmd.mcporter.enabled=true`
   - 确保 mcporter 不在 PATH 中
   - 验证搜索功能仍然可用（回退到 qmd）

2. **路径解析测试**:
   - 使用相对路径调用 memory_get
   - 验证能从正确的 workspace 读取文件

3. **命令不可用测试**:
   - 在没有 docker/ssh 的环境中测试相关功能
   - 验证返回清晰的错误信息而不是崩溃

---

## 构建状态

✅ 所有修复已通过 TypeScript 编译检查
```bash
pnpm run build  # 成功
```
