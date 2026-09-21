import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { hashUser } from "../auth.mjs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
const [pmRoot, mount, uuid] = process.argv.slice(2);
if (!pmRoot || !mount || !uuid)
  throw Error(
    "Usage: test-projects-integration PRIME_MOVER_ROOT EXTERNAL_MOUNT VERIFIED_UUID",
  );
const { validateConfig } = await import(
  pathToFileURL(join(pmRoot, "dist/config.js"))
);
const { openRuntime, checkStorage } = await import(
  pathToFileURL(join(pmRoot, "dist/storage.js"))
);
let runtime, store, worker;
const digest = () =>
  createHash("sha256")
    .update(
      JSON.stringify({
        view: store.view(),
        jobs: store
          .jobs()
          .map((j) => ({
            id: j.id,
            events: store.events(j.id),
            operations: store.operations(j.id),
          })),
      }),
    )
    .digest("hex");
const heads = {
  primeMover: execFileSync("git", ["-C", pmRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  doom: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
};
const root = new URL("..", import.meta.url).pathname,
  dir = await mkdtemp(join(tmpdir(), "doom-link-browser-"));
let chrome, bridge, cdp, wss, daemon, metadata;
let mode = "fresh";
const held = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const requests = [];
let upstream,
  rejectTurn = false,
  rejectResume = false,
  rejectRename = false;
try {
  const thread = {
    id: "fixture-task",
    preview: "Browser fixture",
    cwd: "/tmp",
    turns: [
      {
        id: "fixture-turn",
        status: "completed",
        items: [
          {
            id: "message",
            type: "agentMessage",
            text: "Fixture task content [Example](https://example.com/path)",
          },
        ],
      },
    ],
  };
  const other = { ...thread, id: "other-task", preview: "Other task" };
  daemon = http.createServer();
  wss = new WebSocketServer({ server: daemon });
  const socket = join(dir, "app.sock");
  await new Promise((r) => daemon.listen(socket, r));
  wss.on("connection", (ws) => {
    upstream = ws;
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      requests.push(m);
      if (m.method === "thread/name/set") {
        if (rejectRename) {
          ws.send(
            JSON.stringify({
              id: m.id,
              error: { code: -1, message: "Rename unavailable" },
            }),
          );
          return;
        }
        (m.params.threadId === "other-task" ? other : thread).name =
          m.params.name;
      }
      if (m.method === "thread/resume" && rejectResume) {
        ws.send(
          JSON.stringify({
            id: m.id,
            error: { code: -32602, message: "Fixture resume failed" },
          }),
        );
        return;
      }
      if (m.method === "turn/start" && rejectTurn) {
        ws.send(
          JSON.stringify({
            id: m.id,
            error: { code: -32602, message: "Fixture mode unavailable" },
          }),
        );
        return;
      }
      if (m.method && m.id !== undefined) {
        let result = {};
        if (m.method === "thread/list")
          result = {
            data: [
              { ...thread, updatedAt: 1 },
              { ...other, updatedAt: 1 },
            ],
            nextCursor: null,
          };
        if (m.method === "model/list") result = { data: [] };
        if (["thread/read", "thread/resume", "thread/start"].includes(m.method))
          result = { thread, model: "fixture-model", reasoningEffort: "high" };
        if (m.method === "turn/start")
          result = { turn: { id: "new-turn", status: "inProgress" } };
        ws.send(JSON.stringify({ id: m.id, result }));
      }
    });
  });
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const base = JSON.parse(
    await readFile(join(pmRoot, "config.example.json"), "utf8"),
  );
  base.storage = { mount, uuid, root: join(mount, "codex-work") };
  checkStorage(
    validateConfig({
      ...base,
      metadata: {
        ...base.metadata,
        socket: join(base.storage.root, "metadata.sock"),
      },
    }),
  );
  runtime = await mkdtemp(join(base.storage.root, "dashboard-integration-"));
  base.storage.root = runtime;
  base.metadata = {
    socket: join(runtime, "metadata.sock"),
    tokenFile: join(runtime, "token"),
    freshnessSeconds: 120,
  };
  await writeFile(base.metadata.tokenFile, randomBytes(32).toString("hex"), {
    mode: 0o600,
  });
  const pmConfig = join(runtime, "config.local.json");
  await writeFile(pmConfig, JSON.stringify(base), { mode: 0o600 });
  store = openRuntime(validateConfig(base));
  assert.equal(store.projects().length, 2);
  const blocked = store.enqueue("doom-dashboard", 1, {
    private: "SYNTHETIC_PRIVATE_SENTINEL",
  });
  store.blockAndRelease(store.claim("fixture-blocker", 300000), "operator");
  const active = store.enqueue("prime-mover", 1, {});
  const lease = store.claim("fixture-active", 300000);
  assert.equal(lease.jobId, active);
  store.enqueue("doom-dashboard", 2, {});
  assert.equal(store.claim("competing-worker", 300000), null);
  store.setPaused(true);
  worker = spawn(
    process.execPath,
    [join(pmRoot, "dist/cli.js"), "metadata", pmConfig],
    { cwd: pmRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  await Promise.race([
    once(worker.stdout, "data"),
    once(worker, "exit").then(() => {
      throw Error("Metadata process exited before ready");
    }),
  ]);
  const before = digest();
  await writeFile(
    join(dir, "config.json"),
    JSON.stringify({
      bind: ["127.0.0.1"],
      port,
      socket,
      primeMover: {
        socket: base.metadata.socket,
        tokenFile: base.metadata.tokenFile,
      },
    }),
  );
  await writeFile(
    join(dir, "users.json"),
    JSON.stringify({
      version: 1,
      users: await Promise.all(
        ["admin", "user"].map((role) =>
          hashUser({ username: role, password: "browser-fixture", role }),
        ),
      ),
    }),
  );
  bridge = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      DOOM_CONFIG: join(dir, "config.json"),
      DOOM_STATE_DIR: dir,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await sleep(50);
  }
  chrome = spawn(
    "/usr/bin/chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--no-first-run",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${dir}/browser`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let debugPort;
  for (let i = 0; i < 100; i++) {
    try {
      debugPort = (
        await readFile(join(dir, "browser/DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {}
    await sleep(100);
  }
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json`)
  ).json();
  const page = targets.find((t) => t.type === "page");
  cdp = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => cdp.once("open", r));
  let id = 0;
  const pending = new Map(),
    errors = [];
  cdp.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(m.params.exceptionDetails);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      cdp.send(JSON.stringify({ id: n, method, params }));
    });
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await js(expression)) return;
      await sleep(100);
    }
    throw Error(
      "Timeout: " +
        expression +
        " state=" +
        JSON.stringify(
          await js(
            '({url:location.href,error:document.querySelector("#login-error")?.textContent,notice:document.querySelector("#notice")?.textContent,connection:document.querySelector("#connection")?.textContent})',
          ),
        ),
    );
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: `http://127.0.0.1:${port}` });
  await wait(
    'typeof document.querySelector("#login-form")?.onsubmit==="function"',
  );
  await sleep(300);
  const login = async (role) => {
    await js(
      `document.querySelector('#username').value=${JSON.stringify(role)};document.querySelector('#password').value='browser-fixture';document.querySelector('#login-form').requestSubmit()`,
    );
    await wait(
      '!document.querySelector("#workspace").hidden && !!document.querySelector("#tasks button")',
    );
  };
  await login("admin");
  await js('document.querySelector("#tasks button").click()');
  await wait(
    'document.querySelector("#conversation").textContent.includes("Fixture task content")',
  );
  await js('document.querySelector("#show-projects").click()');
  await wait(
    'document.querySelector("#projects-view").textContent.includes("DOOM Dashboard")',
  );
  const content = await js(
    'document.querySelector("#projects-view").textContent',
  );
  for (const expected of [
    "Prime Mover",
    "DOOM Dashboard",
    "Intake paused globally",
    "preparing",
    "Operator action required",
    "blocked",
    "Queued: 1",
  ])
    assert.ok(content.includes(expected), expected);
  assert.ok(!content.includes("SYNTHETIC_PRIVATE_SENTINEL"));
  assert.equal(
    await js('document.querySelectorAll(".project-card").length'),
    2,
  );
  await js(
    `[...document.querySelectorAll('.project-card')].find(c=>c.textContent.includes('Project ID: doom-dashboard')).querySelector('button').click()`,
  );
  assert.equal(
    await js('document.querySelectorAll(".project-card").length'),
    1,
  );
  assert.match(
    await js('document.querySelector(".project-card").textContent'),
    /doom-dashboard/,
  );
  const projected = await js(`fetch('/api/projects').then(r=>r.json())`);
  assert.equal(projected.state, "fresh");
  assert.equal(
    projected.snapshot.projects.find((p) => p.id === "prime-mover").activeJob
      .id,
    active,
  );
  assert.equal(
    await js(`fetch('/api/projects/unknown').then(r=>r.status)`),
    404,
  );
  assert.equal(
    await js(`fetch('/api/projects',{method:'POST'}).then(r=>r.status)`),
    405,
  );
  for (let i = 0; i < 4; i++)
    await js(`fetch('/api/projects').then(r=>r.json())`);
  assert.equal(
    digest(),
    before,
    "metadata browser/API reads must not mutate durable execution state",
  );
  const stopped = once(worker, "exit");
  worker.kill("SIGTERM");
  await stopped;
  worker = null;
  await sleep(5100);
  await js('document.querySelector("#projects-view header button").click()');
  await wait(
    'document.querySelector("#projects-view").textContent.includes("Stale")',
  );
  await js('document.querySelector("#show-tasks").click()');
  assert.equal(await js('document.querySelector("#send").disabled'), false);
  assert.equal(digest(), before);
  await js('document.querySelector("#logout").click()');
  await wait('!document.querySelector("#login").hidden');
  assert.equal(await js(`fetch('/api/projects').then(r=>r.status)`), 401);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        heads,
        schemaVersion: projected.snapshot.schemaVersion,
        realPrimeMoverCliMetadata: true,
        isolatedSyntheticJobs: true,
        twoDefaultProjects: true,
        sameIssueNumbersIsolated: true,
        globalLeaseContention: true,
        browserListDetail: true,
        pausedActiveQueueOutcomeBlocker: true,
        readsLeaveExecutionDigestUnchanged: before,
        sourceStopStale: true,
        tasksUsableDuringOutage: true,
        unauthenticatedDenied: true,
        productionChanged: false,
      },
      null,
      2,
    ),
  );
} finally {
  if (worker && worker.exitCode === null && worker.signalCode === null) {
    const exited = once(worker, "exit");
    worker.kill("SIGTERM");
    await exited;
  }
  store?.close();
  if (runtime) await rm(runtime, { recursive: true, force: true });
  for (const res of held) res.destroy();
  metadata?.close();
  cdp?.close();
  chrome?.kill();
  bridge?.kill();
  for (const ws of wss?.clients || []) ws.terminate();
  wss?.close();
  daemon?.close();
  await sleep(500);
  await rm(dir, { recursive: true, force: true });
}
