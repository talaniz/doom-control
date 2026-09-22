# Phone and tablet UI evidence

UI source revision: `359d89f364800f2c0b37bc0672a0b0098847981a`. These screenshots were captured from the exact files committed in that revision; the following evidence commit changes no runtime code.

Reproduce from the repository root with `npm ci` and `CAPTURE_UI=1 node scripts/test-mobile-browser.mjs` (Node 22 and `/usr/bin/chromium`). The script starts isolated frontend/bridge and fixture app-server processes on temporary sockets/ports, provisions synthetic admin/read-only accounts, and cleans up browser profiles and private fixture state. It never connects to production or executes Codex tools.

All screenshots were opened and inspected for clipping, readability, reachable controls, responsive layout and private content. Images contain only fixture conversations and accounts. Keyboard-sized captures show a reduced viewport, not a physical keyboard. Physical iOS/Android keyboard, browser chrome and safe-area behavior have not been tested on real devices.

| Screenshot / state | CSS viewport | Coverage |
| --- | --- | --- |
| [desktop-task](desktop-task.png) | 1440 × 900 | Desktop layout with persistent sidebar |
| [phone-actions](phone-actions.png) | 390 × 844 | Touch-accessible Rename and Archive menu |
| [phone-approval-keyboard-sized](phone-approval-keyboard-sized.png) | 390 × 420 | Pending approval and reachable composer actions; approval content scrolls |
| [phone-attachment](phone-attachment.png) | 390 × 844 | Uploaded synthetic attachment and live message delta |
| [phone-drawer](phone-drawer.png) | 390 × 844 | Phone task/project navigation drawer |
| [phone-keyboard-sized](phone-keyboard-sized.png) | 390 × 420 | Composer and Send in a reduced-height viewport |
| [phone-new-task](phone-new-task.png) | 390 × 844 | Empty/new task, collapsed Task settings and visible Send |
| [phone-projects-unavailable](phone-projects-unavailable.png) | 390 × 844 | Project status unavailable and refresh control |
| [phone-read-only](phone-read-only.png) | 390 × 844 | Read-only task view without write controls |
| [phone-rename-error](phone-rename-error.png) | 390 × 844 | Recoverable rename failure |
| [phone-rename](phone-rename.png) | 390 × 844 | Rename dialog and focus |
| [phone-task](phone-task.png) | 390 × 844 | Selected task with draft and Plan mode |
| [small-phone-task](small-phone-task.png) | 320 × 568 | Small phone with attachment and preserved draft |
| [tablet-landscape-task](tablet-landscape-task.png) | 1024 × 768 | Wide tablet persistent sidebar |
| [tablet-portrait-drawer](tablet-portrait-drawer.png) | 768 × 1024 | Narrow tablet navigation drawer |
| [tablet-portrait-task](tablet-portrait-task.png) | 768 × 1024 | Narrow tablet task layout |

## Interaction evidence

- Baseline and final `npm test`: 44 passing tests; `npm run check` passes.
- New browser test started red at missing phone navigation. Subsequent regressions reproduced focus wrapping, off-screen new-task Send, pending-approval overflow, and dialog positioning when only the visual viewport shrinks; all now pass.
- Final mobile script verifies trusted touch, Escape and Tab, task selection, Rename/error/Cancel, Archive/Cancel, Projects/back, attachments/live streaming, orientation, desktop, 320px phone, reduced-height viewport, simulated visual-viewport geometry, read-only restrictions and logout. No JS exceptions.
- Existing Rename, Archive and Projects browser regressions passed during development. Review comments identify independently repeated checks on the final head.

## Source identity

- `dist/app.js` SHA-256: `8685bb9093a0728b3353592ae7e520d2c25b0855c4ce3adf42855498b3f240ec`
- `dist/index.html` SHA-256: `cc4bcbbd0180b41ffe9534e48b0df549c48091c1869b48b76784e3c663d3c6bf`
- `dist/styles.css` SHA-256: `7dbd126a3a9e0246ccc9295704ef64a2e07082b0409802f1b3728559dbec0495`
- `scripts/test-mobile-browser.mjs` SHA-256: `23f3719df6d141613b1c8048c41a09407d36edebb3c53e13998e62ee1a9eb729`
