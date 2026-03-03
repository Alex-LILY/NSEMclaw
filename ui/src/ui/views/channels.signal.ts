import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { SignalStatus } from "../types.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import type { ChannelsProps } from "./channels.types.ts";

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channels.signal.title")}</div>
      <div class="card-sub">${t("channels.signal.description")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channels.configured")}</span>
          <span>${signal?.configured ? "Yes" : "No"}</span>
        </div>
        <div>
          <span class="label">${t("channels.running")}</span>
          <span>${signal?.running ? "Yes" : "No"}</span>
        </div>
        <div>
          <span class="label">${t("channels.baseUrl")}</span>
          <span>${signal?.baseUrl ?? "n/a"}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastStart")}</span>
          <span>${signal?.lastStartAt ? formatRelativeTimestamp(signal.lastStartAt) : "n/a"}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastProbe")}</span>
          <span>${signal?.lastProbeAt ? formatRelativeTimestamp(signal.lastProbeAt) : "n/a"}</span>
        </div>
      </div>

      ${
        signal?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${signal.lastError}
          </div>`
          : nothing
      }

      ${
        signal?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            Probe ${signal.probe.ok ? "ok" : "failed"} ·
            ${signal.probe.status ?? ""} ${signal.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "signal", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          Probe
        </button>
      </div>
    </div>
  `;
}
