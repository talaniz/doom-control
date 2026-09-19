# DOOM / Control Room

A private browser workspace for the existing Codex app server on **deathstar**. Forest green, brushed-steel colors, gold controls, and “ALL CAPS. FULL CONTROL.” bring the DOOM reference into a practical interface.

## Open it

- Home LAN: http://192.168.1.158:8787
- WireGuard: http://10.134.85.1:8787
- On the Pi: http://127.0.0.1:8787

Find your private login key on the Pi:

```sh
cat ~/doom-control-room/.private/access-key
```

Paste it into the login page. It stays out of URLs and browser storage; the session cookie is HttpOnly, SameSite=Strict and expires after 12 hours. “Lock room” invalidates the session. Keep `.private/` private. The server creates the key with mode 600 inside a mode-700 directory.

Use **New task** to choose a working directory and model, then send a prompt. Open existing tasks from the sidebar. Replies stream live; Stop interrupts the current turn. Command/file approvals require an explicit response. Question requests appear above the composer. Tool results and file diffs are expandable in the conversation. Unsupported specialized app-server requests fail explicitly and direct you to the desktop client.

## Network

The Node server binds only to the three IPv4 addresses in `config.json`, on port 8787. UFW allows that port only from `192.168.1.0/24` on `wlan0` and `10.134.85.0/24` on `wg0`. No public IPv6 listener or router forwarding was added. WireGuard clients must route `10.134.85.1` through the tunnel (for example an existing `AllowedIPs = 10.134.85.0/24` or full tunnel).

HTTP is appropriate here only on your trusted LAN or inside the encrypted WireGuard tunnel. Do not forward this port to the internet. The access key grants control of Codex as your Pi user. If the LAN address changes, update `config.json` and its matching UFW rule, then restart the service.

## Version control and fresh checkouts

The Git repository contains the source, dependency lockfile, tests, and `config.example.json`. `.private/`, local `config.json`, environment files, and dependencies are ignored. No OpenAI API key is embedded in the source; authentication to Codex belongs to the existing app-server daemon.

For a fresh checkout, copy `config.example.json` to `config.json`, replace `YOUR_USER` with the Pi username, and set the desired private bind addresses. The example listens only on localhost. Run `npm ci` and `npm start`; the first start creates a fresh access key in `.private/access-key`. Existing installations keep their current config and key. The systemd service described below is machine-local and must be configured separately on a new machine.

## Run and maintain

Node 22+, one pinned dependency (`ws`), no build step, no hosted service, and no additional OpenAI API key. The bridge uses the existing daemon's account and Unix socket. WebSocket compression must remain disabled for compatibility with the installed daemon.

```sh
cd ~/doom-control-room
npm ci
npm run check
npm test
systemctl --user restart doom-control-room
systemctl --user status doom-control-room
journalctl --user -u doom-control-room -n 40
```

The interface service is enabled at `/home/palpatine/.config/systemd/user/doom-control-room.service`; user lingering is enabled to keep it running after logout and start it at boot. It reconnects every three seconds if the app server disconnects. The existing app-server process is separate and was not restarted or replaced. If it is not running after a Pi reboot, start it with:

```sh
/home/palpatine/.local/bin/codex -c features.code_mode_host=true app-server --listen unix://
```

For a foreground interface run, first stop the service with `systemctl --user stop doom-control-room`, then run `npm start`. Restore it with `systemctl --user start doom-control-room`.

## Files

- `server.mjs`: authentication, HTTP/SSE bridge, restricted RPC methods, reconnects.
- `dist/index.html`, `dist/styles.css`, `dist/app.js`: responsive interface; all assets local.
- `config.example.json`: versioned configuration template.
- `config.json`: ignored local bind addresses, port, and app-server socket.
- `test/bridge.test.mjs`: isolated mock-daemon integration test for RPC, streaming, approvals, origin/Host protections, logout, throttling, and reconnects.

## Verification

On 2026-09-17, all three local addresses returned HTTP 200; unauthenticated API access returned 401 and cross-origin calls returned 403. The existing daemon returned real tasks and five models. An isolated real task completed the prompt `Reply with exactly: DOOM CONTROL ROOM ONLINE. Do not use tools or modify files.` with the expected reply. The bridge integration test and JavaScript syntax checks passed. UFW rules, service enablement, lingering, and key permissions were verified.

The user confirmed that the login page loads over off-network WireGuard. On 2026-09-18, the running service, access-key login, app-server connection, real task listing, and page responses on both private addresses were verified again. Browser rendering has not been visually tested. The optional, feature-detected WebMCP `open_codex_task` tool has no supported validation context here and is not claimed as verified.

Protocol references: https://learn.chatgpt.com/docs/app-server and schemas generated by the installed Codex 0.154.0 CLI.
