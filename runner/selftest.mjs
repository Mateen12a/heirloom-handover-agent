// Synchronous self-test of the runner core. No server, no background
// processes: it calls execute() directly against a real public repository
// and prints a compact summary of every phase.
//
//   node runner/selftest.mjs [repoUrl]

import { execute } from "./server.mjs";

const repoUrl = process.argv[2] || "https://github.com/lukeed/clsx";
const started = Date.now();

const res = await execute({ repoUrl, fixCommand: null });

const brief = (p) =>
  p
    ? {
        ok: p.ok,
        exitCode: p.exitCode,
        timedOut: p.timedOut,
        durationMs: p.durationMs,
        command: p.command,
        outputTail: p.output.slice(-500),
      }
    : null;

console.log(
  JSON.stringify(
    {
      repoUrl,
      ok: res.ok,
      phase: res.phase,
      totalMs: res.totalMs,
      wallMs: Date.now() - started,
      clone: brief(res.clone),
      install: brief(res.install),
      test: brief(res.test),
    },
    null,
    2,
  ),
);

// Exit nonzero if the runner itself malfunctioned (transport-level failure).
process.exit(res.ok ? 0 : 1);
