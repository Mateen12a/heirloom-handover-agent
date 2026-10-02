// Heirloom sandbox runner.
//
// A minimal, dependency-free HTTP service designed to run inside a Docker
// container with CPU/memory/pid caps, a read-only root filesystem and a
// non-root user. It:
//
//   1. git-clones a public GitHub repository (--depth 1) into a temp dir
//   2. installs its dependencies (npm ci / npm install)
//   3. optionally runs one corrective fix command (the retry loop)
//   4. runs the repository's declared test script
//   5. captures real stdout/stderr, exit codes and durations per phase
//   6. deletes the working directory, always
//
// Authentication: Authorization: Bearer $RUNNER_TOKEN (required).
// Refuses to start as root or without a token.

import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { createServer } from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 8790);
const TOKEN = process.env.RUNNER_TOKEN || "";
const CLONE_TIMEOUT_MS = Number(process.env.CLONE_TIMEOUT || 45_000);
const INSTALL_TIMEOUT_MS = Number(process.env.INSTALL_TIMEOUT || 150_000);
const FIX_TIMEOUT_MS = Number(process.env.FIX_TIMEOUT || 60_000);
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT || 120_000);
const HARD_DEADLINE_MS = Number(process.env.HARD_DEADLINE || 480_000);
const OUTPUT_CAP = 8_000;

const REPO_URL_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/)?(\.git)?$/;

// ── guardrails ─────────────────────────────────────────────────────────────
// The root and token checks run at server startup (see "listen" below), so
// the execute() logic stays importable for selftests.

// ── process execution with hard timeouts ───────────────────────────────────
function run(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const display = [command, ...args].join(" ");
    let out = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "true",
        HUSKY: "0",
        npm_config_update_notifier: "false",
      },
    });

    const append = (chunk) => {
      out += String(chunk);
      if (out.length > OUTPUT_CAP * 2) out = out.slice(-OUTPUT_CAP * 2);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        command: display,
        output: out.slice(-OUTPUT_CAP) || "(no output)",
        durationMs: Date.now() - started,
        timedOut,
      });
    };

    child.on("error", (err) => {
      finish({ ok: false, exitCode: -1, output: String(err.message) });
    });
    child.on("close", (code) => {
      finish({ ok: code === 0 && !timedOut, exitCode: code ?? -1 });
    });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ── one execution ──────────────────────────────────────────────────────────
async function execute({ repoUrl, fixCommand }) {
  const startedAt = Date.now();
  const deadline = startedAt + HARD_DEADLINE_MS;
  const timeLeft = () => deadline - Date.now();
  const dir = await mkdtemp(join(tmpdir(), "heirloom-"));

  try {
    const clone = await run(
      "git",
      ["clone", "--depth", "1", "--quiet", repoUrl, "repo"],
      { cwd: dir, timeoutMs: Math.min(CLONE_TIMEOUT_MS, timeLeft()) },
    );
    if (!clone.ok) {
      return {
        ok: true,
        phase: "clone",
        clone,
        install: null,
        fix: null,
        test: null,
        totalMs: Date.now() - startedAt,
      };
    }

    const repo = join(dir, "repo");
    let pkg = null;
    try {
      pkg = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
    } catch {
      /* no manifest */
    }
    if (!pkg) {
      return {
        ok: true,
        phase: "manifest",
        clone,
        install: null,
        fix: null,
        test: {
          ok: false,
          command: "cat package.json",
          exitCode: 1,
          timedOut: false,
          output:
            "No package.json at the repository root. Nothing to install or test.",
          durationMs: 0,
        },
        totalMs: Date.now() - startedAt,
      };
    }

    const hasLock = await exists(join(repo, "package-lock.json"));
    const install = await run(
      "npm",
      [hasLock ? "ci" : "install", "--no-audit", "--no-fund", "--loglevel=error"],
      { cwd: repo, timeoutMs: Math.min(INSTALL_TIMEOUT_MS, timeLeft()) },
    );

    let fix = null;
    if (fixCommand && timeLeft() > 5_000) {
      fix = await run("sh", ["-c", fixCommand], {
        cwd: repo,
        timeoutMs: Math.min(FIX_TIMEOUT_MS, timeLeft()),
      });
    }

    let test;
    if (pkg.scripts && pkg.scripts.test) {
      test = await run("npm", ["test"], {
        cwd: repo,
        timeoutMs: Math.min(TEST_TIMEOUT_MS, timeLeft()),
      });
    } else {
      test = {
        ok: false,
        command: "npm test",
        exitCode: 127,
        timedOut: false,
        output: "No test script declared in package.json.",
        durationMs: 0,
      };
    }

    return {
      ok: true,
      phase: "complete",
      clone,
      install,
      fix,
      test,
      fixCommand: fixCommand ?? null,
      totalMs: Date.now() - startedAt,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── http plumbing ──────────────────────────────────────────────────────────
function authorized(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(TOKEN);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

// Serialize executions: one repo at a time, so a burst never overruns the box.
let lock = Promise.resolve();
function withLock(fn) {
  const next = lock.then(fn, fn);
  lock = next.catch(() => {});
  return next;
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, uid: process.getuid?.() ?? null });
    return;
  }

  if (req.method !== "POST" || req.url !== "/execute") {
    sendJson(res, 404, { ok: false, reason: "not_found" });
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, { ok: false, reason: "unauthorized" });
    return;
  }

  let body = "";
  let aborted = false;
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 16_384) {
      aborted = true;
      sendJson(res, 413, { ok: false, reason: "payload_too_large" });
      req.destroy();
    }
  });
  req.on("end", () => {
    if (aborted) return;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { ok: false, reason: "bad_json" });
      return;
    }
    const repoUrl = String(parsed.repoUrl || "").trim();
    const fixCommand =
      typeof parsed.fixCommand === "string" && parsed.fixCommand.trim()
        ? parsed.fixCommand.trim().slice(0, 240)
        : null;

    if (!REPO_URL_RE.test(repoUrl)) {
      sendJson(res, 400, {
        ok: false,
        reason: "rejected",
        detail: "Only https://github.com/owner/repo URLs are accepted.",
      });
      return;
    }

    withLock(() => execute({ repoUrl, fixCommand }))
      .then((result) => sendJson(res, 200, result))
      .catch((err) =>
        sendJson(res, 500, {
          ok: false,
          reason: "runner_error",
          detail: String(err?.message || err),
        }),
      );
  });
});

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    console.error(
      "[runner] Refusing to run as root. Use a Dockerfile with `USER node`.",
    );
    process.exit(1);
  }
  if (!TOKEN) {
    console.error("[runner] RUNNER_TOKEN is required.");
    process.exit(1);
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[runner] listening on :${PORT} as uid ${process.getuid?.() ?? "?"}`,
    );
  });
}

export { execute };
