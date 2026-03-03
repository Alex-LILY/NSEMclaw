import type { TranslationMap } from "../../ui/src/i18n/lib/types.ts";
import { zh_CN } from "../../ui/src/i18n/locales/zh-CN.ts";

type Locale = "zh-CN" | "zh-TW";

class TuiI18nManager {
  private locale: Locale = "zh-CN";
  private translations: Record<Locale, TranslationMap> = { "zh-CN": zh_CN } as Record<
    Locale,
    TranslationMap
  >;

  constructor() {
    this.locale = this.resolveLocale();
    // Load zh-TW if needed
    if (this.locale === "zh-TW") {
      void this.loadLocale("zh-TW");
    }
  }

  private resolveLocale(): Locale {
    // Check environment variable first
    const envLang = process.env.LANG || process.env.LC_ALL;
    if (envLang) {
      if (envLang.includes("zh_TW") || envLang.includes("zh-TW") || envLang.includes("zh_HK")) {
        return "zh-TW";
      }
      if (envLang.includes("zh")) {
        return "zh-CN";
      }
    }
    return "zh-CN";
  }

  private async loadLocale(locale: Locale) {
    if (this.translations[locale]) {
      return;
    }
    try {
      if (locale === "zh-TW") {
        const module = await import("../../ui/src/i18n/locales/zh-TW.ts");
        this.translations[locale] = module.zh_TW;
      }
    } catch (e) {
      // Fallback to zh-CN if loading fails
      console.error(`Failed to load locale: ${locale}`, e);
    }
  }

  public getLocale(): Locale {
    return this.locale;
  }

  public async setLocale(locale: Locale) {
    if (this.locale === locale) {
      return;
    }
    if (locale === "zh-TW") {
      await this.loadLocale(locale);
    }
    this.locale = locale;
  }

  public t(key: string, params?: Record<string, string>): string {
    const keys = key.split(".");
    let value: unknown = this.translations[this.locale] || this.translations["zh-CN"];

    for (const k of keys) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to zh-CN
    if (value === undefined && this.locale !== "zh-CN") {
      value = this.translations["zh-CN"];
      for (const k of keys) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`);
    }

    return value;
  }
}

const tuiI18n = new TuiI18nManager();

/**
 * Translate a key to the current locale.
 * Supports nested keys using dot notation (e.g., "tui.commands.help").
 * Supports parameter substitution with {key} syntax.
 */
export function t(key: string, params?: Record<string, string>): string {
  return tuiI18n.t(key, params);
}

export { tuiI18n };
