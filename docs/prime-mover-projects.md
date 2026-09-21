# Prime Mover Projects integration

This change is part of the single Prime Mover MVA tracked in
https://github.com/talaniz/prime-mover/pull/3. It is developed in an isolated clone;
the live DOOM service/checkout is not an implementation target.

## Acceptance criteria

- Authenticated admin and read-only accounts can open Projects and inspect Prime Mover
  and DOOM Dashboard metadata; unauthenticated reads fail.
- Display identity/repository/base, tracking and global pause, poll/snapshot timestamps,
  queue, active stage/issue/PR, last outcome and a safe blocker. Include explicit empty,
  loading, stale, paused, blocked and unavailable states.
- Only GET list/detail metadata is exposed. Unknown IDs and mutation requests fail.
  The browser receives no bearer token, private path, transcript or command environment.
- Links are restricted to the corresponding allowlisted GitHub repository. Display text
  is rendered as text, including hostile fixture content. A worker outage leaves tasks
  and other DOOM functions usable; cached data is labeled stale, never healthy/empty.
- Integrate with the actual Prime Mover Unix metadata API in an isolated runtime, record
  both source heads and prove repeated reads cause no execution mutations.

## Verification contract

Run `npm run check` and `npm test`, covering reader projection/freshness and actual
session-protected HTTP routes. Browser tests must sign in, exercise list/detail and
refresh/navigation, then cover the relevant success/failure/loading states at desktop
1440 x 900 and mobile 390 x 844. Capture and inspect sanitized PNG evidence under
`docs/ui-evidence/prime-mover-projects/` with exact code SHA and reproduction steps,
as required by AGENTS.md. Record real integrated metadata evidence separately from
fixture-only tests. Independent code and E2E reviews are required on the final PR head.

Reader, authenticated API, and the Projects screen are implemented. The 28 automated
tests and Chromium admin/viewer navigation, outage, and task preservation checks pass.
[Screenshot evidence](ui-evidence/prime-mover-projects/index.md) is captured and inspected.
[Real-service integration evidence](ui-evidence/prime-mover-projects/integration.json) passes;
independent reviews are pending. No merge or deployment is performed by these changes.

## Configuration

Set the optional `primeMover.socket` and `primeMover.tokenFile` fields in the private
DOOM config to the deployed metadata Unix socket and bearer-token file. The token
file must be a regular file, readable by the DOOM service identity, with no group or
world permissions; do not copy its contents into browser config or this repository.
The metadata token must be at least 32 non-whitespace characters. The socket needs
filesystem permissions allowing the DOOM service identity to connect.

Omitting this configuration leaves the existing task interface usable and shows
Projects as unavailable. No fallback TCP endpoint or worker write operation exists.
Reads have a two-second timeout and one-MiB response cap. The bridge coalesces reads
and caches them for five seconds; the page refreshes every fifteen seconds while
visible. Failed refreshes retain the last snapshot with an explicit stale label.
Leaving Projects stops refreshes; logout clears rendered and pending session data.

## Local verification

- `npm run check` and `npm test`: syntax and unit/HTTP/DOM regression checks.
- `node scripts/test-projects-browser.mjs`: isolated actual dashboard, Unix metadata
  fixture and Chromium interactions; synthetic accounts only.
- `DOOM_UI_EVIDENCE=docs/ui-evidence/prime-mover-projects node scripts/test-projects-browser.mjs`:
  the same checks plus desktop/mobile screenshots. Inspect every image before commit.

Actual-service acceptance command (Prime Mover must already be built):

```sh
node scripts/test-projects-integration.mjs /path/to/prime-mover /verified/external/mount VERIFIED_UUID
```

It verifies the ext4 mount and creates an isolated temporary runtime, seeds synthetic
jobs through the actual Store, runs the actual `metadata` CLI, and drives this dashboard
with Chromium. It proves same-number cross-project isolation, global lease contention,
paused/queued/active/outcome/blocker rendering, authorization, source-stop stale handling,
and an unchanged execution-state digest across browser reads. It does not poll GitHub
or launch an execution worker. Temporary runtime and browser processes are cleaned up.

The initial integration attempt selected a card by index, incorrectly assuming the
fixture server's order matched the actual registry's order. The test now selects the
stable project ID; the corrected run passed. This was a test-assumption failure, not
a product defect or evidence of an integration pass on that first run.

Code-review finding [P3 Refresh focus](https://github.com/talaniz/doom-control/pull/14#issuecomment-5754850277)
was accepted and fixed. The failing DOM regression now passes, including user-moved
focus; all 28 tests, Chromium focus checks, and actual-service integration pass.
All affected screenshots were recaptured and inspected at the fix commit.
