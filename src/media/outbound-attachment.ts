import { saveMediaBuffer } from "./store.js";

export async function resolveOutboundAttachmentFromUrl(
  _mediaUrl: string,
  maxBytes: number,
  _options?: { localRoots?: readonly string[] },
): Promise<{ path: string; contentType?: string }> {
  throw new Error("resolveOutboundAttachmentFromUrl is not supported in this build");
}
