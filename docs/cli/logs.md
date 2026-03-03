---
summary: "CLI reference for `nsemclaw logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `nsemclaw logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
nsemclaw logs
nsemclaw logs --follow
nsemclaw logs --json
nsemclaw logs --limit 500
nsemclaw logs --local-time
nsemclaw logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
