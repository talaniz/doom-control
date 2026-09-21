import test from "node:test";
import assert from "node:assert/strict";
import { snapshot } from "./fixtures/projects.mjs";
const load = () => import("../projects.mjs");
test("metadata projection keeps both defaults and excludes uncontracted private fields", async () => {
  const { validateSnapshot } = await load();
  const input = snapshot();
  input.token = "do-not-expose";
  input.projects[0].cwd = "/private/path";
  const result = validateSnapshot(input);
  assert.deepEqual(result, snapshot());
  assert.doesNotMatch(JSON.stringify(result), /do-not-expose|private\/path/);
});
test("hostile display text remains text but foreign links, unknown identities and bad counts are rejected", async () => {
  const { validateSnapshot } = await load();
  const input = snapshot();
  input.projects[0].name = "<img src=x onerror=alert(1)>";
  assert.equal(
    validateSnapshot(input).projects[0].name,
    input.projects[0].name,
  );
  for (const change of [
    (p) => (p.repositoryUrl = "https://github.com/attacker/repo"),
    (p) => (p.id = "unknown"),
    (p) => (p.queuedJobs = -1),
    (p) =>
      (p.activeJob = {
        id: "job",
        stage: "implementing",
        issueUrl: "javascript:alert(1)",
        prUrl: null,
      }),
  ]) {
    const value = snapshot();
    change(value.projects[0]);
    assert.throws(() => validateSnapshot(value), /invalid/i);
  }
});
test("reader keeps a labeled stale snapshot after outage and never invents an empty healthy snapshot", async () => {
  const { ProjectsReader } = await load();
  let now = Date.parse(snapshot().observedAt),
    fail = false;
  const reader = new ProjectsReader(
    async () => {
      if (fail) throw Error("private-token");
      return snapshot();
    },
    () => now,
  );
  let result = await reader.read();
  assert.equal(result.state, "fresh");
  fail = true;
  now += 6000;
  result = await reader.read();
  assert.equal(result.state, "stale");
  assert.deepEqual(result.snapshot, snapshot());
  assert.doesNotMatch(JSON.stringify(result), /private-token/);
  const missing = new ProjectsReader(
    async () => {
      throw Error("private-path");
    },
    () => now,
  );
  result = await missing.read();
  assert.equal(result.state, "unavailable");
  assert.equal(result.snapshot, null);
});
test("old or future-dated snapshots never appear fresh, and concurrent reads share one request", async () => {
  const { ProjectsReader } = await load();
  let calls = 0;
  const reader = new ProjectsReader(
    async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return snapshot();
    },
    () => Date.parse(snapshot().observedAt) + 121000,
  );
  const results = await Promise.all([reader.read(), reader.read()]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.state === "stale"));
  const future = new ProjectsReader(
    async () => snapshot(),
    () => Date.parse(snapshot().observedAt) - 60000,
  );
  assert.notEqual((await future.read()).state, "fresh");
});
