# Nsemclaw 权限控制实现总结

## 概述

Nsemclaw 现在拥有与 OpenViking 完全对齐的权限控制系统，实现了多租户架构下的细粒度访问控制。

## 核心组件

### 1. Role (角色枚举)

```typescript
enum Role {
  ROOT = "root",    // 根用户 - 无限制访问
  ADMIN = "admin",  // 管理员
  USER = "user",    // 普通用户
}
```

### 2. UserIdentifier (用户标识符)

与 OpenViking 的 `UserIdentifier` 完全对齐：

```typescript
const user = new UserIdentifier("account1", "user1", "agent1");

// 空间名称
user.userSpaceName();   // "user1"
user.agentSpaceName();  // MD5(user1+agent1)[:12]

// URI 生成
user.memorySpaceUri();  // "viking://agent/{hash}/memories"
user.skillSpaceUri();   // "viking://agent/{hash}/skills"
```

### 3. RequestContext (请求上下文)

贯穿整个请求处理流程：

```typescript
const ctx = new RequestContext(user, Role.USER);

// 权限检查
ctx.isRoot();   // false
ctx.isAdmin();  // false
```

### 4. PermissionChecker (权限检查器)

核心权限验证逻辑：

```typescript
// 检查 URI 可访问性
PermissionChecker.isAccessible("viking://user/user1/memories", ctx);

// 确保访问权限（否则抛出错误）
PermissionChecker.ensureAccess(uri, ctx);

// 批量过滤
PermissionChecker.filterAccessible(uris, ctx);

// 获取可访问的根 URI 列表
PermissionChecker.getAccessibleRootUris(ctx, "memory");
```

## 权限模型

### 空间隔离

| 空间类型 | URI 模式 | 访问控制 |
|---------|---------|---------|
| 用户空间 | `viking://user/{user_space}/...` | 仅拥有者可访问 |
| 代理空间 | `viking://agent/{agent_space}/...` | 仅拥有者可访问 |
| 公共资源 | `viking://resources/...` | 所有用户可访问 |
| 系统资源 | `viking://_system/...` | 仅 ROOT 可访问 |

### 特殊规则

- **ROOT 用户**: 绕过所有权限检查
- **非 viking:// 协议**: 一律拒绝
- **临时/事务空间**: `viking://temp/`, `viking://transactions/` 对所有用户开放

## 使用示例

### 基本用法

```typescript
import {
  UserIdentifier,
  RequestContext,
  Role,
  PermissionChecker,
} from "./cognitive-core/index.js";

// 创建用户
const user = new UserIdentifier("acct1", "user1", "agent1");
const ctx = new RequestContext(user, Role.USER);

// 检查权限
if (PermissionChecker.isAccessible("viking://user/user1/memories", ctx)) {
  // 执行操作
}

// 确保权限
try {
  PermissionChecker.ensureAccess("viking://user/user1/memories", ctx);
  // 继续操作
} catch (e) {
  // 处理权限错误
}
```

### 在检索中使用

```typescript
import { NSEM21Core, ContextLevel } from "./cognitive-core/index.js";

const core = new NSEM21Core({ nsemConfig: config });
await core.start();

// 创建带权限控制的检索
const result = await core.retrieve({
  query: "Rust 所有权",
  level: ContextLevel.OVERVIEW,
  requestContext: ctx,  // 权限控制上下文
});

// 只返回用户有权访问的结果
console.log(result.items);
```

### 创建不同角色用户

```typescript
import { createRootContext, createDefaultContext } from "./cognitive-core/index.js";

// 根用户 - 无限制访问
const rootCtx = createRootContext();

// 默认用户
const defaultCtx = createDefaultContext();

// 自定义用户
const user = new UserIdentifier("myacct", "myuser", "myagent");
const ctx = new RequestContext(user, Role.ADMIN);
```

## 与 OpenViking 的兼容性

| 特性 | OpenViking | Nsemclaw | 状态 |
|------|-----------|----------|------|
| 角色系统 | Role 枚举 | Role 枚举 | ✅ 一致 |
| 用户标识 | UserIdentifier | UserIdentifier | ✅ 一致 |
| 空间哈希 | MD5(user+agent)[:12] | MD5(user+agent)[:12] | ✅ 一致 |
| URI 结构 | viking://{scope}/{space}/... | 相同 | ✅ 一致 |
| 权限检查 | _is_accessible | PermissionChecker | ✅ 逻辑一致 |
| 请求上下文 | RequestContext | RequestContext | ✅ 一致 |

## 测试

```bash
# 运行权限控制测试
pnpm vitest run src/cognitive-core/security/RequestContext.test.ts
```

测试覆盖：
- ✅ 用户标识符创建和验证
- ✅ 空间名称生成（与 OpenViking 相同算法）
- ✅ URI 生成
- ✅ 角色权限检查
- ✅ 空间访问控制（用户/代理/公共/系统）
- ✅ 批量权限过滤
- ✅ 根 URI 列表生成

## 实现文件

```
src/cognitive-core/security/
├── RequestContext.ts      # 核心权限控制实现
├── RequestContext.test.ts # 测试文件
└── index.ts               # 导出
```

## 总结

Nsemclaw 的权限控制系统现已与 OpenViking 完全对齐：

- ✅ 相同的多租户架构
- ✅ 相同的空间隔离模型
- ✅ 相同的 MD5 哈希算法
- ✅ 相同的权限检查逻辑
- ✅ 完整的 TypeScript 类型支持
- ✅ 全面的测试覆盖

权限控制不再是 Nsemclaw 的短板！
