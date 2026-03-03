/**
 * Nsemclaw 进化系统
 *
 * ⚠️ 弃用警告: 此模块已迁移到 cognitive-core
 *
 * 迁移路径:
 *   - evolution/memory/*     → cognitive-core/mind/*
 *   - evolution/adapter/*    → cognitive-core/integration/*
 *   - 类型定义              → cognitive-core/types/*
 *
 * 请使用新的导入路径:
 *   import { NSEM2Core } from "nsemclaw/cognitive-core";
 */

// 转发到 cognitive-core
export * from "../cognitive-core/index.js";

// 发出弃用警告 (开发模式下)
if (process.env.NODE_ENV !== "production") {
  console.warn(
    "[DEPRECATED] evolution/ module is deprecated. " + "Please use cognitive-core/ instead.",
  );
}
