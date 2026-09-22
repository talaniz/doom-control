import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { hashUser } from "../auth.mjs";
import assert from "node:assert/strict";
import { snapshot } from "../test/fixtures/projects.mjs";
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
  const metadataSocket = join(dir, "metadata.sock"),
    tokenFile = join(dir, "metadata.token");
  await writeFile(tokenFile, "fixture-projects-token-that-is-long-enough", {
    mode: 0o600,
  });
  metadata = http.createServer((req, res) => {
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/v1/projects");
    if (mode === "hold") {
      held.push(res);
      return;
    }
    if (mode === "fail") {
      res.writeHead(503).end();
      return;
    }
    const data = snapshot();
    data.observedAt = new Date(
      mode === "stale" ? Date.now() - 300000 : Date.now(),
    ).toISOString();
    data.projects[0].pollState = "fresh";
    data.projects[0].lastPollAt = new Date(Date.now() - 120000).toISOString();
    data.projects[0].latestOutcome = {
      stage: "ready", prUrl: null,
      issueUrl: "https://github.com/talaniz/prime-mover/issues/1",
      at: new Date(Date.now() - 7200000).toISOString(),
    };
    if (mode === "empty") data.projects = [];
    if (mode === "active") {
      data.intakePaused = true;
      data.projects[1].tracking = "blocked";
      data.projects[0].activeJob = {
        id: "synthetic-job",
        stage: "code-review",
        issueUrl: "https://github.com/talaniz/prime-mover/issues/1",
        prUrl: "https://github.com/talaniz/prime-mover/pull/2",
      };
      data.projects[1].blocker =
        "Synthetic blocker: awaiting owner clarification";
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  });
  await new Promise((r) => metadata.listen(metadataSocket, r));
  await writeFile(
    join(dir, "config.json"),
    JSON.stringify({
      bind: ["127.0.0.1"],
      port,
      socket,
      primeMover: { socket: metadataSocket, tokenFile },
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
  const evidence = process.env.DOOM_UI_EVIDENCE;
  const capture = async (state) => {
    if (!evidence) return;
    await mkdir(evidence, { recursive: true });
    for (const [name, width, height, mobile] of [
      ["desktop", 1440, 900, false],
      ["mobile", 390, 844, true],
    ]) {
      await call("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        mobile,
        deviceScaleFactor: 1,
      });
      await js(state === "exact-project-times"
        ? 'document.querySelector(".project-card .project-time").scrollIntoView({block:"start"})'
        : 'document.querySelector("#projects-view").scrollIntoView()');
      await js("document.fonts.ready");
      assert.equal(
        await js("document.documentElement.scrollWidth<=innerWidth"),
        true,
      );
      const shot = await call("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      await writeFile(
        join(evidence, `${name}-${state}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
    await call("Emulation.clearDeviceMetricsOverride");
  };
  mode = "fail";
  await login("admin");
  await js('document.querySelector("#show-projects").click()');
  await wait(
    'document.querySelector("#projects-view").textContent.includes("Project metadata unavailable")',
  );
  await capture("unavailable");
  await js('document.querySelector("#show-tasks").click()');
  mode = "fresh";
  await sleep(5100);
  await js('document.querySelector("#tasks button").click()');
  await wait(
    'document.querySelector("#conversation").textContent.includes("Fixture task content")',
  );
  await js(
    `document.querySelector('#prompt').value='Keep my project-switch draft'`,
  );
  const before = requests.length;
  await js('document.querySelector("#show-projects").click()');
  await wait(
    'document.querySelector("#projects-view").textContent.includes("DOOM Dashboard")',
  );
  await capture("relative-times");
  await js('document.querySelector(".project-time summary").focus()');
  await call("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await wait('document.querySelector(".project-time").open');
  assert.match(await js('document.querySelector(".project-time time").textContent'), /2026/);
  await capture("exact-snapshot-keyboard");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
  await call("Emulation.setTouchEmulationEnabled", { enabled: true });
  await js('document.querySelector(".project-card .project-time summary").scrollIntoView({block:"center"})');
  const point = await js('(()=>{const r=document.querySelector(".project-card .project-time summary").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait('document.querySelector(".project-card .project-time").open');
  await js('document.querySelectorAll(".project-card .project-time")[1].querySelector("summary").focus()');
  await call("Input.dispatchKeyEvent", { type: "keyDown", text: " ", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await wait('document.querySelectorAll(".project-card .project-time")[1].open');
  await capture("exact-project-times");
  await call("Emulation.setTouchEmulationEnabled", { enabled: false });
  assert.equal(await js('document.querySelector("#task-view").hidden'), true);
  assert.ok(!requests.slice(before).some((m) => m.method === "turn/start"));
  await js('document.querySelector("#show-tasks").click()');
  assert.equal(
    await js('document.querySelector("#prompt").value'),
    "Keep my project-switch draft",
  );
  assert.equal(await js('document.querySelector("#task-view").hidden'), false);
  await js('document.querySelector("#show-projects").click()');
  await wait(
    'document.querySelector("#projects-view").textContent.includes("DOOM Dashboard")',
  );
  await js(
    `[...document.querySelectorAll('#projects-view button')].find(b=>b.textContent==='View project').click()`,
  );
  assert.equal(
    await js('document.querySelectorAll(".project-card").length'),
    1,
  );
  await js(
    `[...document.querySelectorAll('#projects-view button')].find(b=>b.textContent.includes('All projects')).click()`,
  );
  const refresh = async () => {
    await sleep(5100);
    await js('document.querySelector("#projects-view header button").focus();document.querySelector("#projects-view header button").click()');
    await wait(
      '!document.querySelector("#projects-view header button").disabled',
    );
    assert.equal(await js('document.activeElement === document.querySelector("#projects-view header button")'),true,'Refresh retains keyboard focus');
  };
  mode = "active";
  await refresh();
  await capture("active-blocked");
  await js(
    `[...document.querySelectorAll('#projects-view button')].find(b=>b.textContent==='View project').click()`,
  );
  await capture("detail");
  await js(
    `[...document.querySelectorAll('#projects-view button')].find(b=>b.textContent.includes('All projects')).click()`,
  );
  mode = "fail";
  await refresh();
  await capture("stale");
  assert.match(
    await js('document.querySelector("#projects-view").textContent'),
    /Stale/,
  );
  assert.match(
    await js('document.querySelector("#projects-view").textContent'),
    /DOOM Dashboard/,
  );
  await js('document.querySelector("#show-tasks").click()');
  assert.equal(await js('document.querySelector("#send").disabled'), false);
  await js('document.querySelector("#logout").click()');
  await wait('!document.querySelector("#login").hidden');
  assert.equal(
    await js('document.querySelector("#projects-view").textContent'),
    "",
  );
  mode = "fresh";
  await login("user");
  await js('document.querySelector("#show-projects").click()');
  await wait('document.querySelectorAll(".project-card").length===2');
  assert.equal(await js('document.querySelector("#composer").hidden'), true);
  assert.equal(
    await js(`fetch('/api/projects',{method:'POST'}).then(r=>r.status)`),
    405,
  );
  for (const viewport of [
    { width: 1440, height: 900, mobile: false },
    { width: 390, height: 844, mobile: true },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 1,
    });
    assert.equal(
      await js("document.documentElement.scrollWidth<=innerWidth"),
      true,
      "Projects fits viewport",
    );
  }
  mode = "empty";
  await refresh();
  await capture("empty-registry");
  assert.match(
    await js('document.querySelector("#projects-view").textContent'),
    /No projects registered/,
  );
  // Hold the browser request before dispatch so loading is deterministic without timing the upstream timeout.
  await call("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/projects", requestStage: "Request" }],
  });
  let pausedRequest;
  const paused = (raw) => {
    const m = JSON.parse(raw);
    if (m.method === "Fetch.requestPaused") pausedRequest = m.params.requestId;
  };
  cdp.on("message", paused);
  await js('document.querySelector("#projects-view header button").click()');
  for (let i = 0; i < 100 && !pausedRequest; i++) await sleep(20);
  assert.ok(pausedRequest);
  await wait(
    'document.querySelector("#projects-view").textContent.includes("Loading projects")',
  );
  await capture("loading");
  await call("Fetch.continueRequest", { requestId: pausedRequest });
  await call("Fetch.disable");
  cdp.off("message", paused);
  await wait(
    '!document.querySelector("#projects-view header button").disabled',
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Chromium Projects: authenticated admin/viewer list/detail, stale cache, task/draft preservation, worker-outage task controls, no turn mutation, POST denied, logout clearing, desktop/mobile width, no JS exceptions.",
  );
} finally {
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
