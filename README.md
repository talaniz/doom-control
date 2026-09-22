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

## Markdown in chat

User messages, Codex responses, and plan items render GitHub-style Markdown:
headings, paragraphs, emphasis, strikethrough, nested lists, task checkboxes,
quotes, rules, tables, inline code, fenced/indented code, reference links,
autolinks, and link titles. Streamed content is re-rendered as it arrives; code
stays literal. Wide tables and code blocks scroll within the message.

Marked parses the text and DOMPurify sanitizes the result with a narrow tag and
attribute allowlist. Raw HTML is displayed as text. Only HTTP, HTTPS, and mailto
links are enabled; they open with `noopener noreferrer`. Images are shown as
explicit links instead of fetching remote resources automatically. Unsafe and
local/relative destinations have no active link. Tool output stays plain text.
Math, Mermaid, and executable HTML are not Markdown features supported here.
Parser errors fall back to the original text so the response remains readable.

Runtime libraries are pinned in the lockfile and served locally through two
explicit asset routes; there is no CDN dependency. `npm ci` installs them for
both deployment and tests. The DOM-based Markdown regression tests run under
`npm test` and in GitHub Actions.

### Prompt mode

Administrators can select **Normal** or **Plan** above the prompt. Normal works on
the task; Plan asks Codex to plan the approach before implementation. The choice
applies to the next prompt, including prompts with attachments. Selecting a mode
alone does not start a turn or change permissions. The selector is locked while
sending, loading a task, disconnected, or running a turn.

New tasks and switching to a different task default to Normal. The choice stays
selected between prompts in the current task; it is not saved across sign-outs or
page reloads. Each prompt explicitly sends its mode, preserving the model and
reasoning effort returned when the task was started or resumed. App-server errors
keep the prompt and selection available for retry.

Browser regression check (requires `/usr/bin/chromium`):
`node scripts/test-modes-browser.mjs`. It runs the actual site and bridge against
an isolated protocol fixture with temporary accounts; it does not use production
accounts or tasks. The regular `npm test` suite remains browser-independent.

### Skill and plugin picker

Type `$` at the start of a word to browse enabled skills for the current working
directory, or `@` to browse enabled, installed plugins. Continue typing to filter
by name or description. Use arrow keys and Enter/Tab, or click an option; Escape
closes the list. Ctrl/Cmd+Enter still sends the prompt. Email addresses do not
open the picker.

Selections insert an editable mention and send a structured `skill` or `mention`
input alongside the text. Plugin mentions use `plugin://<installed-id>`; skills
use the discovered skill path. Deleting or changing a selected mention removes
its structured reference. Unchanged references survive prompt submission errors;
new tasks, successful task switches, working-directory changes and sign-out clear
them. Manually typed mentions remain ordinary text for Codex to interpret.

The picker shows loading, empty and partial-failure states, with a Retry button.
It loads catalogs on demand and refreshes them after a successful send or context
reset. It does not install plugins, change configuration, or enable disabled
entries. Read-only accounts can read discovery metadata but cannot compose or
send prompts. Discovery depends on the installed app-server protocol and current
plugin/account availability.

`node scripts/test-picker-browser.mjs` exercises the actual frontend and bridge
with isolated fixtures. `npm test` includes DOM interaction and reference-lifecycle
coverage; real app-server invocation is a separate deployment/review diagnostic.

### Rename tasks

Right-click a task in the sidebar and choose **Rename**, or open a task and select
**Rename** beside its title. The sidebar menu also opens with Shift+F10 or the
Context Menu key. Renaming another task keeps your current conversation and draft open. Administrators can enter a
name of 1–120 characters and save it, or cancel without changing anything.
Leading/trailing whitespace is trimmed; empty names and control characters are
rejected. The app server stores the name, so it survives refresh and reopening.

The header and sidebar update after saving and when another client renames a
task. Read-only users see these updates but cannot rename tasks, including via
forged RPC requests. A failed save leaves the dialog open for retry and keeps
the existing name. Renaming does not start or interrupt a Codex turn.

`node scripts/test-rename-browser.mjs` verifies the actual frontend/bridge workflow
with an isolated upstream fixture. Server validation and read-only denial are
covered by `npm test`; persistence is additionally verified against the real
app server using a synthetic task.

### Archive tasks

Administrators can right-click a sidebar task, choose **Archive**, and confirm the
named task. Archiving retains history and removes the task from the active list;
the app server also attempts to archive spawned subtasks. Running work is subject
to the app server's archive behavior. Cancel makes no change, and failed requests
keep the task visible with a retryable error. Read-only accounts cannot archive.

Archiving another task preserves the open conversation, mode and draft. Archiving
the open task returns to a new-task view and preserves unsent text; task-specific
attachments and skill/plugin selections are cleared. Live archive notifications
also update other clients. An archive browser/restore UI is not included in this
change; archived history remains in Codex's archive.

`node scripts/test-archive-browser.mjs` exercises the actual frontend and bridge
in Chromium with a fixture app server. `npm test` verifies the bridge's archive
validation and role enforcement. No production deployment is performed by tests.

## Reporting issues

Use the feature, bug report, or documentation form when opening an issue. See
[issue reporting](docs/issue-reporting.md) for the required fields and separate
Prime Mover authorization step.

### Task visibility and fallback titles

The normal task sidebar omits threads with explicit Prime Mover or subagent
provenance. Unknown origins stay visible; task wording does not affect visibility.
This does not archive threads or change execution, requests, or project evidence.
Selected conversations and unsent text remain intact when the list refreshes.

When no stored name is available, task titles use at most four words from the
initial prompt preview. Stored names are preserved because the app-server API
does not distinguish generated titles from custom names. See the
[issue 18 verification and UI evidence](docs/ui-evidence/task-list/index.md)
for provenance rules, API limitations, tests, and synthetic screenshots.
