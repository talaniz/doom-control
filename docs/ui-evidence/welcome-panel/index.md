# Welcome panel — issue #22

## Scope and acceptance

Show exactly one accessible “Ready when you are” panel when no task is selected.
The empty-state header also avoids write suggestions for read-only users.
Admin copy: “Choose a task from navigation, or write a prompt below to start.”
Read-only copy: “Choose a task from navigation to view the conversation.”
Selecting an existing task (including one with no messages) removes the panel;
New task restores it without stale messages. Rendering does not move focus or
change composer state. Dark green, steel and gold styling fits desktop, phone,
and small phone without horizontal page overflow; admin Send stays reachable.

Existing behavior is preserved: switching tasks or choosing New task resets mode
and attachments, retains the prompt draft, and New task focuses the prompt.
Refreshing while composing retains draft, mode and attachments. This change does
not reinterpret those existing reset rules as persistence across task changes.

## Reproduction and captured revision

Run from the repository root with installed dependencies and `/usr/bin/chromium`:

```sh
CAPTURE_UI=1 node scripts/test-welcome-browser.mjs
```

The script launches only temporary loopback bridge and synthetic app-server
fixtures plus an isolated Chromium profile; it cleans up its child processes and
runtime directory. It uses synthetic admin/read-only accounts, conversations and
attachments. Each capture starts from a fresh page sign-in. No production service
or external app server is used. Local socket binding and child processes must be
permitted by the execution environment.

Captured from the uncommitted implementation on base `e7bd7e73f4657547938b5871b59f0f76c4d5d946`
(the merge of phone/tablet PR #21). The implementing job is prohibited from
committing. The coordinator must insert the resulting captured code commit SHA
and publish pinned GitHub image links before review. Verify these SHA-256 digests
against that commit; UI changes require recapture:

| File | SHA-256 |
| --- | --- |
| `dist/app.js` | `9cccf7e0e508e91b326a1942f1dc0c4d0ffa4ef5c4e238d995cae2f0ae78de55` |
| `dist/index.html` | `d81bd6db218163172ae595e0ef71f402b812e81d0fe18b41f12431e86b7cc5b6` |
| `dist/styles.css` | `e9f5b5267689c6c72861b522b42ff5fa4198dd7a913f9599c9d072b241809ae1` |
| `scripts/test-welcome-browser.mjs` | `309a8789cae53d61554c30377c838f44084760e561a1ef3f23fa942ccb2eb191` |

## Screenshots

| Viewport | Admin welcome | Read-only welcome | Selected conversation |
| --- | --- | --- | --- |
| 1440 × 900 | [Welcome](desktop-admin-welcome.png) | [Welcome](desktop-read-only-welcome.png) | [Conversation](desktop-selected-conversation.png) |
| 390 × 844 | [Welcome](phone-admin-welcome.png) | [Welcome](phone-read-only-welcome.png) | [Conversation](phone-selected-conversation.png) |
| 320 × 568 | [Welcome](small-phone-admin-welcome.png) | [Welcome](small-phone-read-only-welcome.png) | [Conversation](small-phone-selected-conversation.png) |

Welcome screenshots demonstrate role-specific copy and wrapping. Selected-task
screenshots demonstrate normal history and absence of the welcome panel. Admin
images also show the reachable Send action. The interactions exercise each state
at all three sizes; no menus or dialogs are changed by this implementation.

## Verification record

- Baseline `node --test test/tasks-ui.test.mjs`: passed before changes.
- Red: `node --test test/welcome-ui.test.mjs` exited 1 before implementation.
  Direct `node test/welcome-ui.test.mjs` exposed all four failures: “exactly one
  welcome panel”, expected 1, actual 0. This demonstrated missing behavior.
- Green: `node test/welcome-ui.test.mjs`: all four tests passed. Coverage includes
  both roles, accessible heading, re-entry without focus changes, selected empty
  and populated tasks, repeated New task, draft/mode semantics and late updates.
- `npm run check`: passed.
- `npm test`: 48 tests passed outside the sandbox. The sandbox run failed in
  auth, bridge and project API fixtures; permitted local execution resolved it.
- Final `CAPTURE_UI=1 node scripts/test-welcome-browser.mjs`: passed all three
  viewports, both roles, initial/selected/repeated New task states, no duplicate or
  stale messages, draft/mode/attachment semantics, header copy, reachable Send,
  read-only RPC behavior and absence of browser exceptions. All nine PNGs saved.
- Final `node scripts/test-mobile-browser.mjs`: passed touch navigation, focus,
  selected tasks, rename/archive/error/cancel, projects/back, attachments, draft
  and mode preservation, tablet orientation, desktop, small phone, keyboard-sized
  viewport, approvals, read-only and logout.
- After the final header correction, `npm test` passed all 48 tests again;
  `npm run check`, browser-script syntax and `git diff --check` also passed.
- Opened and visually inspected all nine final images: synthetic content only,
  readable/wrapped text, no clipped welcome panel or horizontal page overflow,
  visible admin Send. At 320 × 568, composer fields retain the existing internal
  scroll region while Send stays fixed and reachable. No new focusable panel
  elements or automatic focus changes were introduced.
- `node --check scripts/test-welcome-browser.mjs` and `git diff --check`: passed.
- Refactor: removed unused test-fixture helpers; production needed no further
  refactor beyond the shared welcome renderer.

The browser helper initially assumed Refresh closes the mobile drawer; the test
was corrected to close it with Escape, preserving existing navigation behavior.
An initial sandbox attempt failed with `listen EPERM` on the temporary socket;
approved local execution enabled real Chromium validation.

## Coordinator handoff

No commits, pushes, PR, independent reviews, release notes, merges or deployments
were performed by this implementing job. After committing and opening the draft
PR, arrange independent code review followed by independent E2E review on the
final head, have reviewers inspect these images and exercise the workflows, add
release notes after reviews, and publish readiness only after both sign-offs.

The empty header is refreshed alongside the welcome panel after sign-in, including
same-page re-entry. A second red cycle caught the pre-existing read-only header
suggestion “start something new”: `node test/welcome-ui.test.mjs` exited 1 (three
passed, one failed), then all four passed after the role-aware header correction.
This also prevents stale selected-task titles in the new empty state. Final
screenshots were regenerated after that correction.
