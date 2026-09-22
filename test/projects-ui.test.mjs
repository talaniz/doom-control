import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createProjectsView } from "../dist/projects.js";
import { snapshot } from "./fixtures/projects.mjs";
function setup(read) {
  const dom = new JSDOM('<section id="projects"></section>');
  const root = dom.window.document.querySelector("section");
  const view = createProjectsView({ root, read, intervalMs: 0 });
  return { root, view };
}
test("Projects renders both defaults, details and hostile text without markup", async () => {
  const data = snapshot();
  data.projects[0].name = "<img src=x onerror=alert(1)>";
  const { root, view } = setup(async () => ({
    state: "fresh",
    snapshot: data,
    error: null,
  }));
  await view.show();
  assert.match(root.textContent, /DOOM Dashboard/);
  assert.match(root.textContent, /No active work/);
  assert.equal(root.querySelector("img"), null);
  const detail = [...root.querySelectorAll("button")].find(
    (b) => b.textContent === "View project",
  );
  detail.click();
  assert.match(root.textContent, /prime-mover/);
  assert.match(root.textContent, /Never polled/);
  assert.equal(
    root.querySelector("a").href,
    "https://github.com/talaniz/prime-mover",
  );
  view.reset();
});
test("loading, stale cache and unavailable states never invent healthy counts", async () => {
  let resolve;
  const { root, view } = setup(() => new Promise((r) => (resolve = r)));
  const pending = view.show();
  assert.match(root.textContent, /Loading projects/);
  resolve({ state: "stale", snapshot: snapshot(), error: "Unavailable" });
  await pending;
  assert.match(root.textContent, /Stale/);
  assert.match(root.textContent, /2026/);
  view.reset();
  const other = setup(async () => ({
    state: "unavailable",
    snapshot: null,
    error: "Unavailable",
  }));
  await other.view.show();
  assert.match(other.root.textContent, /unavailable/i);
  assert.doesNotMatch(other.root.textContent, /Queued: 0/);
  other.view.reset();
});
test("reset discards late responses and clears prior session data", async () => {
  let resolve;
  const { root, view } = setup(() => new Promise((r) => (resolve = r)));
  const pending = view.show();
  view.reset();
  resolve({ state: "fresh", snapshot: snapshot(), error: null });
  await pending;
  assert.equal(root.textContent, "");
});
test("refresh failure retains explicitly stale data and empty registry is explicit", async () => {
  let fail = false;
  const { root, view } = setup(async () => {
    if (fail) throw Error("private diagnostic");
    return { state: "fresh", snapshot: snapshot(), error: null };
  });
  await view.show();
  fail = true;
  await view.refresh();
  assert.match(root.textContent, /Stale/);
  assert.match(root.textContent, /DOOM Dashboard/);
  assert.doesNotMatch(root.textContent, /private diagnostic/);
  view.reset();
  const empty = snapshot();
  empty.projects = [];
  const other = setup(async () => ({
    state: "fresh",
    snapshot: empty,
    error: null,
  }));
  await other.view.show();
  assert.match(other.root.textContent, /No projects registered/);
  other.view.reset();
});
test("background refresh preserves keyboard focus on the same project action", async () => {
  const { root, view } = setup(async () => ({
    state: "fresh",
    snapshot: snapshot(),
    error: null,
  }));
  await view.show();
  const buttons = [...root.querySelectorAll("button")].filter(
    (b) => b.textContent === "View project",
  );
  buttons[1].focus();
  await view.refresh();
  assert.equal(
    root.ownerDocument.activeElement.closest("article")?.querySelector("h2")
      .textContent,
    "DOOM Dashboard",
  );
  view.reset();
});
test("manual refresh restores keyboard focus unless the user moves elsewhere while waiting", async () => {
  let resolve;
  let first = true;
  const { root, view } = setup(() =>
    first
      ? ((first = false),
        Promise.resolve({ state: "fresh", snapshot: snapshot(), error: null }))
      : new Promise((r) => (resolve = r)),
  );
  await view.show();
  root.querySelector("header button").focus();
  let pending = view.refresh();
  resolve({ state: "fresh", snapshot: snapshot(), error: null });
  await pending;
  assert.equal(
    root.ownerDocument.activeElement.textContent,
    "Refresh projects",
  );
  const outside = root.ownerDocument.createElement("button");
  root.ownerDocument.body.append(outside);
  pending = view.refresh();
  outside.focus();
  resolve({ state: "fresh", snapshot: snapshot(), error: null });
  await pending;
  assert.equal(root.ownerDocument.activeElement, outside);
  view.reset();
});

test("timestamps show relative ages with persistent, focusable exact-time disclosures", async () => {
  const data = snapshot();
  let now = Date.parse(data.observedAt) + 30000;
  data.projects[0].lastPollAt = "2026-09-20T23:58:30.000Z";
  data.projects[0].latestOutcome = {
    stage: "complete", issueUrl: "https://example.com/issues/1",
    at: "2026-09-20T22:00:30.000Z",
  };
  const dom = new JSDOM('<section></section>');
  const root = dom.window.document.querySelector('section');
  const view = createProjectsView({ root, read: async () => ({ state: "fresh", snapshot: data }), intervalMs: 0, now: () => now });
  await view.show();
  const summaries = [...root.querySelectorAll('.project-time summary')];
  assert.deepEqual(summaries.map(n => n.textContent), ["Snapshot: 30 seconds ago", "Last poll: 2 minutes ago", "Recorded: 2 hours ago"]);
  assert.match(root.textContent, /Never polled/);
  const time = root.querySelector('time');
  assert.equal(time.dateTime, data.observedAt);
  assert.equal(time.textContent, new Intl.DateTimeFormat(undefined, {
    dateStyle: "full", timeStyle: "long",
  }).format(new Date(data.observedAt)));
  summaries[1].parentElement.open = true;
  summaries[1].focus();
  now += 180000;
  await view.refresh();
  assert.match(root.textContent, /Stale/);
  assert.equal(root.ownerDocument.activeElement.textContent, 'Last poll: 5 minutes ago');
  assert.equal(root.ownerDocument.activeElement.parentElement.open, true);
  view.reset();
});

test("timestamp units, future values and invalid dates are deterministic", async () => {
  const data = snapshot();
  const now = Date.parse(data.observedAt);
  const { window } = new JSDOM('<section></section>');
  const root = window.document.querySelector('section');
  const view = createProjectsView({ root, read: async () => ({ state: 'stale', snapshot: data }), intervalMs: 0, now: () => now });
  for (const [offset, expected] of [[0, 'now'], [-1000, '1 second ago'], [-60000, '1 minute ago'], [-3600000, '1 hour ago'], [-86400000, '1 day ago'], [120000, 'in 2 minutes']]) {
    data.observedAt = new Date(now + offset).toISOString();
    await view.show();
    assert.equal(root.querySelector('summary')?.textContent, `Snapshot: ${expected}`);
  }
  data.observedAt = 'invalid';
  await view.refresh();
  assert.match(root.textContent, /Snapshot: Time unavailable/);
  assert.equal(root.querySelector('time'), null);
  view.reset();
});
