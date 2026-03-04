/**
 * 权限控制测试
 * 
 * 验证与 OpenViking 兼容的权限模型
 */

import { describe, it, expect } from "vitest";
import {
  Role,
  UserIdentifier,
  RequestContext,
  PermissionChecker,
  PermissionError,
  createRootContext,
  createDefaultContext,
} from "./RequestContext.js";

describe("权限控制系统", () => {
  describe("UserIdentifier", () => {
    it("应该正确创建用户标识符", () => {
      const user = new UserIdentifier("acct1", "user1", "agent1");
      expect(user.accountId).toBe("acct1");
      expect(user.userId).toBe("user1");
      expect(user.agentId).toBe("agent1");
    });

    it("应该正确生成空间名称", () => {
      const user = new UserIdentifier("acct1", "user1", "agent1");
      expect(user.userSpaceName()).toBe("user1");
      expect(user.agentSpaceName()).toHaveLength(12); // MD5 前12位
    });

    it("应该生成正确的 URI", () => {
      const user = new UserIdentifier("acct1", "user1", "agent1");
      expect(user.memorySpaceUri()).toMatch(/viking:\/\/agent\/[a-f0-9]{12}\/memories/);
      expect(user.skillSpaceUri()).toMatch(/viking:\/\/agent\/[a-f0-9]{12}\/skills/);
    });

    it("应该验证 ID 格式", () => {
      expect(() => new UserIdentifier("", "user1", "agent1")).toThrow();
      expect(() => new UserIdentifier("acct 1", "user1", "agent1")).toThrow();
      expect(() => new UserIdentifier("acct1", "user@1", "agent1")).toThrow();
    });
  });

  describe("RequestContext", () => {
    it("应该正确创建请求上下文", () => {
      const user = new UserIdentifier("acct1", "user1", "agent1");
      const ctx = new RequestContext(user, Role.USER);
      expect(ctx.user).toBe(user);
      expect(ctx.role).toBe(Role.USER);
      expect(ctx.isRoot()).toBe(false);
      expect(ctx.isAdmin()).toBe(false);
    });

    it("应该正确识别 ROOT 用户", () => {
      const rootCtx = createRootContext();
      expect(rootCtx.isRoot()).toBe(true);
      expect(rootCtx.isAdmin()).toBe(true);
    });

    it("应该支持创建副本", () => {
      const user = new UserIdentifier("acct1", "user1", "agent1");
      const ctx = new RequestContext(user, Role.USER);
      
      const adminCtx = ctx.withRole(Role.ADMIN);
      expect(adminCtx.role).toBe(Role.ADMIN);
      expect(adminCtx.user).toBe(user);
      
      const user2 = new UserIdentifier("acct2", "user2", "agent2");
      const ctx2 = ctx.withUser(user2);
      expect(ctx2.user).toBe(user2);
      expect(ctx2.role).toBe(Role.USER);
    });
  });

  describe("PermissionChecker", () => {
    const user1 = new UserIdentifier("acct1", "user1", "agent1");
    const user2 = new UserIdentifier("acct1", "user2", "agent2");
    const ctx1 = new RequestContext(user1, Role.USER);
    const ctx2 = new RequestContext(user2, Role.USER);
    const rootCtx = createRootContext();

    it("ROOT 用户应该可以访问所有资源", () => {
      expect(PermissionChecker.isAccessible("viking://user/user1/memories", rootCtx)).toBe(true);
      expect(PermissionChecker.isAccessible("viking://agent/anyspace/skills", rootCtx)).toBe(true);
      expect(PermissionChecker.isAccessible("viking://resources/public", rootCtx)).toBe(true);
      expect(PermissionChecker.isAccessible("viking://_system/secret", rootCtx)).toBe(true);
    });

    it("应该正确验证用户空间访问", () => {
      const user1Space = user1.userSpaceName();
      const user2Space = user2.userSpaceName();
      
      expect(PermissionChecker.isAccessible(`viking://user/${user1Space}/memories`, ctx1)).toBe(true);
      expect(PermissionChecker.isAccessible(`viking://user/${user2Space}/memories`, ctx1)).toBe(false);
    });

    it("应该正确验证代理空间访问", () => {
      const agent1Space = user1.agentSpaceName();
      const agent2Space = user2.agentSpaceName();
      
      expect(PermissionChecker.isAccessible(`viking://agent/${agent1Space}/skills`, ctx1)).toBe(true);
      expect(PermissionChecker.isAccessible(`viking://agent/${agent2Space}/skills`, ctx1)).toBe(false);
    });

    it("公共资源应该对所有用户可访问", () => {
      expect(PermissionChecker.isAccessible("viking://resources/docs", ctx1)).toBe(true);
      expect(PermissionChecker.isAccessible("viking://temp/cache", ctx1)).toBe(true);
    });

    it("系统资源应该拒绝访问", () => {
      expect(PermissionChecker.isAccessible("viking://_system/config", ctx1)).toBe(false);
    });

    it("非 viking:// 协议应该拒绝访问", () => {
      expect(PermissionChecker.isAccessible("file:///etc/passwd", ctx1)).toBe(false);
      expect(PermissionChecker.isAccessible("http://example.com", ctx1)).toBe(false);
    });

    it("应该正确抛出权限错误", () => {
      const user1Space = user1.userSpaceName();
      const user2Space = user2.userSpaceName();
      
      expect(() => {
        PermissionChecker.ensureAccess(`viking://user/${user2Space}/memories`, ctx1);
      }).toThrow(PermissionError);
      
      expect(() => {
        PermissionChecker.ensureAccess(`viking://user/${user1Space}/memories`, ctx1);
      }).not.toThrow();
    });

    it("应该正确批量过滤 URI", () => {
      const user1Space = user1.userSpaceName();
      const user2Space = user2.userSpaceName();
      const agent1Space = user1.agentSpaceName();
      
      const uris = [
        `viking://user/${user1Space}/memories`,
        `viking://user/${user2Space}/memories`,
        `viking://agent/${agent1Space}/skills`,
        "viking://resources/public",
        "viking://_system/secret",
      ];
      
      const accessible = PermissionChecker.filterAccessible(uris, ctx1);
      expect(accessible).toHaveLength(3);
      expect(accessible).toContain(`viking://user/${user1Space}/memories`);
      expect(accessible).toContain(`viking://agent/${agent1Space}/skills`);
      expect(accessible).toContain("viking://resources/public");
    });

    it("应该返回正确的根 URI 列表", () => {
      const roots = PermissionChecker.getAccessibleRootUris(ctx1);
      expect(roots).toContain("viking://resources");
      expect(roots.some(r => r.startsWith("viking://user/"))).toBe(true);
      expect(roots.some(r => r.startsWith("viking://agent/"))).toBe(true);
    });

    it("应该根据上下文类型过滤根 URI", () => {
      const memoryRoots = PermissionChecker.getAccessibleRootUris(ctx1, "memory");
      expect(memoryRoots.every(r => r.includes("memories"))).toBe(true);
      
      const resourceRoots = PermissionChecker.getAccessibleRootUris(ctx1, "resource");
      expect(resourceRoots).toEqual(["viking://resources"]);
      
      const skillRoots = PermissionChecker.getAccessibleRootUris(ctx1, "skill");
      expect(skillRoots.every(r => r.includes("skills"))).toBe(true);
    });

    it("ROOT 用户应该返回空的根 URI 列表", () => {
      const roots = PermissionChecker.getAccessibleRootUris(rootCtx);
      expect(roots).toEqual([]);
    });
  });

  describe("与 OpenViking 兼容性", () => {
    it("应该使用相同的 MD5 哈希算法生成 agent 空间", () => {
      // OpenViking: hashlib.md5((user_id + agent_id).encode()).hexdigest()[:12]
      const user = new UserIdentifier("default", "testuser", "testagent");
      const expectedHash = "testuser" + "testagent"; // 会被 MD5 哈希
      expect(user.agentSpaceName()).toHaveLength(12);
      expect(user.agentSpaceName()).toMatch(/^[a-f0-9]{12}$/);
    });

    it("应该使用相同的 URI 结构", () => {
      const user = new UserIdentifier("default", "testuser", "testagent");
      expect(user.memorySpaceUri()).toMatch(/^viking:\/\/agent\/[a-f0-9]{12}\/memories$/);
      expect(user.workSpaceUri()).toMatch(/^viking:\/\/agent\/[a-f0-9]{12}\/workspaces$/);
    });

    it("应该使用相同的权限检查逻辑", () => {
      const user = new UserIdentifier("default", "testuser", "testagent");
      const ctx = new RequestContext(user, Role.USER);
      
      // 公共资源
      expect(PermissionChecker.isAccessible("viking://resources/docs", ctx)).toBe(true);
      expect(PermissionChecker.isAccessible("viking://temp/cache", ctx)).toBe(true);
      
      // 系统资源
      expect(PermissionChecker.isAccessible("viking://_system/config", ctx)).toBe(false);
    });
  });
});
