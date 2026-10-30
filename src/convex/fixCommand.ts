// Screening for model-authored corrective commands.
//
// The runner re-validates everything it executes, but the client must screen
// first so unsafe proposals are never displayed, stored or sent. This module
// is pure (no Convex imports) so it can be unit-tested in isolation; the
// runner keeps its own copy of the same rules because it cannot trust the
// client. A parity test asserts both reject the same corpus.

const META_RE = /[;|&$><`\n\r\\]/;
const QUOTE_RE = /['"]/;
const EXECUTABLES = new Set(["npm", "pnpm", "yarn", "bun", "npx", "python3", "node", "go", "cargo"]);
// -exec/-toolexec (go) and --config (cargo) would let a command run any binary.
const BANNED_FLAGS = [
  "--registry", "-g", "--global", "--prefix", "--userconfig", "--location",
  "-exec", "-toolexec", "--config",
];
const BANNED_TOKENS = new Set([
  "publish", "unpublish", "login", "logout", "adduser", "token", "owner", "team",
  "access", "deprecate", "dist-tag", "hook", "exec", "dlx", "link", "create",
  "init", "eval", "sudo", "curl", "wget", "chmod", "chown", "nc", "dd", "mkfs",
]);
const NPX_RUNNERS = new Set(["mocha", "jest", "vitest", "ava", "tape", "jasmine"]);
const GO_SUBCOMMANDS = new Set(["version", "mod", "build", "test", "vet"]);
const CARGO_SUBCOMMANDS = new Set(["--version", "fetch", "build", "test", "check"]);

export type CommandCheck = { ok: true; argv: string[] } | { ok: false; reason: string };

export function validateCommandArgv(argv: unknown): CommandCheck {
  if (!Array.isArray(argv) || argv.length === 0) return { ok: false, reason: "empty command" };
  if (argv.length > 16) return { ok: false, reason: "too many arguments (max 16)" };
  const exe = typeof argv[0] === "string" ? argv[0] : "";
  if (!EXECUTABLES.has(exe)) {
    return { ok: false, reason: `executable not allowed: ${exe || "(missing)"}` };
  }
  let chars = 0;
  for (const raw of argv) {
    if (typeof raw !== "string") return { ok: false, reason: "arguments must be strings" };
    if (!raw) return { ok: false, reason: "empty argument" };
    if (raw.length > 160) return { ok: false, reason: `argument too long: ${raw.slice(0, 40)}…` };
    chars += raw.length + 1;
    if (META_RE.test(raw)) return { ok: false, reason: `shell metacharacter in: ${raw}` };
    if (QUOTE_RE.test(raw)) return { ok: false, reason: `quote character in: ${raw}` };
    // `./...` is Go's "every package below here" pattern, not a traversal.
    if (raw.includes("..") && raw !== "./...") {
      return { ok: false, reason: `path traversal in: ${raw}` };
    }
    if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) {
      return { ok: false, reason: `absolute path in: ${raw}` };
    }
  }
  if (chars > 400) return { ok: false, reason: "command too long (max 400 chars)" };
  if (exe === "node" && !(argv.length === 2 && argv[1] === "--version")) {
    return { ok: false, reason: "node is only allowed as `node --version`" };
  }
  if (exe === "python3") {
    if (argv[1] !== "-m" || !["pip", "pytest"].includes(String(argv[2]))) {
      return { ok: false, reason: "python3 is only allowed as `python3 -m pip|pytest …`" };
    }
    if (argv[2] === "pip" && !["install", "uninstall"].includes(String(argv[3] ?? ""))) {
      return { ok: false, reason: "python3 -m pip is limited to install/uninstall" };
    }
  }
  if (exe === "go") {
    if (!GO_SUBCOMMANDS.has(String(argv[1] ?? ""))) {
      return { ok: false, reason: `go is limited to: ${[...GO_SUBCOMMANDS].join(", ")}` };
    }
    if (argv[1] === "mod" && argv[2] !== "download") {
      return { ok: false, reason: "go mod is limited to download" };
    }
  }
  if (exe === "cargo" && !CARGO_SUBCOMMANDS.has(String(argv[1] ?? ""))) {
    return { ok: false, reason: `cargo is limited to: ${[...CARGO_SUBCOMMANDS].join(", ")}` };
  }
  if (exe === "npx") {
    const bin = argv.slice(1).find((a) => !String(a).startsWith("-"));
    if (!bin || !NPX_RUNNERS.has(String(bin))) {
      return { ok: false, reason: `npx is limited to: ${[...NPX_RUNNERS].join(", ")}` };
    }
  }
  for (const tok of argv.slice(1)) {
    const token = String(tok);
    if (BANNED_FLAGS.some((f) => token === f || token.startsWith(`${f}=`))) {
      return { ok: false, reason: `flag not allowed: ${token}` };
    }
    if (BANNED_TOKENS.has(token.toLowerCase())) {
      return { ok: false, reason: `token not allowed: ${token}` };
    }
  }
  return { ok: true, argv: argv.map(String) };
}

// Quote-aware splitter for a single-line command. Returns null when the line
// contains shell metacharacters, unbalanced quotes or is too long.
export function tokenizeCommand(line: unknown): string[] | null {
  const s = String(line ?? "").trim();
  if (!s || s.length > 400 || META_RE.test(s)) return null;
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
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

export type DiagnosedFix = {
  diagnosis: string;
  argv: string[] | null;
  rejected?: string;
  giveUp: string | null;
};

// Parses the diagnosis model's strict-JSON reply. Anything that is not a
// well-formed, allowlisted command is dropped with a reason the caller can
// show; a giveUp reply lets the model name the wall precisely instead of the
// pipeline inventing a failure.
export function extractFixCommand(text: string): DiagnosedFix {
  const fallback: DiagnosedFix = { diagnosis: text.trim(), argv: null, giveUp: null };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ...fallback, rejected: "the reply was not valid JSON" };
  let parsed: { diagnosis?: unknown; fixCommand?: unknown; giveUp?: unknown; wall?: unknown };
  try {
    parsed = JSON.parse(match[0]) as typeof parsed;
  } catch {
    return { ...fallback, rejected: "the reply was not valid JSON" };
  }
  const diagnosis =
    typeof parsed.diagnosis === "string" && parsed.diagnosis.trim()
      ? parsed.diagnosis.trim()
      : fallback.diagnosis;
  if (parsed.giveUp === true || typeof parsed.wall === "string") {
    const wall =
      typeof parsed.wall === "string" && parsed.wall.trim()
        ? parsed.wall.trim().slice(0, 240)
        : diagnosis.slice(0, 240);
    return { diagnosis, argv: null, giveUp: wall };
  }
  if (typeof parsed.fixCommand !== "string" || !parsed.fixCommand.trim()) {
    return { diagnosis, argv: null, giveUp: null, rejected: "the reply proposed no command" };
  }
  const argv = tokenizeCommand(parsed.fixCommand);
  if (!argv) {
    return {
      diagnosis,
      argv: null,
      giveUp: null,
      rejected: "the proposed command could not be tokenized safely",
    };
  }
  const check = validateCommandArgv(argv);
  if (!check.ok) {
    return {
      diagnosis,
      argv: null,
      giveUp: null,
      rejected: `the proposed command was rejected (${check.reason})`,
    };
  }
  return { diagnosis, argv: check.argv, giveUp: null };
}
