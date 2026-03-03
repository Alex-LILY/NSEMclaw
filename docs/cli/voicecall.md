---
summary: "CLI reference for `nsemclaw voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
title: "voicecall"
---

# `nsemclaw voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:

- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
nsemclaw voicecall status --call-id <id>
nsemclaw voicecall call --to "+15555550123" --message "Hello" --mode notify
nsemclaw voicecall continue --call-id <id> --message "Any questions?"
nsemclaw voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
nsemclaw voicecall expose --mode serve
nsemclaw voicecall expose --mode funnel
nsemclaw voicecall expose --mode off
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.
