# Chat attachment acceptance and verification

## Contract

Admins select/drop files, see upload status, remove unsent attachments and send with
a prompt or file-only message. Limits: five files per turn, 10 MiB per file, 100 files
and 100 MiB total storage. The API rejects viewers, unsafe filenames, oversized data,
unknown/other-owner/deleted IDs and deletion of a file submitted to a task. Files
remain outside Git and are never publicly served. The app server receives readable
local references alongside user text. Failed sends retain attachments for retry;
switching tasks clears the draft. No change to the live service until deployment approval.

## Observed test-first evidence

Baseline `npm test`: 3 passed. Extended bridge test failed (exit 1) with 404 instead
of the expected 403 for the new upload endpoint. After implementing upload/role/
ownership/prompt behavior, the bridge test passed. A subsequent lifecycle test failed
on "restart must reclaim incomplete uploads"; after implementing orphan cleanup,
that test passed. Streaming oversize data leaves no partial files.

`npm run check` and `npm test`: 5 passed, no skips. Tests include binary byte equality,
mode-600 upload data, limits, role denial, unsafe paths, ID ownership, local prompt
reference content, removal, retention after submission, restart persistence and
partial-upload cleanup, plus existing login/session/approval/reconnect regressions.
Refactor assessment: file persistence is isolated in UploadStore; no unrelated rewrite.
Browser and independent-review evidence will be recorded on the PR at the tested SHA.
