---
summary: "CLI reference for `nsemclaw config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `nsemclaw config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `nsemclaw configure`).

## Examples

```bash
nsemclaw config get browser.executablePath
nsemclaw config set browser.executablePath "/usr/bin/google-chrome"
nsemclaw config set agents.defaults.heartbeat.every "2h"
nsemclaw config set agents.list[0].tools.exec.node "node-id-or-name"
nsemclaw config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
nsemclaw config get agents.defaults.workspace
nsemclaw config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
nsemclaw config get agents.list
nsemclaw config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--strict-json` to require JSON5 parsing. `--json` remains supported as a legacy alias.

```bash
nsemclaw config set agents.defaults.heartbeat.every "0m"
nsemclaw config set gateway.port 19001 --strict-json
nsemclaw config set channels.whatsapp.groups '["*"]' --strict-json
```

Restart the gateway after edits.
