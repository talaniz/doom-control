# Username login and roles

## Acceptance contract

- Username/password form replaces script/access-key instructions; no plaintext
  production credentials or default passwords enter Git.
- Admin sessions retain every supported read/write RPC and approval response.
- User sessions can list/read tasks, list models, and receive live updates; every
  write method and approval/question response returns 403 before forwarding.
- Viewer task selection uses thread/read, never thread/resume. Write controls are
  hidden; identity/role and read-only explanation are visible.
- Sessions identify a server-verified account/role, expire after 12 hours, and revoke
  on logout/restart. Passwords are salted scrypt hashes. Login failures are throttled.
- Existing Host/origin restrictions, streaming, app-server reconnect and automatic
  approval-review settings continue working.
- Accounts are provisioned privately; the running panel is not changed by this PR.

## Test-first evidence

Updated the isolated bridge integration test before implementation to use hashed
account fixtures and username/password login. `npm test` failed with exit 1:
expected HTTP 200 for correct fixture login, received 401 at bridge.test.mjs:32.
This demonstrated that the old access-key server did not support the new contract.

After implementation, `npm run check` and `npm test` passed (3 tests, no skips).
Tests cover salted hashes, correct/wrong/unknown credentials, invalid roles and
records, atomic provisioning/private permissions, preservation on bad input,
admin RPC/approval flows, viewer read RPC/SSE, denial before forwarding for all
write RPCs and approval responses, legacy-key rejection, logout isolation,
origin/Host defenses, reconnect and throttling. `git diff --check` passed.

Three requested accounts are staged as hashes in the implementation worktree's
ignored `.private/users.json`: admin and doom are admins; reed is a user. No
password values or account hashes are versioned. Deployment is explicitly pending
user approval after this PR and its independent reviews. No service was restarted.

Browser and independent review results are recorded on the PR at their reviewed SHA.
