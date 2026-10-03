// Heirloom sandbox runner.
//
// A minimal, dependency-free HTTP service designed to run inside a Docker
// container with CPU/memory/pid caps, a read-only root filesystem and a
// non-root user. Every phase returns the real command, exit code and stdout.
//
// Modes (POST /execute, bearer RUNNER_TOKEN):
//
//   probe    { repoUrl, probes: "node" | "generic" }
//            Clones and runs fixed, code-owned probe commands (git ls-files,
//            npm pkg get, toolchain versions). Nothing is installed and the
//            working directory is deleted before the response.
//
//   prepare  { repoUrl, install, build?, tests }
//            Clones, installs, optionally builds, runs the baseline tests and
//            opens a repair session that keeps the working tree alive.
//
//   cycle    { sessionId, fixCommands, tests }
//            Applies allowlisted corrective commands to the open session and
//            reruns the tests. One clone, one install, N repair cycles.
//
//   close    { sessionId, close: true }
//            Deletes the session working tree.
//
// Guardrails: GitHub-only repo URLs, strict executable allowlist, per-argument
// screening (no shell metacharacters, no absolute paths, no traversal), hard
// timeouts per phase, a global hard deadline per request, a session idle TTL,
// and a single in-flight operation at a time.

import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 8790);
const TOKEN = process.env.RUNNER_TOKEN || "";
const CLONE_TIMEOUT_MS = Number(process.env.CLONE_TIMEOUT || 60_000);
const INSTALL_TIMEOUT_MS = Number(process.env.INSTALL_TIMEOUT || 240_000);
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT || 180_000);
const FIX_TIMEOUT_MS = Number(process.env.FIX_TIMEOUT || 90_000);
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT || 180_000);
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT || 30_000);
const HARD_DEADLINE_MS = Number(process.env.HARD_DEADLINE || 480_000);
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE || 240_000);
const SESSION_MAX_MS = Number(process.env.SESSION_MAX || 900_000);
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 3);
const OUTPUT_CAP = 8_000;

const REPO_URL_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/)?(\.git)?$/;

// ── command allowlist ──────────────────────────────────────────────────────
// Model-authored corrective commands are argv arrays, never shell lines. Only
// package managers, the Node runtime (version check), Python (pip/pytest) and
// a handful of known test runners via npx are executable, and every argument
// is screened for shell metacharacters, absolute paths and traversal.
const EXECUTABLES = new Set(["npm", "pnpm", "yarn", "bun", "npx", "python3", "node"]);
const BANNED_FLAGS = ["--registry", "-g", "--global", "--prefix", "--userconfig", "--location"];
const BANNED_TOKENS = new Set([
  "publish", "unpublish", "login", "logout", "adduser", "token", "owner", "team",
  "access", "deprecate", "dist-tag", "hook", "exec", "dlx", "link", "create",
  "init", "eval", "sudo", "curl", "wget", "chmod", "chown", "nc", "dd", "mkfs",
]);
const NPX_RUNNERS = new Set(["mocha", "jest", "vitest", "ava", "tape", "jasmine"]);
const META_RE = /[;|&$><`\n\r\\]/;
const QUOTE_RE = /['"]/;

const fail = (detail) => ({ ok: false, detail });

function validateArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) return fail("empty command");
  if (argv.length > 16) return fail("too many arguments (max 16)");
  const exe = typeof argv[0] === "string" ? argv[0] : "";
  if (!EXECUTABLES.has(exe)) return fail(`executable not allowed: ${exe || "(missing)"}`);
  let chars = 0;
  for (const raw of argv) {
    if (typeof raw !== "string") return fail("arguments must be strings");
    if (!raw) return fail("empty argument");
    if (raw.length > 160) return fail(`argument too long: ${raw.slice(0, 40)}…`);
    chars += raw.length + 1;
    if (META_RE.test(raw)) return fail(`shell metacharacter in: ${raw}`);
    // Quotes survive tokenization as literal characters and would be
    // reinterpreted by cmd.exe when the runner is used on Windows.
    if (QUOTE_RE.test(raw)) return fail(`quote character in: ${raw}`);
    if (raw.includes("..")) return fail(`path traversal in: ${raw}`);
    if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) return fail(`absolute path in: ${raw}`);
  }
  if (chars > 400) return fail("command too long (max 400 chars)");
  if (exe === "node" && !(argv.length === 2 && argv[1] === "--version")) {
    return fail("node is only allowed as `node --version`");
  }
  if (exe === "python3") {
    const module = argv[3] ?? "";
    if (argv[1] !== "-m" || !["pip", "pytest"].includes(argv[2])) {
      return fail("python3 is only allowed as `python3 -m pip|pytest …`");
    }
    if (argv[2] === "pip" && !["install", "uninstall"].includes(module)) {
      return fail("python3 -m pip is limited to install/uninstall");
    }
  }
  if (exe === "npx") {
    const bin = argv.slice(1).find((a) => !a.startsWith("-"));
    if (!bin || !NPX_RUNNERS.has(bin)) {
      return fail(`npx is limited to: ${[...NPX_RUNNERS].join(", ")}`);
    }
  }
  for (const tok of argv.slice(1)) {
    if (BANNED_FLAGS.some((f) => tok === f || tok.startsWith(`${f}=`))) {
      return fail(`flag not allowed: ${tok}`);
    }
    if (BANNED_TOKENS.has(tok.toLowerCase())) return fail(`token not allowed: ${tok}`);
  }
  return { ok: true };
}

// Quote-aware splitter for a single-line model-authored command. Returns null
// when the line contains shell metacharacters, unbalanced quotes or is too
// long, so callers can drop the proposal instead of guessing.
function tokenizeCommand(line) {
  const s = String(line ?? "").trim();
  if (!s || s.length > 400 || META_RE.test(s)) return null;
  const out = [];
  let cur = "";
  let quote = null;
  let started = false;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (cur || started) out.push(cur);
      cur = "";
      started = false;
    } else {
      cur += ch;
    }
  }
  if (quote) return null;
  if (cur || started) out.push(cur);
  return out.length > 0 ? out : null;
}

async function validateCwd(cwd, repoRoot) {
  const raw = typeof cwd === "string" && cwd.trim() ? cwd.trim() : ".";
  if (raw.length > 160) return fail("working directory path too long");
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.includes("\\") || raw.includes("..")) {
    return fail(`working directory must be a relative path inside the repo: ${raw}`);
  }
  const abs = resolve(repoRoot, raw);
  if (abs !== repoRoot && !abs.startsWith(repoRoot + sep)) {
    return fail(`working directory escapes the repo: ${raw}`);
  }
  try {
    const st = await stat(abs);
    if (!st.isDirectory()) return fail(`working directory is not a directory: ${raw}`);
  } catch {
    return fail(`working directory does not exist in the clone: ${raw}`);
  }
  return { ok: true, cwd: raw === "." ? "." : raw.replace(/^\.\//, ""), abs };
}

// ── process execution with hard timeouts ───────────────────────────────────
const WINDOWS = process.platform === "win32";

function runCapture(exe, args, { cwd, timeoutMs }) {
  return new Promise((resolveResult) => {
    const started = Date.now();
    const display = [exe, ...args].join(" ");
    let out = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(exe, args, {
      cwd,
      // Windows npm/git shims need a shell; on Linux (the deployment target)
      // nothing changes. Every argument is allowlist-screened before it
      // reaches this function.
      shell: WINDOWS,
      windowsHide: true,
      detached: !WINDOWS,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "true",
        HUSKY: "0",
        NO_COLOR: "1",
        npm_config_update_notifier: "false",
        npm_config_fund: "false",
        npm_config_audit: "false",
        PIP_DISABLE_PIP_VERSION_CHECK: "1",
        PIP_BREAK_SYSTEM_PACKAGES: "1",
        PYTHONUNBUFFERED: "1",
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
        if (WINDOWS) process.kill(child.pid, "SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const trimmed = out.trim();
      resolveResult({
        ...result,
        command: display,
        output: trimmed.slice(-OUTPUT_CAP) || "(no output)",
        durationMs: Date.now() - started,
        timedOut,
        ...(out.length > OUTPUT_CAP
          ? { outputTruncated: true }
          : {}),
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

// ── probe mode ─────────────────────────────────────────────────────────────
// Fixed, code-owned commands. Node mode adds manifest facts and toolchain
// versions; generic mode stays with git-only evidence so a Python, Rust or Go
// repository still gets honest, executed probes.
function probeCommands(mode) {
  const probes = [
    { exe: "git", args: ["rev-parse", "HEAD"], display: "git rev-parse HEAD" },
    { exe: "git", args: ["log", "-1", "--format=%cI"], display: "git log -1 --format=%cI" },
    {
      exe: "git",
      args: ["ls-files", "--", "*test*", "*spec*"],
      display: "git ls-files '*test*' '*spec*'",
    },
    {
      exe: "git",
      args: [
        "ls-files",
        "--",
        "*requirements*.txt",
        "*pyproject.toml",
        "*setup.py",
        "*setup.cfg",
        "*Pipfile",
        "*pom.xml",
        "*build.gradle*",
        "*go.mod",
        "*Cargo.toml",
        "*Gemfile",
        "*composer.json",
      ],
      display:
        "git ls-files '*requirements*.txt' '*pyproject.toml' '*setup.py' '*Pipfile' '*pom.xml' '*build.gradle*' '*go.mod' '*Cargo.toml' '*Gemfile' '*composer.json'",
    },
    {
      exe: "git",
      args: ["ls-files", "--", ".github/workflows"],
      display: "git ls-files .github/workflows",
    },
    {
      exe: "git",
      args: ["ls-files", "--", "*Dockerfile*", "*docker-compose*", "*compose.y*ml", "*.devcontainer*"],
      display: "git ls-files '*Dockerfile*' '*docker-compose*' '*compose.y*ml' '*.devcontainer*'",
    },
    {
      exe: "git",
      args: ["ls-files", "--", "*env.example", "*env.sample", "*env.template", "*env.dist"],
      display: "git ls-files '*env.example' '*env.sample' '*env.template' '*env.dist'",
    },
    {
      exe: "git",
      args: ["ls-files", "--", "*LICENSE*", "*License*", "*license*", "*COPYING*", "*Copying*"],
      display: "git ls-files '*LICENSE*' '*License*' '*license*' '*COPYING*' '*Copying*'",
    },
  ];
  if (mode === "node") {
    probes.push(
      {
        exe: "npm",
        args: ["pkg", "get", "scripts", "engines", "workspaces", "packageManager"],
        display: "npm pkg get scripts engines workspaces packageManager",
      },
      { exe: "node", args: ["--version"], display: "node --version" },
      { exe: "npm", args: ["--version"], display: "npm --version" },
    );
  }
  return probes;
}

async function runProbes(repo, mode) {
  const results = [];
  for (const probe of probeCommands(mode)) {
    const res = await runCapture(probe.exe, probe.args, {
      cwd: repo,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    results.push({
      command: probe.display,
      output: res.output,
      exitCode: res.exitCode,
    });
  }
  return results;
}

// ── repair sessions ────────────────────────────────────────────────────────
// A session owns one cloned+installed working tree so a multi-cycle repair
// loop runs on the same clone instead of reinstalling between cycles.
const sessions = new Map();

function sweepSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    const stale =
      now - s.lastUsedAt > SESSION_IDLE_MS || now - s.createdAt > SESSION_MAX_MS;
    if (stale && !s.busy) {
      sessions.delete(id);
      rm(s.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function dropSession(id) {
  const s = sessions.get(id);
  if (!s) return false;
  sessions.delete(id);
  await rm(s.dir, { recursive: true, force: true }).catch(() => {});
  return true;
}

// ── one request ────────────────────────────────────────────────────────────
async function execute(payload) {
  const startedAt = Date.now();
  const repoUrl = String(payload?.repoUrl || "").trim();
  if (!REPO_URL_RE.test(repoUrl)) {
    return {
      status: 400,
      body: {
        ok: false,
        reason: "rejected",
        detail: "Only https://github.com/owner/repo URLs are accepted.",
      },
    };
  }
  sweepSessions();

  // Session close.
  if (payload.close === true) {
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
    const closed = sessionId ? await dropSession(sessionId) : false;
    return { status: 200, body: { ok: true, closed, totalMs: Date.now() - startedAt } };
  }

  // Repair cycle on an open session.
  if (typeof payload.sessionId === "string" && payload.sessionId) {
    const sessionId = payload.sessionId;
    const session = sessions.get(sessionId);
    if (!session) {
      return {
        status: 409,
        body: {
          ok: false,
          reason: "session_expired",
          detail: "The sandbox session was cleaned up (idle or lifetime cap).",
        },
      };
    }
    if (session.busy) {
      return {
        status: 409,
        body: { ok: false, reason: "busy", detail: "The session already has an operation in flight." },
      };
    }
    session.busy = true;
    session.lastUsedAt = Date.now();
    try {
      const deadline = Math.min(startedAt + HARD_DEADLINE_MS, session.createdAt + SESSION_MAX_MS);
      const timeLeft = () => deadline - Date.now();
      const fixCommandGroups = Array.isArray(payload.fixCommands) ? payload.fixCommands : [];
      const fixes = [];
      let note;

      for (const argv of fixCommandGroups) {
        const valid = validateArgv(argv);
        if (!valid.ok) {
          return { status: 400, body: { ok: false, reason: "rejected", detail: valid.detail } };
        }
        if (timeLeft() < 5_000) {
          note = "deadline_reached";
          break;
        }
        const fix = await runCapture(argv[0], argv.slice(1), {
          cwd: session.repo,
          timeoutMs: Math.min(FIX_TIMEOUT_MS, timeLeft()),
        });
        fixes.push(fix);
        if (!fix.ok) break;
      }

      let tests = [];
      if (!note && (!fixes.length || fixes.every((f) => f.ok))) {
        const out = await runTestEntries(session.repo, payload.tests, timeLeft);
        tests = out.results;
        if (out.note) note = out.note;
      }

      return {
        status: 200,
        body: {
          ok: true,
          sessionId,
          fixes,
          tests,
          totalMs: Date.now() - startedAt,
          ...(note ? { note } : {}),
        },
      };
    } finally {
      session.busy = false;
      session.lastUsedAt = Date.now();
    }
  }

  // Fresh execution: probe mode or repair prepare.
  const dir = await mkdtemp(join(tmpdir(), "heirloom-"));
  let keepDir = false;
  try {
    const clone = await runCapture(
      "git",
      ["clone", "--depth", "1", "--quiet", repoUrl, "repo"],
      { cwd: dir, timeoutMs: Math.min(CLONE_TIMEOUT_MS, HARD_DEADLINE_MS) },
    );
    const repo = join(dir, "repo");

    if (payload.probes === "node" || payload.probes === "generic") {
      if (!clone.ok) {
        return { status: 200, body: { ok: true, clone, probes: [], totalMs: Date.now() - startedAt } };
      }
      const probes = await runProbes(repo, payload.probes);
      return { status: 200, body: { ok: true, clone, probes, totalMs: Date.now() - startedAt } };
    }

    // Repair prepare.
    const installValid = validateArgv(payload.install);
    if (!installValid.ok) {
      return { status: 400, body: { ok: false, reason: "rejected", detail: `install: ${installValid.detail}` } };
    }
    if (payload.build != null) {
      const buildValid = validateArgv(payload.build);
      if (!buildValid.ok) {
        return { status: 400, body: { ok: false, reason: "rejected", detail: `build: ${buildValid.detail}` } };
      }
    }
    const testEntries = [];
    for (const entry of payload.tests ?? []) {
      const cwdCheck = await validateCwd(entry?.cwd, repo);
      if (!cwdCheck.ok) {
        return { status: 400, body: { ok: false, reason: "rejected", detail: `tests: ${cwdCheck.detail}` } };
      }
      const argvValid = validateArgv(entry?.argv);
      if (!argvValid.ok) {
        return { status: 400, body: { ok: false, reason: "rejected", detail: `tests: ${argvValid.detail}` } };
      }
      testEntries.push({ cwd: cwdCheck.cwd, abs: cwdCheck.abs, argv: entry.argv });
    }

    if (!clone.ok) {
      return {
        status: 200,
        body: {
          ok: true,
          clone,
          install: null,
          build: null,
          tests: [],
          totalMs: Date.now() - startedAt,
        },
      };
    }

    const deadline = startedAt + HARD_DEADLINE_MS;
    const timeLeft = () => deadline - Date.now();

    const install = await runCapture(payload.install[0], payload.install.slice(1), {
      cwd: repo,
      timeoutMs: Math.min(INSTALL_TIMEOUT_MS, timeLeft()),
    });

    let build = null;
    if (install.ok && payload.build) {
      build = await runCapture(payload.build[0], payload.build.slice(1), {
        cwd: repo,
        timeoutMs: Math.min(BUILD_TIMEOUT_MS, timeLeft()),
      });
    }

    let tests = [];
    let note;
    const buildOk = build ? build.ok : true;
    if (install.ok && buildOk) {
      const out = await runTestEntries(repo, testEntries.map((t) => ({ cwd: t.cwd, argv: t.argv })), timeLeft);
      tests = out.results;
      if (out.note) note = out.note;
    }

    const sessionId = randomUUID();
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = [...sessions.entries()]
        .filter(([, s]) => !s.busy)
        .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0];
      if (oldest) await dropSession(oldest[0]);
    }
    sessions.set(sessionId, {
      dir,
      repo,
      repoUrl,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      busy: false,
    });
    keepDir = true;

    return {
      status: 200,
      body: {
        ok: true,
        sessionId,
        clone,
        install,
        build,
        tests,
        totalMs: Date.now() - startedAt,
        ...(note ? { note } : {}),
      },
    };
  } finally {
    if (!keepDir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Runs the resolved test entries in order, stopping at the first failure so a
// broken baseline does not burn the whole budget on cascading failures.
async function runTestEntries(repoRoot, entries, timeLeft) {
  const results = [];
  let note;
  for (const entry of entries) {
    if (timeLeft() < 5_000) {
      note = "deadline_reached";
      break;
    }
    const cwdCheck = await validateCwd(entry?.cwd, repoRoot);
    if (!cwdCheck.ok) {
      return { results, note: `invalid_cwd` };
    }
    const res = await runCapture(entry.argv[0], entry.argv.slice(1), {
      cwd: cwdCheck.abs,
      timeoutMs: Math.min(TEST_TIMEOUT_MS, timeLeft()),
    });
    results.push({
      ...res,
      command: cwdCheck.cwd === "." ? res.command : `cd ${cwdCheck.cwd} && ${res.command}`,
    });
    if (!res.ok) break;
  }
  return { results, note };
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

// Serialize operations: one repo at a time, so a burst never overruns the box.
let lock = Promise.resolve();
function withLock(fn) {
  const next = lock.then(fn, fn);
  lock = next.catch(() => {});
  return next;
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      uid: process.getuid?.() ?? null,
      sessions: sessions.size,
    });
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
    if (body.length > 32_768) {
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
    withLock(() => execute(parsed))
      .then(({ status, body: result }) => sendJson(res, status, result))
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
  const sweeper = setInterval(sweepSessions, 60_000);
  sweeper.unref();
  const shutdown = async () => {
    for (const id of [...sessions.keys()]) await dropSession(id);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[runner] listening on :${PORT} as uid ${process.getuid?.() ?? "?"}`,
    );
  });
}

export { execute, validateArgv, tokenizeCommand, validateCwd, sweepSessions };
