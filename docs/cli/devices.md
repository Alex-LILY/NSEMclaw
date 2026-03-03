---
summary: "CLI reference for `nsemclaw devices` (device pairing + token rotation/revocation)"
read_when:
  - You are approving device pairing requests
  - You need to rotate or revoke device tokens
title: "devices"
---

# `nsemclaw devices`

Manage device pairing requests and device-scoped tokens.

## Commands

### `nsemclaw devices list`

List pending pairing requests and paired devices.

```
nsemclaw devices list
nsemclaw devices list --json
```

### `nsemclaw devices remove <deviceId>`

Remove one paired device entry.

```
nsemclaw devices remove <deviceId>
nsemclaw devices remove <deviceId> --json
```

### `nsemclaw devices clear --yes [--pending]`

Clear paired devices in bulk.

```
nsemclaw devices clear --yes
nsemclaw devices clear --yes --pending
nsemclaw devices clear --yes --pending --json
```

### `nsemclaw devices approve [requestId] [--latest]`

Approve a pending device pairing request. If `requestId` is omitted, Nsemclaw
automatically approves the most recent pending request.

```
nsemclaw devices approve
nsemclaw devices approve <requestId>
nsemclaw devices approve --latest
```

### `nsemclaw devices reject <requestId>`

Reject a pending device pairing request.

```
nsemclaw devices reject <requestId>
```

### `nsemclaw devices rotate --device <id> --role <role> [--scope <scope...>]`

Rotate a device token for a specific role (optionally updating scopes).

```
nsemclaw devices rotate --device <deviceId> --role operator --scope operator.read --scope operator.write
```

### `nsemclaw devices revoke --device <id> --role <role>`

Revoke a device token for a specific role.

```
nsemclaw devices revoke --device <deviceId> --role node
```

## Common options

- `--url <url>`: Gateway WebSocket URL (defaults to `gateway.remote.url` when configured).
- `--token <token>`: Gateway token (if required).
- `--password <password>`: Gateway password (password auth).
- `--timeout <ms>`: RPC timeout.
- `--json`: JSON output (recommended for scripting).

Note: when you set `--url`, the CLI does not fall back to config or environment credentials.
Pass `--token` or `--password` explicitly. Missing explicit credentials is an error.

## Notes

- Token rotation returns a new token (sensitive). Treat it like a secret.
- These commands require `operator.pairing` (or `operator.admin`) scope.
- `devices clear` is intentionally gated by `--yes`.
- If pairing scope is unavailable on local loopback (and no explicit `--url` is passed), list/approve can use a local pairing fallback.
