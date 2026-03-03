---
title: Sandbox CLI
summary: "Manage sandbox containers and inspect effective sandbox policy"
read_when: "You are managing sandbox containers or debugging sandbox/tool-policy behavior."
status: active
---

# Sandbox CLI

Manage Docker-based sandbox containers for isolated agent execution.

## Overview

Nsemclaw can run agents in isolated Docker containers for security. The `sandbox` commands help you manage these containers, especially after updates or configuration changes.

## Commands

### `nsemclaw sandbox explain`

Inspect the **effective** sandbox mode/scope/workspace access, sandbox tool policy, and elevated gates (with fix-it config key paths).

```bash
nsemclaw sandbox explain
nsemclaw sandbox explain --session agent:main:main
nsemclaw sandbox explain --agent work
nsemclaw sandbox explain --json
```

### `nsemclaw sandbox list`

List all sandbox containers with their status and configuration.

```bash
nsemclaw sandbox list
nsemclaw sandbox list --browser  # List only browser containers
nsemclaw sandbox list --json     # JSON output
```

**Output includes:**

- Container name and status (running/stopped)
- Docker image and whether it matches config
- Age (time since creation)
- Idle time (time since last use)
- Associated session/agent

### `nsemclaw sandbox recreate`

Remove sandbox containers to force recreation with updated images/config.

```bash
nsemclaw sandbox recreate --all                # Recreate all containers
nsemclaw sandbox recreate --session main       # Specific session
nsemclaw sandbox recreate --agent mybot        # Specific agent
nsemclaw sandbox recreate --browser            # Only browser containers
nsemclaw sandbox recreate --all --force        # Skip confirmation
```

**Options:**

- `--all`: Recreate all sandbox containers
- `--session <key>`: Recreate container for specific session
- `--agent <id>`: Recreate containers for specific agent
- `--browser`: Only recreate browser containers
- `--force`: Skip confirmation prompt

**Important:** Containers are automatically recreated when the agent is next used.

## Use Cases

### After updating Docker images

```bash
# Pull new image
docker pull nsemclaw-sandbox:latest
docker tag nsemclaw-sandbox:latest nsemclaw-sandbox:bookworm-slim

# Update config to use new image
# Edit config: agents.defaults.sandbox.docker.image (or agents.list[].sandbox.docker.image)

# Recreate containers
nsemclaw sandbox recreate --all
```

### After changing sandbox configuration

```bash
# Edit config: agents.defaults.sandbox.* (or agents.list[].sandbox.*)

# Recreate to apply new config
nsemclaw sandbox recreate --all
```

### After changing setupCommand

```bash
nsemclaw sandbox recreate --all
# or just one agent:
nsemclaw sandbox recreate --agent family
```

### For a specific agent only

```bash
# Update only one agent's containers
nsemclaw sandbox recreate --agent alfred
```

## Why is this needed?

**Problem:** When you update sandbox Docker images or configuration:

- Existing containers continue running with old settings
- Containers are only pruned after 24h of inactivity
- Regularly-used agents keep old containers running indefinitely

**Solution:** Use `nsemclaw sandbox recreate` to force removal of old containers. They'll be recreated automatically with current settings when next needed.

Tip: prefer `nsemclaw sandbox recreate` over manual `docker rm`. It uses the
Gateway’s container naming and avoids mismatches when scope/session keys change.

## Configuration

Sandbox settings live in `~/.nsemclaw/nsemclaw.json` under `agents.defaults.sandbox` (per-agent overrides go in `agents.list[].sandbox`):

```jsonc
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all", // off, non-main, all
        "scope": "agent", // session, agent, shared
        "docker": {
          "image": "nsemclaw-sandbox:bookworm-slim",
          "containerPrefix": "nsemclaw-sbx-",
          // ... more Docker options
        },
        "prune": {
          "idleHours": 24, // Auto-prune after 24h idle
          "maxAgeDays": 7, // Auto-prune after 7 days
        },
      },
    },
  },
}
```

## See Also

- [Sandbox Documentation](/gateway/sandboxing)
- [Agent Configuration](/concepts/agent-workspace)
- [Doctor Command](/gateway/doctor) - Check sandbox setup
