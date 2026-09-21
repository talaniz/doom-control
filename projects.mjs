import http from "node:http";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

export const projectRepositories = Object.freeze({
  "prime-mover": "talaniz/prime-mover",
  "doom-dashboard": "talaniz/doom-control",
});
const stages = new Set([
  "discovered",
  "authorized",
  "queued",
  "preparing",
  "implementing",
  "verifying",
  "pr-open",
  "code-review",
  "code-fixes",
  "e2e-review",
  "e2e-fixes",
  "ready",
  "waiting",
  "blocked",
  "cancelled",
  "merged",
  "closed",
]);
const invalid = () => {
  throw Error("Invalid project metadata");
};
function text(value, max = 300) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    invalid();
  return value;
}
function date(value) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}
function one(value, allowed) {
  if (!allowed.includes(value)) invalid();
  return value;
}
function link(value, repo, type) {
  const prefix = `https://github.com/${repo}/${type}/`;
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    !/^[1-9][0-9]*$/.test(value.slice(prefix.length))
  )
    invalid();
  return value;
}
function job(value, repo, outcome = false) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !stages.has(value.stage))
    invalid();
  return {
    ...(outcome ? { at: date(value.at) } : { id: text(value.id, 100) }),
    stage: value.stage,
    issueUrl: link(value.issueUrl, repo, "issues"),
    prUrl: value.prUrl === null ? null : link(value.prUrl, repo, "pull"),
  };
}
export function validateSnapshot(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.freshnessSeconds) ||
    value.freshnessSeconds < 1 ||
    value.freshnessSeconds > 3600 ||
    typeof value.intakePaused !== "boolean" ||
    !Array.isArray(value.projects) ||
    value.projects.length > 2
  )
    invalid();
  const seen = new Set();
  const projects = value.projects.map((p) => {
    if (!p || !Object.hasOwn(projectRepositories, p.id) || seen.has(p.id))
      invalid();
    seen.add(p.id);
    const repo = projectRepositories[p.id];
    if (
      p.repositoryUrl !== `https://github.com/${repo}` ||
      !Number.isSafeInteger(p.queuedJobs) ||
      p.queuedJobs < 0
    )
      invalid();
    return {
      id: p.id,
      name: text(p.name),
      repositoryUrl: p.repositoryUrl,
      baseBranch: text(p.baseBranch, 200),
      tracking: one(p.tracking, ["enabled", "paused", "blocked"]),
      lastPollAt: p.lastPollAt === null ? null : date(p.lastPollAt),
      pollState: one(p.pollState, ["fresh", "stale", "never-polled"]),
      queuedJobs: p.queuedJobs,
      activeJob: job(p.activeJob, repo),
      latestOutcome: job(p.latestOutcome, repo, true),
      blocker: p.blocker === null ? null : text(p.blocker, 500),
    };
  });
  return {
    schemaVersion: 1,
    observedAt: date(value.observedAt),
    freshnessSeconds: value.freshnessSeconds,
    intakePaused: value.intakePaused,
    projects,
  };
}
/** Fixed read-only Unix request; credentials and provider diagnostics never reach the browser. */
export async function readMetadata(config) {
  if (
    !config ||
    !isAbsolute(config.socket || "") ||
    !isAbsolute(config.tokenFile || "")
  )
    throw Error("Project metadata unavailable");
  const stat = await lstat(config.tokenFile);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    stat.size > 4096
  )
    throw Error("Project metadata unavailable");
  const token = (await readFile(config.tokenFile, "utf8")).trim();
  if (token.length < 32 || /\s/.test(token))
    throw Error("Project metadata unavailable");
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: config.socket,
        path: "/v1/projects",
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error("Project metadata unavailable"));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1024 * 1024)
            req.destroy(Error("Project metadata unavailable"));
          else chunks.push(chunk);
        });
        res.on("error", () => reject(Error("Project metadata unavailable")));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(Error("Project metadata unavailable"));
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(Error("Project metadata unavailable")),
      2000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(Error("Project metadata unavailable")));
    req.end();
  });
}
export class ProjectsReader {
  constructor(fetchSnapshot, now = Date.now) {
    this.fetchSnapshot = fetchSnapshot;
    this.now = now;
    this.snapshot = null;
    this.failed = false;
    this.lastAttempt = null;
    this.pending = null;
  }
  async read() {
    if (this.pending) await this.pending;
    else if (
      this.lastAttempt === null ||
      this.now() - this.lastAttempt >= 5000
    ) {
      this.pending = (async () => {
        try {
          this.snapshot = validateSnapshot(await this.fetchSnapshot());
          this.failed = false;
        } catch {
          this.failed = true;
        } finally {
          this.lastAttempt = this.now();
        }
      })();
      try {
        await this.pending;
      } finally {
        this.pending = null;
      }
    }
    const snapshot = this.snapshot;
    const age = snapshot
      ? this.now() - Date.parse(snapshot.observedAt)
      : Infinity;
    const state = !snapshot
      ? "unavailable"
      : this.failed || age > snapshot.freshnessSeconds * 1000 || age < -5000
        ? "stale"
        : "fresh";
    return {
      state,
      snapshot,
      error: this.failed
        ? "Prime Mover metadata unavailable. Check the worker connection."
        : null,
    };
  }
}
