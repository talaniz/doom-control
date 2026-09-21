import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { scryptSync } from "node:crypto";
import { snapshot } from "./fixtures/projects.mjs";
test(
  "authenticated Projects endpoint exposes only read-only validated metadata and leaves other APIs usable",
  { timeout: 20000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "doom-projects-")),
      socket = join(dir, "metadata.sock"),
      token = "synthetic-metadata-token-0123456789";
    let reads = 0;
    const source = http.createServer((req, res) => {
      reads++;
      assert.equal(req.method, "GET");
      assert.equal(req.url, "/v1/projects");
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      const data = snapshot();
      data.observedAt = new Date().toISOString();
      data.secret = token;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
    await new Promise((r) => source.listen(socket, r));
    const probe = http.createServer();
    await new Promise((r) => probe.listen(0, "127.0.0.1", r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    const tokenFile = join(dir, "token");
    await writeFile(tokenFile, token, { mode: 0o600 });
    const salt = Buffer.alloc(16, 1).toString("hex");
    await writeFile(
      join(dir, "users.json"),
      JSON.stringify({
        version: 1,
        users: ["viewer", "admin"].map((username) => ({
          username,
          role: username === "admin" ? "admin" : "user",
          salt,
          passwordHash: scryptSync("fixture-password", salt, 64).toString(
            "hex",
          ),
        })),
      }),
      { mode: 0o600 },
    );
    const config = join(dir, "config.json");
    await writeFile(
      config,
      JSON.stringify({
        bind: ["127.0.0.1"],
        port,
        socket: join(dir, "unused-app.sock"),
        primeMover: { socket, tokenFile },
      }),
    );
    const child = spawn(process.execPath, ["server.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, DOOM_CONFIG: config, DOOM_STATE_DIR: dir },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (b) => {
      stderr += b;
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill();
        await exit;
      }
      await new Promise((r) => source.close(r));
      await rm(dir, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) assert.fail(stderr);
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal((await fetch(base + "/api/projects")).status, 401);
    assert.equal(reads, 0);
    const login = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "viewer",
        password: "fixture-password",
      }),
    });
    assert.equal(login.status, 200);
    const headers = { cookie: login.headers.get("set-cookie").split(";")[0] };
    let response = await fetch(base + "/api/projects", { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.state, "fresh");
    assert.equal(body.snapshot.projects.length, 2);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(token));
    response = await fetch(base + "/api/projects/prime-mover", { headers });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).snapshot.projects.length, 1);
    const before = reads;
    assert.equal(
      (await fetch(base + "/api/projects/unknown", { headers })).status,
      404,
    );
    assert.equal(
      (await fetch(base + "/api/projects", { headers, method: "POST" })).status,
      405,
    );
    assert.equal(reads, before);
    assert.equal((await fetch(base + "/api/status", { headers })).status, 200);
  },
);
