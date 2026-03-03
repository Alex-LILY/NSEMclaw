// 错误消息国际化模块
// 为所有错误消息提供统一的翻译支持

// @ts-expect-error Cannot find module
import { t } from "../ui/src/i18n/index.js";

// 错误消息映射表
const errorMessages: Record<string, string> = {
  // 通用错误
  "common.notFound": "未找到",
  "common.invalidInput": "无效输入",
  "common.unauthorized": "未授权",
  "common.forbidden": "禁止访问",
  "common.timeout": "请求超时",
  "common.networkError": "网络错误",
  "common.unknownError": "未知错误",
  "common.notImplemented": "功能未实现",

  // 网关错误
  "gateway.notConnected": "网关未连接",
  "gateway.connectionFailed": "网关连接失败",
  "gateway.timeout": "网关响应超时",
  "gateway.authFailed": "网关认证失败",

  // 代理错误
  "agent.notFound": "代理未找到",
  "agent.loadFailed": "加载代理失败",
  "agent.saveFailed": "保存代理失败",
  "agent.invalidConfig": "代理配置无效",

  // 会话错误
  "session.notFound": "会话未找到",
  "session.createFailed": "创建会话失败",
  "session.expired": "会话已过期",

  // 频道错误
  "channel.notConfigured": "频道未配置",
  "channel.connectionFailed": "频道连接失败",
  "channel.sendFailed": "发送消息失败",

  // 配置错误
  "config.loadFailed": "加载配置失败",
  "config.saveFailed": "保存配置失败",
  "config.invalid": "配置无效",
  "config.schemaError": "配置架构错误",

  // 技能错误
  "skill.notFound": "技能未找到",
  "skill.loadFailed": "加载技能失败",
  "skill.installFailed": "安装技能失败",

  // 模型错误
  "model.notFound": "模型未找到",
  "model.authFailed": "模型认证失败",
  "model.rateLimited": "模型请求频率受限",
  "model.invalidRequest": "模型请求无效",
};

// 获取翻译后的错误消息
export function getErrorMessage(key: string, params?: Record<string, string>): string {
  let message = errorMessages[key] || key;

  // 替换参数
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      message = message.replace(`{${k}}`, v);
    });
  }

  return message;
}

// 创建本地化的错误对象
export function createLocalizedError(key: string, params?: Record<string, string>): Error {
  return new Error(getErrorMessage(key, params));
}

// 导出错误消息键
export const ErrorKeys = {
  Common: {
    NOT_FOUND: "common.notFound",
    INVALID_INPUT: "common.invalidInput",
    UNAUTHORIZED: "common.unauthorized",
    FORBIDDEN: "common.forbidden",
    TIMEOUT: "common.timeout",
    NETWORK_ERROR: "common.networkError",
  },
  Gateway: {
    NOT_CONNECTED: "gateway.notConnected",
    CONNECTION_FAILED: "gateway.connectionFailed",
    TIMEOUT: "gateway.timeout",
    AUTH_FAILED: "gateway.authFailed",
  },
  Agent: {
    NOT_FOUND: "agent.notFound",
    LOAD_FAILED: "agent.loadFailed",
    SAVE_FAILED: "agent.saveFailed",
    INVALID_CONFIG: "agent.invalidConfig",
  },
  Session: {
    NOT_FOUND: "session.notFound",
    CREATE_FAILED: "session.createFailed",
    EXPIRED: "session.expired",
  },
  Channel: {
    NOT_CONFIGURED: "channel.notConfigured",
    CONNECTION_FAILED: "channel.connectionFailed",
    SEND_FAILED: "channel.sendFailed",
  },
  Config: {
    LOAD_FAILED: "config.loadFailed",
    SAVE_FAILED: "config.saveFailed",
    INVALID: "config.invalid",
    SCHEMA_ERROR: "config.schemaError",
  },
  Skill: {
    NOT_FOUND: "skill.notFound",
    LOAD_FAILED: "skill.loadFailed",
    INSTALL_FAILED: "skill.installFailed",
  },
  Model: {
    NOT_FOUND: "model.notFound",
    AUTH_FAILED: "model.authFailed",
    RATE_LIMITED: "model.rateLimited",
    INVALID_REQUEST: "model.invalidRequest",
  },
} as const;

export default errorMessages;
