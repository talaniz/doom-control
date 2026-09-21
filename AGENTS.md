# DOOM development and review

Follow the standing global instructions for authorization, test-driven development,
PR code review, and subsequent independent end-to-end review. A merge or review
sign-off does not authorize deployment.

## UI screenshot evidence

For any change to rendered UI, layout, styling, or user interaction:

- Capture the affected screens on the branch's isolated test server before
  deployment, at desktop (1440 × 900) and mobile (390 × 844) viewport sizes.
- Capture relevant states, including open menus, dialogs, loading, empty, error,
  and success states when affected by the change. Select states from the PR's
  acceptance criteria; do not capture unrelated screens merely to fill a checklist.
- Use test accounts and synthetic content. Inspect every image for private
  conversations, credentials, tokens, personal information, and unrelated windows
  before committing or linking it. Recapture with safe fixtures if necessary.
- Inspect the actual images for clipping, overflow, readability, focus visibility,
  and responsive layout. Screenshots supplement interaction and authorization
  tests; they do not prove that an interaction works.
- Commit the sanitized PNGs and their evidence index under
  `docs/ui-evidence/<change>/`. Link them in the PR with the captured code commit,
  viewport, state, and reproduction command. Follow [the capture guide](docs/ui-review.md).
- After code-review sign-off, the separate independent end-to-end reviewer must
  open and inspect the images, exercise the affected interactions, and record
  findings or sign-off on the PR for its exact final head. The reviewer must
  confirm the captured UI code still matches that head. Recapture affected states
  after UI fixes; evidence-only changes do not require recapture of unchanged UI.
- Missing screenshots or an unavailable capture environment are verification gaps,
  not passes. Report the concrete gap and do not declare a UI PR ready until the
  required evidence and reviews are complete.

Documentation-only or other changes that do not affect UI may mark screenshot
requirements not applicable in the PR, with a brief reason. Do not invent UI tests
or screenshots for documentation-only changes.

A Computer Use plugin is optional. Chromium/CDP, Playwright, or an available browser
control tool is acceptable if it produces inspectable screenshots of the actual
branch implementation.
