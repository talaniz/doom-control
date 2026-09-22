# Issue 18: task list provenance and concise fallback titles

Captured against the uncommitted implementation on base
`643911acadc72e129a22617b5cc755e7505fe8c9`. The coordinator owns committing,
publication, and independent code/E2E review. Those reviews are pending.
The hashes below identify the actual captured files; compare them with the
published implementation before attributing these captures to a final head.

## Acceptance and implementation

- Initial load, refresh, pagination, and thread-start notifications use the same
  sidebar filter. A recorded `originator` of `prime_mover`, a nonempty
  `parentThreadId`, or a recognized structured subagent source identifies internal
  work. Ordinary CLI/app-server tasks, absent metadata, unknown custom sources,
  malformed subagent sources, and lookalike client names remain visible.
- Prompt text, names, cwd, and words such as review/test/diagnostic never determine
  visibility. Filtering is presentation-only: RPC reads/resumes, streamed
  conversations, pending requests, Projects metadata and review evidence are
  unchanged. The existing pending-request action can open filtered history.
  Operators also retain app-server thread/read and native client history access.
- A missing stored name uses the first four whitespace-delimited words of the
  preview, consistently in the sidebar, heading, rename field, and archive
  confirmation. Empty previews use “Untitled task”. Names are not persisted or
  rewritten by this display rule. Explicit stored names and streamed renames
  retain their full text.
- Refresh preserves the selected conversation and unsent text even when that
  thread disappears from the sidebar. Late responses cannot overwrite newer
  list results or a later session. Failed refreshes preserve the prior list.
  Filtered pages retain Load more so later user work remains reachable.
- Loading, empty, and retry messages use a polite status region. The test suite
  exercises create/open/switch/rename/refresh/stream and pending-request
  navigation without discarding the unsent text.

## Provenance and API limitations

Inspected locally generated experimental schemas from `codex-cli 0.155.1` using
`codex app-server generate-json-schema --experimental --out /tmp/doom-18-schema`.
`ThreadListResponse` describes originator as recorded at creation, parentThreadId
as subagent-only, and structured `SessionSource`/`SubAgentSource` variants.
`ThreadNameUpdatedNotification` carries only threadId and threadName; `Thread.name`
is simply an optional user-facing title, with no authorship flag.

Read-only inspection of the installed Prime Mover source found initialization
with `clientInfo.name: 'prime_mover'` in `src/app-server.ts`. Its execution agent
uses that client for implementation/code-review/E2E threads, and
`scripts/probe-app-server.mjs` uses the same client. The execution agent additionally
records `threadSource` values of the form `prime-mover:<job>:<key>:<uuid>`, but
this implementation does not infer origin from that free-form analytics string.

There is no reliable way in this API to distinguish an existing generated stored
name from a user-authored stored name. Both remain unchanged to avoid truncating
custom names. The four-word rule therefore covers identifiable automatic preview
fallbacks, including newly created threads; it cannot guarantee four words for
upstream-generated stored names. Diagnostics/probes without explicit recognized
provenance likewise remain visible. No live conversations or jobs were queried or
changed to compensate for these limitations.

## Reproduction and results

Run from the checkout with installed dependencies and `/usr/bin/chromium`:

```sh
npm run check
npm test
node scripts/test-task-list-browser.mjs
node scripts/test-rename-browser.mjs
git diff --check
```

The new browser script starts this checkout's actual bridge/frontend, a synthetic
WebSocket app-server, ephemeral test accounts, and headless Chromium on isolated
local sockets/ports. It cleans up its own processes and temporary files. It never
connects to production. Archive capture opens and cancels the dialog only.

Observed TDD evidence before executable edits: `node test/tasks-ui.test.mjs`
exited 1 with two behavioral assertion failures: internal IDs were present in
normal listing, and the fallback was six words rather than the expected four.
After implementation, all five task UI regressions pass, including whitespace
boundaries, misleading user text, custom titles, pagination and stale responses.
`npm run check` passes; final `npm test` passes 33/33 tests. The task-list Chromium
workflow passes with zero JavaScript exceptions and no document horizontal
overflow at either viewport. The existing rename Chromium regression also passes,
including keyboard/context menus, read-only access, live renames, failure/retry,
and draft preservation. `git diff --check` passes.

The initial sandbox run of baseline tests could not bind fixture sockets
(`listen EPERM`) and failed the provisioner child-process test. The same required
suite passed using approved local test execution. An initial browser attempt hit
a fixture navigation race and another timed out in Page.navigate; explicit
navigation waits and a bounded CDP timeout resolved them. These were not counted
as passes. Final browser evidence is from the successful complete run.

All listed PNGs were opened and inspected for readable text, wrapping, dialog
bounds and synthetic-only content. Desktop shows the full conversation/composer;
mobile uses the existing vertically scrolling page and horizontal task strip.
Dialogs fit both viewports; long custom headings wrap without document overflow.
No credentials, private prompts, or unrelated windows appear.

| State / evidence | Desktop 1440 × 900 | Mobile 390 × 844 |
| --- | --- | --- |
| User tasks visible; internal records absent; short preview title | [Tasks](desktop-tasks.png) | [Tasks](mobile-tasks.png) |
| Rename prefilled with four-word fallback | [Rename](desktop-rename.png) | [Rename](mobile-rename.png) |
| Archive confirmation uses the same fallback; cancelled | [Archive](desktop-archive.png) | [Archive](mobile-archive.png) |
| Selected filtered history and long custom title preserved | [Selected](desktop-selected-filtered.png) | [Selected](mobile-selected-filtered.png) |
| Empty normal list leaves current conversation intact | [Empty](desktop-empty.png) | [Empty](mobile-empty.png) |
| Deterministically held list response | [Loading](desktop-loading.png) | [Loading](mobile-loading.png) |
| Failed refresh with retry guidance | [Error](desktop-error.png) | [Error](mobile-error.png) |
| New thread preview derived from submitted synthetic prompt | [Created](desktop-created.png) | [Created](mobile-created.png) |

Captured source SHA-256:

```text
a49dec826d6af764d99adb140c341cccff144b9833944ba0ee5efb56a8e1b466  dist/app.js
eb4f8f17e028b259c4eed11549ffa39bf77ac901d1ecc1a1772d8331875cb51a  dist/index.html
29cfbbea51f8e98ff94334796b35135e9409d1fe8a2dc5f95518e732c779b865  dist/styles.css
b91f415ed5cfcd8ab5ffe219ce4d2e9efd6a8f308aec1ac968ec3a5a48dfcf31  scripts/test-task-list-browser.mjs
```
