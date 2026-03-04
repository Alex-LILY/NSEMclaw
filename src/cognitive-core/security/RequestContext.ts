/**
 * 请求上下文与权限控制
 * 
 * 参考 OpenViking 的 identity.py 和 viking_fs.py
 * 实现多租户权限模型
 */

import { createHash } from "crypto";

// ============================================================================
// 角色定义
// ============================================================================

/**
 * 用户角色枚举
 */
export enum Role {
  /** 根用户 - 无限制访问 */
  ROOT = "root",
  /** 管理员 */
  ADMIN = "admin",
  /** 普通用户 */
  USER = "user",
}

// ============================================================================
// 用户标识符
// ============================================================================

/**
 * 用户标识符
 * 
 * 对应 OpenViking 的 UserIdentifier
 */
export class UserIdentifier {
  private _accountId: string;
  private _userId: string;
  private _agentId: string;

  constructor(accountId: string, userId: string, agentId: string) {
    this._accountId = accountId;
    this._userId = userId;
    this._agentId = agentId;

    const error = this._validateError();
    if (error) {
      throw new Error(error);
    }
  }

  /**
   * 创建默认用户
   */
  static createDefault(defaultUsername: string = "default"): UserIdentifier {
    return new UserIdentifier("default", defaultUsername, "default");
  }

  /**
   * 从对象创建
   */
  static fromObject(data: { accountId: string; userId: string; agentId: string }): UserIdentifier {
    return new UserIdentifier(data.accountId, data.userId, data.agentId);
  }

  private _validateError(): string | null {
    const pattern = /^[a-zA-Z0-9_-]+$/;
    
    if (!this._accountId) return "account_id is empty";
    if (!pattern.test(this._accountId)) return "account_id must be alpha-numeric string";
    if (!this._userId) return "user_id is empty";
    if (!pattern.test(this._userId)) return "user_id must be alpha-numeric string";
    if (!this._agentId) return "agent_id is empty";
    if (!pattern.test(this._agentId)) return "agent_id must be alpha-numeric string";
    
    return null;
  }

  get accountId(): string { return this._accountId; }
  get userId(): string { return this._userId; }
  get agentId(): string { return this._agentId; }

  /**
   * 用户空间名称
   */
  userSpaceName(): string {
    return this._userId;
  }

  /**
   * 代理空间名称
   * 使用 MD5 哈希生成 (与 OpenViking 一致)
   */
  agentSpaceName(): string {
    const hash = createHash("md5")
      .update(this._userId + this._agentId)
      .digest("hex");
    return hash.slice(0, 12);
  }

  /**
   * 记忆空间 URI
   */
  memorySpaceUri(): string {
    return `viking://agent/${this.agentSpaceName()}/memories`;
  }

  /**
   * 工作空间 URI
   */
  workSpaceUri(): string {
    return `viking://agent/${this.agentSpaceName()}/workspaces`;
  }

  /**
   * 技能空间 URI
   */
  skillSpaceUri(): string {
    return `viking://agent/${this.agentSpaceName()}/skills`;
  }

  toObject(): { accountId: string; userId: string; agentId: string } {
    return {
      accountId: this._accountId,
      userId: this._userId,
      agentId: this._agentId,
    };
  }

  toString(): string {
    return `${this._accountId}:${this._userId}:${this._agentId}`;
  }

  equals(other: UserIdentifier): boolean {
    return (
      this._accountId === other._accountId &&
      this._userId === other._userId &&
      this._agentId === other._agentId
    );
  }
}

// ============================================================================
// 请求上下文
// ============================================================================

/**
 * 请求上下文
 * 
 * 对应 OpenViking 的 RequestContext
 * 贯穿 Router -> Service -> Storage 的请求级上下文
 */
export class RequestContext {
  constructor(
    public readonly user: UserIdentifier,
    public readonly role: Role
  ) {}

  get accountId(): string {
    return this.user.accountId;
  }

  /**
   * 检查是否是根用户
   */
  isRoot(): boolean {
    return this.role === Role.ROOT;
  }

  /**
   * 检查是否是管理员
   */
  isAdmin(): boolean {
    return this.role === Role.ADMIN || this.role === Role.ROOT;
  }

  /**
   * 创建副本（修改角色）
   */
  withRole(role: Role): RequestContext {
    return new RequestContext(this.user, role);
  }

  /**
   * 创建副本（修改用户）
   */
  withUser(user: UserIdentifier): RequestContext {
    return new RequestContext(user, this.role);
  }

  toString(): string {
    return `RequestContext(user=${this.user.toString()}, role=${this.role})`;
  }
}

// ============================================================================
// 权限检查器
// ============================================================================

/**
 * 权限检查器
 * 
 * 对应 OpenViking 的 VikingFS._is_accessible 和 _ensure_access
 */
export class PermissionChecker {
  /**
   * 检查 URI 是否可访问
   * 
   * @param uri - 要检查的 URI
   * @param ctx - 请求上下文
   * @returns 是否可访问
   */
  static isAccessible(uri: string, ctx: RequestContext): boolean {
    // ROOT 用户无限制访问
    if (ctx.role === Role.ROOT) {
      return true;
    }

    // 非 viking:// 协议拒绝访问
    if (!uri.startsWith("viking://")) {
      return false;
    }

    // 解析 URI 路径
    const path = uri.slice("viking://".length).replace(/^\/+/, "");
    const parts = path.split("/").filter(p => p);

    if (parts.length === 0) {
      return true;
    }

    const scope = parts[0];

    // 公共资源
    if (["resources", "temp", "transactions"].includes(scope)) {
      return true;
    }

    // 系统资源禁止访问
    if (scope === "_system") {
      return false;
    }

    // 提取空间标识
    const space = this.extractSpaceFromUri(uri);
    if (space === null) {
      return true;
    }

    // 用户空间检查
    if (scope === "user" || scope === "session") {
      return space === ctx.user.userSpaceName();
    }

    // 代理空间检查
    if (scope === "agent") {
      return space === ctx.user.agentSpaceName();
    }

    return true;
  }

  /**
   * 确保可以访问 URI，否则抛出权限错误
   */
  static ensureAccess(uri: string, ctx: RequestContext): void {
    if (!this.isAccessible(uri, ctx)) {
      throw new PermissionError(`Access denied for ${uri}`);
    }
  }

  /**
   * 批量检查访问权限
   */
  static filterAccessible(uris: string[], ctx: RequestContext): string[] {
    return uris.filter(uri => this.isAccessible(uri, ctx));
  }

  /**
   * 从 URI 提取空间标识
   * 
   * viking://user/{space}/... -> space
   * viking://agent/{space}/... -> space
   */
  private static extractSpaceFromUri(uri: string): string | null {
    const match = uri.match(/^viking:\/\/(user|agent)\/([^/]+)/);
    return match ? match[2] : null;
  }

  /**
   * 获取用户可以访问的根 URI 列表
   * 
   * 对应 OpenViking 的 _get_root_uris_for_type
   */
  static getAccessibleRootUris(
    ctx: RequestContext,
    contextType?: "memory" | "resource" | "skill" | null
  ): string[] {
    // ROOT 用户可以访问所有空间
    if (ctx.role === Role.ROOT) {
      return [];
    }

    const userSpace = ctx.user.userSpaceName();
    const agentSpace = ctx.user.agentSpaceName();

    // 无特定类型时返回所有可访问空间
    if (!contextType) {
      return [
        `viking://user/${userSpace}/memories`,
        `viking://agent/${agentSpace}/memories`,
        "viking://resources",
        `viking://agent/${agentSpace}/skills`,
      ];
    }

    switch (contextType) {
      case "memory":
        return [
          `viking://user/${userSpace}/memories`,
          `viking://agent/${agentSpace}/memories`,
        ];
      case "resource":
        return ["viking://resources"];
      case "skill":
        return [`viking://agent/${agentSpace}/skills`];
      default:
        return [];
    }
  }
}

// ============================================================================
// 权限错误
// ============================================================================

/**
 * 权限错误
 */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建请求上下文
 */
export function createRequestContext(
  user: UserIdentifier,
  role: Role = Role.USER
): RequestContext {
  return new RequestContext(user, role);
}

/**
 * 创建根用户上下文
 */
export function createRootContext(accountId: string = "root"): RequestContext {
  return new RequestContext(
    new UserIdentifier(accountId, "root", "root"),
    Role.ROOT
  );
}

/**
 * 创建默认上下文
 */
export function createDefaultContext(): RequestContext {
  return new RequestContext(
    UserIdentifier.createDefault(),
    Role.USER
  );
}
