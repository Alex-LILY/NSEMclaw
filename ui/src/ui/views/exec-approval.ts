import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type { AppViewState } from "../app-view-state.ts";

function formatRemaining(ms: number): string {
  const remaining = Math.max(0, ms);
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds < 60) {
    return t("common.timeSeconds").replace("{count}", String(totalSeconds));
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return t("common.timeMinutes").replace("{count}", String(minutes));
  }
  const hours = Math.floor(minutes / 60);
  return t("common.timeHours").replace("{count}", String(hours));
}

function renderMetaRow(label: string, value?: string | null) {
  if (!value) {
    return nothing;
  }
  return html`<div class="exec-approval-meta-row"><span>${label}</span><span>${value}</span></div>`;
}

export function renderExecApprovalPrompt(state: AppViewState) {
  const active = state.execApprovalQueue[0];
  if (!active) {
    return nothing;
  }
  const request = active.request;
  const remainingMs = active.expiresAtMs - Date.now();
  const remaining =
    remainingMs > 0
      ? t("execApproval.expiresIn").replace("{time}", formatRemaining(remainingMs))
      : t("execApproval.expired");
  const queueCount = state.execApprovalQueue.length;
  return html`
    <div class="exec-approval-overlay" role="dialog" aria-live="polite">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">${t("execApproval.title")}</div>
            <div class="exec-approval-sub">${remaining}</div>
          </div>
          ${
            queueCount > 1
              ? html`<div class="exec-approval-queue">${queueCount} ${t("execApproval.pending")}</div>`
              : nothing
          }
        </div>
        <div class="exec-approval-command mono">${request.command}</div>
        <div class="exec-approval-meta">
          ${renderMetaRow(t("execApproval.host"), request.host)}
          ${renderMetaRow(t("execApproval.agent"), request.agentId)}
          ${renderMetaRow(t("execApproval.session"), request.sessionKey)}
          ${renderMetaRow(t("execApproval.cwd"), request.cwd)}
          ${renderMetaRow(t("execApproval.resolved"), request.resolvedPath)}
          ${renderMetaRow(t("execApproval.security"), request.security)}
          ${renderMetaRow(t("execApproval.ask"), request.ask)}
        </div>
        ${
          state.execApprovalError
            ? html`<div class="exec-approval-error">${state.execApprovalError}</div>`
            : nothing
        }
        <div class="exec-approval-actions">
          <button
            class="btn primary"
            ?disabled=${state.execApprovalBusy}
            @click=${() => state.handleExecApprovalDecision("allow-once")}
          >
            ${t("execApproval.allowOnce")}
          </button>
          <button
            class="btn"
            ?disabled=${state.execApprovalBusy}
            @click=${() => state.handleExecApprovalDecision("allow-always")}
          >
            ${t("execApproval.allowAlways")}
          </button>
          <button
            class="btn danger"
            ?disabled=${state.execApprovalBusy}
            @click=${() => state.handleExecApprovalDecision("deny")}
          >
            ${t("execApproval.deny")}
          </button>
        </div>
      </div>
    </div>
  `;
}
