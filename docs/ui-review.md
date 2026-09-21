# UI screenshot evidence

Capture screenshots from an isolated branch test server with synthetic accounts
and conversations. The existing `scripts/test-*-browser.mjs` scripts launch the
actual frontend and bridge, a fixture app server, and headless Chromium. They
provide a CDP `call` helper and a `wait` helper for asserting visible state.
They currently test interactions; they do not automatically save screenshots.

## Capture

1. Identify changed screens and relevant states from the acceptance criteria.
   Use desktop 1440 × 900 and mobile 390 × 844 viewports. Include affected menu,
   dialog, error, loading, empty, and success states as appropriate.
2. Extend the relevant browser test with capture points after its assertions.
   Keep its existing assertions and cleanup. Use the fixture server, not the
   production service. A temporary diagnostic is acceptable if its reproduction
   steps are included with the evidence.
3. Use Chromium/CDP as shown below, or an equivalent browser tool. The example
   belongs inside an existing browser script's `try` block, after `call` and
   `wait` are defined. Its `writeFile` import already exists in those scripts.

```js
// Create docs/ui-evidence/<change>/ before running the script.
// Substitute the output path and wait condition for the actual changed state.
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});
// Navigate/open the changed screen or menu here, then assert it is ready.
await wait('document.querySelector("#task-context-menu").hidden === false');
await call('Runtime.evaluate', {
  expression: 'document.fonts.ready', awaitPromise: true,
});
const shot = await call('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: false,
});
await writeFile('docs/ui-evidence/<change>/desktop-menu.png',
  Buffer.from(shot.data, 'base64'));
```

For mobile, use width 390, height 844, and `mobile: true`, then reopen the state:
resizing dismisses some menus. Capture a separate `mobile-menu.png`. Keep browser
zoom and device scale fixed. Wait for the state under test rather than relying on
arbitrary sleeps. For a loading state, hold the fixture response deterministically.

4. Open and inspect every image. Confirm the expected state is visible, text is
   readable, controls fit, and no private content appears. A screenshot file's
   existence alone is not verification. Preserve the actual rendered image; do not
   retouch it to hide UI defects. Use synthetic data and recapture to remove private
   content.

## Store and link

Use a descriptive folder such as `docs/ui-evidence/archive-menu/`. Commit only
sanitized PNGs and an `index.md`; do not commit browser profiles, session cookies,
network traces, local config, or private runtime state.

The index should include:

- Captured code commit SHA and how the branch test server was launched.
- Capture command or script and any fixture/setup steps needed to reproduce it.
- Each image's viewport, UI state, and acceptance criterion being demonstrated.
- Interaction tests run and their results; note any gaps explicitly.

Link the index and individual images in the PR using GitHub URLs pinned to the
commit containing the evidence. Use image embeds when supported, or clickable
image links. Do not use Pi-local paths or temporary browser URLs: a reviewer on
another machine must be able to open the files. Check the links after pushing.

The capture commit and evidence commit can differ. The reviewer must verify that
the affected UI files and fixtures match the final reviewed head. A change to those
files that affects the screenshots requires updated captures. Evidence-only or
unrelated documentation changes do not require recapturing unchanged UI.

## Independent review

After independent code review signs off, the independent end-to-end reviewer opens
and inspects desktop/mobile evidence and exercises the affected workflow against
the branch implementation. Their PR comment identifies the exact reviewed head,
images inspected, interactions exercised, findings, and any limitations. Visual
inspection does not replace tests of clicks, keyboard controls, errors, persistence,
or read-only authorization. Address findings and renew both reviews on the final
head before declaring the PR ready.

If capture or image access fails, record the failure and continue unaffected work;
do not mark the screenshot requirement passed. No production deployment is needed
for screenshot capture or review.
