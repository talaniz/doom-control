# Issue 18: task list provenance and concise fallback titles

Recaptured against the uncommitted review corrections on
`8fa4eb541f82f25c01f8ea91decd9fc079bbe74d` (original issue base
`643911acadc72e129a22617b5cc755e7505fe8c9`). The coordinator owns committing,
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
After implementation, all 16 task UI regressions pass, including whitespace
boundaries, misleading user text, custom titles, pagination and stale responses.
`npm run check` passes; final `npm test` passes 44/44 tests. The task-list Chromium
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

All 24 listed PNGs were opened and inspected for readable text, wrapping, dialog
bounds and synthetic-only content. Desktop shows the full conversation/composer;
mobile uses the existing vertically scrolling page and horizontal task strip.
Dialogs fit both viewports; long custom headings wrap without document overflow.
No credentials, private prompts, or unrelated windows appear.

## Accepted review corrections

Only findings `code-review-1-8fa4eb541f82-001` and
`code-review-1-8fa4eb541f82-002` are addressed in this correction round.

- **001 — refresh/pagination:** Load more is disabled, and direct pagination
  requests ignored, while a list request is pending. A refresh can still replace
  an older page request; only the current request can update results, cursor or
  pending state. On failure, the retained list's pagination becomes available
  again. This deliberately blocks pagination rather than queuing an obsolete
  cursor. Tests cover a held refresh followed by pagination, and obsolete page
  responses resolving before and after a newer refresh. Assertions include
  filtering, fresh cursors, preserved conversation and draft, and failure/retry.
- **002 — keyboard focus:** Immediately before replacing buttons, the list reads
  the current focus. A focused task or context-menu action returns focus to the
  surviving task; if removed, the first visible task receives focus, or Refresh
  when the list is empty. The menu closes deliberately. Focus elsewhere remains
  untouched, including when moved into the composer during a pending response.
  Tests cover task/menu targets, surviving/removed targets, an empty list, and
  delayed responses. Chromium exercises actual Shift+F10 keyboard menus and
  asserts the restored task matches `:focus-visible` at both viewport sizes.

Before executable corrections, `node test/tasks-ui.test.mjs` exited 1 with
six failing assertions: one stale-cursor request count, four task/menu focus
cases, and the empty-list focus fallback. The contemporaneous
[red-run TAP transcript](review-corrections-red.tap) was saved before modifying
`dist/app.js`. Existing response-order and composer-focus cases already passed;
they were retained as regression protection, not claimed as new red evidence.
After the correction and a failure/retry test, the same command passes 16/16.
The required checks pass (44/44 full-suite tests), as do both isolated Chromium
scripts. One browser attempt failed because the fixture's ArrowDown key scrolled
and dismissed its menu; using Shift to establish keyboard modality and waiting
for animation frames resolved that harness issue. The full subsequent run passed.

All captures were regenerated on the corrected implementation. Focus is visible
in the gold outlines; the existing scroll container clips parts of the outer
outline at its edges, while top/bottom focus indicators remain visible. No
layout/style changes were introduced by these corrections. No additional
refactoring was needed. Publication and independent re-review remain pending
with the coordinator; these local results are not reviewer sign-off.

| State / evidence | Desktop 1440 × 900 | Mobile 390 × 844 |
| --- | --- | --- |
| Pending refresh disables old-cursor pagination | [Pagination loading](desktop-pagination-loading.png) | [Pagination loading](mobile-pagination-loading.png) |
| Keyboard menu before background update | [Keyboard menu](desktop-keyboard-menu.png) | [Keyboard menu](mobile-keyboard-menu.png) |
| Surviving task regains visible focus after update | [Focus restored](desktop-focus-restored.png) | [Focus restored](mobile-focus-restored.png) |
| Removed target moves focus to a surviving task | [Focus fallback](desktop-focus-fallback.png) | [Focus fallback](mobile-focus-fallback.png) |
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
7cda513509db4e6c454c7a00a41b688878f032d4095d70ca2cd718260baae73a  dist/app.js
eb4f8f17e028b259c4eed11549ffa39bf77ac901d1ecc1a1772d8331875cb51a  dist/index.html
29cfbbea51f8e98ff94334796b35135e9409d1fe8a2dc5f95518e732c779b865  dist/styles.css
1d72f3fac8427e063d92cbe1d98f49f128f2f8785e705319d574df9c7e6379e1  scripts/test-task-list-browser.mjs
```
