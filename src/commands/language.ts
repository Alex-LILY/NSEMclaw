/**
 * language 命令 - 切换界面语言
 */

// @ts-expect-error - Module may not exist
import { defineCommand } from "../cli/core.js";
import {
  getCurrentLanguage,
  setLanguage,
  listLanguages,
  getLanguageName,
  isLanguageSupported,
  type SupportedLanguage,
} from "../cli/language.js";
// @ts-expect-error - Runtime may not be exported
import { runtime } from "../logging.js";

export const command = defineCommand({
  name: "language",
  description: "切换界面语言 / Switch UI language",
  args: {
    lang: {
      type: "positional",
      description: "语言代码 (zh-CN/zh-TW/en/ja-JP)",
      required: false,
    },
    list: {
      type: "flag",
      description: "列出所有支持的语言",
      short: "l",
    },
  },
  async run({ args }: { args: { list?: boolean; lang?: string } }) {
    // 列出所有语言
    if (args.list) {
      runtime.log("支持的语言 / Supported languages:");
      runtime.log("");
      const current = getCurrentLanguage();

      for (const { code, name } of listLanguages()) {
        const marker = code === current ? " → " : "   ";
        runtime.log(`${marker}${code.padEnd(8)} ${name}`);
      }
      runtime.log("");
      runtime.log(`当前语言 / Current: ${getLanguageName(current)} (${current})`);
      return;
    }

    // 显示当前语言
    if (!args.lang) {
      const current = getCurrentLanguage();
      runtime.log(`当前语言 / Current language: ${getLanguageName(current)} (${current})`);
      runtime.log("");
      runtime.log("使用 'nsemclaw language <lang>' 切换语言");
      runtime.log("Use 'nsemclaw language --list' to see all supported languages");
      return;
    }

    // 切换语言
    const lang = args.lang as SupportedLanguage;

    if (!isLanguageSupported(lang)) {
      runtime.error(`不支持的语言: ${lang}`);
      runtime.error("");
      runtime.error("支持的语言 / Supported languages:");
      for (const { code, name } of listLanguages()) {
        runtime.error(`  ${code.padEnd(8)} ${name}`);
      }
      process.exit(1);
    }

    setLanguage(lang);
    runtime.log(`✓ 语言已切换 / Language switched: ${getLanguageName(lang)} (${lang})`);
    runtime.log("");
    runtime.log("重新启动 Nsemclaw 以应用新语言设置。");
    runtime.log("Restart Nsemclaw to apply the new language setting.");
  },
});

export default command;
