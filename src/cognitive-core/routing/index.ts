/**
 * 内容路由模块
 * 
 * 负责智能路由用户请求到合适的处理系统
 */

export {
  ContentRouter,
  createContentRouter,
  getContentRouter,
  resetContentRouter,
} from "./ContentRouter.js";

export type {
  UserMessage,
  Attachment,
  RoutingDecision,
  ContentRoutingResult,
} from "./ContentRouter.js";
