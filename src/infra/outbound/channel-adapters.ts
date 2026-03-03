import type { ChannelId } from "../../channels/plugins/types.js";

export type ChannelMessageAdapter = {
  supportsComponentsV2: boolean;
};

const DEFAULT_ADAPTER: ChannelMessageAdapter = {
  supportsComponentsV2: false,
};

export function getChannelMessageAdapter(_channel: ChannelId): ChannelMessageAdapter {
  return DEFAULT_ADAPTER;
}
