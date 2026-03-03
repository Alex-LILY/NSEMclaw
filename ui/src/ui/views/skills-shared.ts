import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type { SkillStatusEntry } from "../types.ts";

export function computeSkillMissing(skill: SkillStatusEntry): string[] {
  return [
    ...skill.missing.bins.map((b) => `bin:${b}`),
    ...skill.missing.env.map((e) => `env:${e}`),
    ...skill.missing.config.map((c) => `config:${c}`),
    ...skill.missing.os.map((o) => `os:${o}`),
  ];
}

export function computeSkillReasons(skill: SkillStatusEntry): string[] {
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push(t("common.disabled"));
  }
  if (skill.blockedByAllowlist) {
    reasons.push(t("skills.blockedByAllowlist"));
  }
  return reasons;
}

export function renderSkillStatusChips(params: {
  skill: SkillStatusEntry;
  showBundledBadge?: boolean;
}) {
  const skill = params.skill;
  const showBundledBadge = Boolean(params.showBundledBadge);
  return html`
    <div class="chip-row" style="margin-top: 6px;">
      <span class="chip">${skill.source}</span>
      ${
        showBundledBadge
          ? html`
              <span class="chip">${t("skills.bundled")}</span>
            `
          : nothing
      }
      <span class="chip ${skill.eligible ? "chip-ok" : "chip-warn"}">
        ${skill.eligible ? t("skills.eligible") : t("skills.blocked")}
      </span>
      ${
        skill.disabled
          ? html`
              <span class="chip chip-warn">${t("common.disabled")}</span>
            `
          : nothing
      }
    </div>
  `;
}
