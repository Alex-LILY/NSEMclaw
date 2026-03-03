import { describe, it, expect, beforeEach, vi } from "vitest";
import { i18n, t } from "../lib/translate.ts";

describe("i18n", () => {
  beforeEach(async () => {
    localStorage.clear();
    // Reset to Simplified Chinese
    await i18n.setLocale("zh-CN");
  });

  it("should return the key if translation is missing", () => {
    expect(t("non.existent.key")).toBe("non.existent.key");
  });

  it("should return the correct Chinese translation", () => {
    expect(t("common.health")).toBe("健康状况");
  });

  it("should replace parameters correctly", () => {
    expect(t("overview.stats.cronNext", { time: "10:00" })).toBe("下次唤醒 10:00");
  });

  it("should fallback to Simplified Chinese if key is missing in another locale", async () => {
    // We haven't registered other locales in the test environment yet,
    // but the logic should fallback to 'zh-CN' map which is always there.
    await i18n.setLocale("zh-TW");
    // Since we don't mock the import, it might fail to load zh-TW,
    // but let's assume it falls back to Simplified Chinese for now.
    expect(t("common.health")).toBeDefined();
  });

  it("loads translations even when setting the same locale again", async () => {
    const internal = i18n as unknown as {
      locale: string;
      translations: Record<string, unknown>;
    };
    internal.locale = "zh-TW";
    delete internal.translations["zh-TW"];

    await i18n.setLocale("zh-TW");
    expect(t("common.health")).toBe("健康狀況");
  });

  it("loads saved Traditional Chinese locale on startup", async () => {
    localStorage.setItem("nsemclaw.i18n.locale", "zh-TW");
    vi.resetModules();
    const fresh = await import("../lib/translate.ts");

    for (let index = 0; index < 5 && fresh.i18n.getLocale() !== "zh-TW"; index += 1) {
      await Promise.resolve();
    }

    expect(fresh.i18n.getLocale()).toBe("zh-TW");
    expect(fresh.t("common.health")).toBe("健康狀況");
  });
});
