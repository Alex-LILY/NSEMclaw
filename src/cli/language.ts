/**
 * 语言切换模块
 * 支持 CLI 和 TUI 的语言切换
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 支持的语言
export const SUPPORTED_LANGUAGES = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  "ja-JP": "日本語",
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

// 语言配置文件路径
const LANG_CONFIG_FILE = join(homedir(), ".nsemclaw", "language.json");

// 默认语言
export const DEFAULT_LANGUAGE: SupportedLanguage = "zh-CN";

// 语言配置接口
interface LanguageConfig {
  current: SupportedLanguage;
}

/**
 * 获取当前语言设置
 */
export function getCurrentLanguage(): SupportedLanguage {
  try {
    if (existsSync(LANG_CONFIG_FILE)) {
      const config: LanguageConfig = JSON.parse(readFileSync(LANG_CONFIG_FILE, "utf-8"));
      if (config.current in SUPPORTED_LANGUAGES) {
        return config.current;
      }
    }
  } catch {
    // 忽略错误，使用默认语言
  }
  return DEFAULT_LANGUAGE;
}

/**
 * 设置当前语言
 */
export function setLanguage(lang: SupportedLanguage): void {
  if (!(lang in SUPPORTED_LANGUAGES)) {
    throw new Error(
      `不支持的语言: ${lang}。支持的语言: ${Object.keys(SUPPORTED_LANGUAGES).join(", ")}`,
    );
  }

  const config: LanguageConfig = { current: lang };
  writeFileSync(LANG_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * 列出所有支持的语言
 */
export function listLanguages(): { code: SupportedLanguage; name: string }[] {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
    code: code as SupportedLanguage,
    name,
  }));
}

/**
 * 获取语言的显示名称
 */
export function getLanguageName(lang: SupportedLanguage): string {
  return SUPPORTED_LANGUAGES[lang] || lang;
}

/**
 * 检查是否支持某种语言
 */
export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return lang in SUPPORTED_LANGUAGES;
}

/**
 * 从环境变量获取语言
 */
export function getLanguageFromEnv(): SupportedLanguage | null {
  const envLang = process.env.NSEMCLAW_LANG || process.env.LANG;
  if (!envLang) return null;

  // 处理类似 zh_CN.UTF-8 的格式
  const normalized = envLang.split(".")[0].replace("_", "-");

  if (isLanguageSupported(normalized)) {
    return normalized;
  }

  // 尝试匹配语言前缀
  for (const lang of Object.keys(SUPPORTED_LANGUAGES)) {
    if (normalized.startsWith(lang.split("-")[0])) {
      return lang as SupportedLanguage;
    }
  }

  return null;
}

/**
 * 初始化语言设置
 * 优先级: 配置文件 > 环境变量 > 默认
 */
export function initLanguage(): SupportedLanguage {
  const envLang = getLanguageFromEnv();
  if (envLang) {
    return envLang;
  }
  return getCurrentLanguage();
}

export default {
  getCurrentLanguage,
  setLanguage,
  listLanguages,
  getLanguageName,
  isLanguageSupported,
  getLanguageFromEnv,
  initLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
};
