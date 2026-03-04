/**
 * 安全与权限控制模块
 * 
 * 实现多租户权限模型，与 OpenViking 对齐
 */

export {
  Role,
  UserIdentifier,
  RequestContext,
  PermissionChecker,
  PermissionError,
  createRequestContext,
  createRootContext,
  createDefaultContext,
} from "./RequestContext.js";

export type { } from "./RequestContext.js";
