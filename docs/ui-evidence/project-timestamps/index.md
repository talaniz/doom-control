# Projects timestamp evidence — issue 16

Acceptance: snapshot, last-poll and outcome times show relative ages. Native
`details`/`summary` disclosures expose exact local date/time (including seconds and
timezone) through keyboard and touch. Refreshes preserve open disclosures and
focus. Never-polled, stale and unavailable states retain their meanings. Relative
labels update on the existing refresh/render cadence; no new polling is added.

Captured from the isolated branch fixture server using synthetic accounts and data:

```sh
DOOM_UI_EVIDENCE=docs/ui-evidence/project-timestamps node scripts/test-projects-browser.mjs
```

The script starts and cleans up its own bridge, metadata fixture, app-server fixture,
and headless Chromium. It does not use or change production services. Chromium
used local Pacific time (PDT in these images). Desktop is 1440 × 900; mobile is
390 × 844, both at device scale 1. Exact project times are scrolled into view.

Capture source: uncommitted worktree based on
`643911acadc72e129a22617b5cc755e7505fe8c9`. The coordinator owns the implementation
commit and must associate these artifacts with that commit before publication.
Only equivalent formatting of the timestamp helper was cleaned up during capture;
the final source fingerprints below identify the handoff. Reviewers must verify
these files still match the reviewed head (or assess subsequent changes).

| File | SHA-256 |
| --- | --- |
| `dist/projects.js` | `4a9df4b9d9ebe72795409558db06c13db40747aa86981db4918a4f2487b2e9e0` |
| `dist/styles.css` | `d056ea732b81f80fd10cf3c8d07c4ed521e78409f4bb0b7200bb1adee042e48a` |
| `scripts/test-projects-browser.mjs` | `9fb6077c3b73f81ca442d93a1c311b8ede5f6af032a018342527b16f6e3b99e0` |
| `test/projects-ui.test.mjs` | `a9dd1a196006b9de70f7e93cba43fa1f76749da5d565196bef5a29625b4d5ec3` |

| State | Desktop | Mobile | Evidence |
| --- | --- | --- | --- |
| relative-times | [PNG](desktop-relative-times.png) | [PNG](mobile-relative-times.png) | All three relative labels; other project remains never-polled |
| exact-snapshot-keyboard | [PNG](desktop-exact-snapshot-keyboard.png) | [PNG](mobile-exact-snapshot-keyboard.png) | Enter opens exact snapshot date, seconds and timezone; visible focus |
| exact-project-times | [PNG](desktop-exact-project-times.png) | [PNG](mobile-exact-project-times.png) | Touch opens last poll; Space opens outcome; exact values wrap |
| stale | [PNG](desktop-stale.png) | [PNG](mobile-stale.png) | Outage retains relative/exact times with explicit stale warning |
| unavailable | [PNG](desktop-unavailable.png) | [PNG](mobile-unavailable.png) | Missing metadata retains unavailable message |
| active-blocked | [PNG](desktop-active-blocked.png) | [PNG](mobile-active-blocked.png) | Relative/exact times coexist with active work and blocked project |
| detail | [PNG](desktop-detail.png) | [PNG](mobile-detail.png) | Same timestamp controls in project detail view |
| empty-registry | [PNG](desktop-empty-registry.png) | [PNG](mobile-empty-registry.png) | Snapshot time remains available without registered projects |
| loading | [PNG](desktop-loading.png) | [PNG](mobile-loading.png) | Refresh retains prior snapshot with explicit loading state |

All 18 PNGs were opened and visually inspected: no horizontal overflow, timestamp
text clipping, obscured focus indicators, or private content observed. Longer
cards scroll vertically; the dedicated exact-project-times images show outcome
and poll disclosures below the initial viewport. Only synthetic account/task data
and public repository identifiers appear.

Verification results:

- Baseline Projects UI tests passed (6 tests).
- Red: `node test/projects-ui.test.mjs` exited 1 with 6 passes and 2 failures:
  expected three relative timestamp summaries but received `[]`; expected
  `Snapshot: now` but received `undefined`. This was observed before implementation.
- Green: same command passes all 8 tests, including fixed-clock units, future and
  invalid timestamps, exact local formatting, stale transition and focus/open-state
  persistence. Passed again after the small readability refactor.
- `TZ=America/Los_Angeles node test/projects-ui.test.mjs`: 8 passed.
- `npm run check`: passed, including after the readability refactor.
- `npm test`: 30 passed. Initial sandbox execution failed in subprocess/socket
  tests; permitted local-fixture execution resolved those failures.
- Browser reproduction command: passed. Exercises native Enter and Space events,
  mobile touch activation, admin/viewer list/detail, stale cache, task/draft
  preservation, outage task controls, no turn mutation, rejected POST, logout
  clearing, viewport widths, and no JavaScript exceptions.
- `git diff --check`: passed.

Initial browser attempts were blocked by sandbox socket permissions, then exposed
invalid synthetic outcome fields and incomplete CDP keyboard events. Those test
setup problems were corrected; the final complete browser run passed.

Independent code and E2E reviews are pending with the coordinator. These are
implementation checks and visual inspection, not independent sign-offs. No
commit, push, PR, merge, deployment or running-service changes were performed.
