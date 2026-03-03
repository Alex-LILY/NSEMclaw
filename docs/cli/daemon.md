---
summary: "CLI reference for `nsemclaw daemon` (legacy alias for gateway service management)"
read_when:
  - You still use `nsemclaw daemon ...` in scripts
  - You need service lifecycle commands (install/start/stop/restart/status)
title: "daemon"
---

# `nsemclaw daemon`

Legacy alias for Gateway service management commands.

`nsemclaw daemon ...` maps to the same service control surface as `nsemclaw gateway ...` service commands.

## Usage

```bash
nsemclaw daemon status
nsemclaw daemon install
nsemclaw daemon start
nsemclaw daemon stop
nsemclaw daemon restart
nsemclaw daemon uninstall
```

## Subcommands

- `status`: show service install state and probe Gateway health
- `install`: install service (`launchd`/`systemd`/`schtasks`)
- `uninstall`: remove service
- `start`: start service
- `stop`: stop service
- `restart`: restart service

## Common options

- `status`: `--url`, `--token`, `--password`, `--timeout`, `--no-probe`, `--deep`, `--json`
- `install`: `--port`, `--runtime <node|bun>`, `--token`, `--force`, `--json`
- lifecycle (`uninstall|start|stop|restart`): `--json`

## Prefer

Use [`nsemclaw gateway`](/cli/gateway) for current docs and examples.
