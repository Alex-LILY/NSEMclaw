---
summary: "Uninstall Nsemclaw completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Nsemclaw from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `nsemclaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
nsemclaw uninstall
```

Non-interactive (automation / npx):

```bash
nsemclaw uninstall --all --yes --non-interactive
npx -y nsemclaw uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
nsemclaw gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
nsemclaw gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${NSEMCLAW_STATE_DIR:-$HOME/.nsemclaw}"
```

If you set `NSEMCLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.nsemclaw/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g nsemclaw
pnpm remove -g nsemclaw
bun remove -g nsemclaw
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Nsemclaw.app
```

Notes:

- If you used profiles (`--profile` / `NSEMCLAW_PROFILE`), repeat step 3 for each state dir (defaults are `~/.nsemclaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `nsemclaw` is missing.

### macOS (launchd)

Default label is `ai.nsemclaw.gateway` (or `ai.nsemclaw.<profile>`; legacy `com.nsemclaw.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.nsemclaw.gateway
rm -f ~/Library/LaunchAgents/ai.nsemclaw.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.nsemclaw.<profile>`. Remove any legacy `com.nsemclaw.*` plists if present.

### Linux (systemd user unit)

Default unit name is `nsemclaw-gateway.service` (or `nsemclaw-gateway-<profile>.service`):

```bash
systemctl --user disable --now nsemclaw-gateway.service
rm -f ~/.config/systemd/user/nsemclaw-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Nsemclaw Gateway` (or `Nsemclaw Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Nsemclaw Gateway"
Remove-Item -Force "$env:USERPROFILE\.nsemclaw\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.nsemclaw-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://nsemclaw.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g nsemclaw@latest`.
Remove it with `npm rm -g nsemclaw` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `nsemclaw ...` / `bun run nsemclaw ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
