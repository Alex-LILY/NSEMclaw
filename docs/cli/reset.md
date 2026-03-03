---
summary: "CLI reference for `nsemclaw reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `nsemclaw reset`

Reset local config/state (keeps the CLI installed).

```bash
nsemclaw reset
nsemclaw reset --dry-run
nsemclaw reset --scope config+creds+sessions --yes --non-interactive
```
