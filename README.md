# DOOM / Control Room

A private browser workspace for the existing Codex app server on **deathstar**. Forest green, brushed-steel colors, gold controls, and “ALL CAPS. FULL CONTROL.” bring the DOOM reference into a practical interface.

## Open it

- Home LAN: http://192.168.1.158:8787
- WireGuard: http://10.134.85.1:8787
- On the Pi: http://127.0.0.1:8787

Sign in with your username and password. Administrators can start/resume tasks,
send prompts, interrupt turns and respond to approval/question requests. Users have
read-only access to all tasks and live updates; opening a task uses `thread/read`
without resuming it. The server rejects every write RPC and approval response for
read-only sessions, even if someone bypasses the UI.

The account name and role appear in the sidebar. Session cookies are HttpOnly,
SameSite=Strict and expire after 12 hours. Sign out revokes that session and closes
its event stream. Restarting the bridge revokes all sessions. The old access key
is no longer accepted and is never automatically converted into an account.

Use **New task** to choose a working directory and model, then send a prompt. Open existing tasks from the sidebar. Replies stream live; Stop interrupts the current turn. DOOM uses **Approve for me** (`approvalPolicy: on-request`, `approvalsReviewer: auto_review`) for new tasks, resumed tasks, and prompts. The app server reviews eligible approval requests automatically while keeping the existing sandbox limits. Any requests still routed to the browser require your response. Question requests appear above the composer. Tool results and file diffs are expandable in the conversation. Unsupported specialized app-server requests fail explicitly and direct you to the desktop client.

## Network

The Node server binds only to the three IPv4 addresses in `config.json`, on port 8787. UFW allows that port only from `192.168.1.0/24` on `wlan0` and `10.134.85.0/24` on `wg0`. No public IPv6 listener or router forwarding was added. WireGuard clients must route `10.134.85.1` through the tunnel (for example an existing `AllowedIPs = 10.134.85.0/24` or full tunnel).

HTTP is appropriate here only on your trusted LAN or inside the encrypted WireGuard tunnel. Do not forward this port to the internet. An administrator account grants control of Codex as your Pi user; a user account can read all task content. There is no per-task ownership isolation. If the LAN address changes, update `config.json` and its matching UFW rule, then restart the service.

## Version control and fresh checkouts

The Git repository contains the source, dependency lockfile, tests, and `config.example.json`. `.private/`, local `config.json`, environment files, and dependencies are ignored. No OpenAI API key is embedded in the source; authentication to Codex belongs to the existing app-server daemon.

For a fresh checkout, copy `config.example.json` to `config.json`, replace `YOUR_USER` with the Pi username, and set the desired private bind addresses. The example listens only on localhost. Run `npm ci`, provision accounts as described below, then run `npm start`. Startup fails closed if the private users file is missing or invalid. Existing access-key installations require account provisioning before switching to this version. The systemd service described below is machine-local and must be configured separately on a new machine.

## Provision accounts

`npm run users:provision` reads a JSON array from standard input, with `username`,
`password`, and `role` (`admin` or `user`) per entry. It replaces the complete account
set atomically. At least one admin is required; duplicate names and invalid roles
are rejected. Usernames are case-sensitive. Use a private input file or pipe from a
password manager; never put real passwords in command arguments, shell history or Git.

```sh
# accounts.json must be outside Git, mode 600, and removed securely after use.
npm run users:provision < /private/path/accounts.json
```

The tool stores random-salted scrypt hashes in `.private/users.json` (mode 600, parent
700). `DOOM_STATE_DIR` may select a private state directory, with or without a trailing
slash. No default passwords are built into source. Restart the bridge after account,
password or role changes; the running process uses its startup snapshot until then.
This version uses local provisioning, not a browser account-management screen.

Migration/deployment: obtain deployment approval, back up the existing private state,
provision the intended users, install the reviewed code/dependencies, restart only the
DOOM bridge, and verify admin and read-only login. Existing sessions are invalidated.
The old ignored access-key file may remain for rollback but this version never reads it.
Do not restart or replace the shared app server. Rollback to the previous code and
restart the bridge restores its former key flow, provided its old key is retained.

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

- `server.mjs`: session authentication, role enforcement, HTTP/SSE bridge and reconnects.
- `auth.mjs`, `scripts/provision-users.mjs`: salted password verification and private account provisioning.
- `dist/index.html`, `dist/styles.css`, `dist/app.js`: responsive interface; all assets local.
- `config.example.json`: versioned configuration template.
- `config.json`: ignored local bind addresses, port, and app-server socket.
- `test/bridge.test.mjs`: isolated mock-daemon integration test for RPC, streaming, approvals, origin/Host protections, logout, throttling, and reconnects.

## Verification

On 2026-09-17, all three local addresses returned HTTP 200; unauthenticated API access returned 401 and cross-origin calls returned 403. The existing daemon returned real tasks and five models. An isolated real task completed the prompt `Reply with exactly: DOOM CONTROL ROOM ONLINE. Do not use tools or modify files.` with the expected reply. The bridge integration test and JavaScript syntax checks passed. UFW rules, service enablement, lingering, and key permissions were verified.

The user confirmed that the login page loads over off-network WireGuard. On 2026-09-18, the running service, access-key login, app-server connection, real task listing, and page responses on both private addresses were verified again. Browser rendering has not been visually tested. The optional, feature-detected WebMCP `open_codex_task` tool has no supported validation context here and is not claimed as verified.

Protocol references: https://learn.chatgpt.com/docs/app-server and schemas generated by the installed Codex 0.154.0 CLI.

## Chat attachments

Administrators can use **Attach files** or drop files onto the composer. Select up to
five files per prompt, at most 10 MiB each. Files show their name/size and uploading
state; sending waits for uploads to finish. Remove a file before sending to discard
it. A file-only message asks Codex to review the attached files. Read-only accounts
cannot upload, delete uploads or send attachments, including through direct API calls.

Files are stored privately under `.private/uploads/`, outside Git, using unique IDs
and validated filenames. Filenames cannot contain paths/control characters or start
with a dot. The bridge accepts opaque attachment IDs only for their authenticated
owner and inserts local file references into the app-server prompt. This is file
transfer to the Pi, not automatic document conversion or a download/sharing service;
Codex's available tools determine which formats it can inspect. Files are untrusted
input and are never executed by the upload endpoint. No public file-serving route is
added. Existing read-only users can still see task content produced from attachments.

Uploads are bounded to 100 files / 100 MiB total per bridge, with one upload in flight.
Unsent removal deletes the file. Files submitted to a turn are retained even after an
ambiguous RPC failure, so retries and resumed tasks keep their sources. A removal
from the composer after such a failure only detaches it from that draft. Logout or
page closure can leave unsubmitted files behind. Startup reclaims interrupted uploads
without completed metadata; complete uploads survive restart. To reclaim retained
files, stop the bridge and remove selected ID directories in `.private/uploads/`
only after confirming their tasks no longer need them, then restart. Do not delete
files while tasks are using them. No automatic retention expiry is imposed.

## GitHub Actions

The **Tests** workflow runs on pull requests and pushes to `main`; it can also be
started manually from the Actions tab after the workflow is on the default branch.
The **Node 22 checks and tests** job uses an Ubuntu GitHub-hosted runner and executes
`npm ci`, `npm run check`, then `npm test`. A failed command fails the job; newer
runs cancel obsolete runs for the same PR/ref. Jobs have a ten-minute timeout.

Tests use synthetic accounts, temporary storage, loopback HTTP and a mock Unix-socket
app server. They do not require production credentials, a running Pi, or a live Codex
account. Browser and actual app-server verification remain separate review checks.
The workflow has read-only repository permissions and does not deploy, merge or
publish. Branch-protection settings are unchanged; making this check required for
merge is a separate repository setting.

Workflow pattern: [GitHub's Node.js testing guide](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs).

## Links in chat

User and Codex messages render inline Markdown links such as
`[Pull request](https://github.com/owner/repo/pull/1)` as clickable, labeled links.
HTTP, HTTPS and mailto destinations are supported; web links open a new tab without
access to the original tab. Streamed links become clickable once the closing syntax
arrives. Inline/fenced code, tool output, images, raw HTML, unsafe URL schemes and
local/relative paths remain literal. This is a link-focused renderer, not full
Markdown: headings, tables, reference-style links and optional link titles are not
interpreted. All labels are inserted as text, never HTML.
