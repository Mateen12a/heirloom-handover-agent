// Synchronous self-test of the runner core. No server, no background
// processes: it drives execute() directly against real public repositories and
// prints a compact summary of every mode.
//
//   node runner/selftest.mjs [probeRepoUrl] [repairRepoUrl]
//
// It exercises the three things the runner must get right:
//   1. probe mode executes fixed, real commands against a fresh clone
//   2. prepare installs and runs baseline tests, keeping a session open
//   3. cycle applies an allowlisted fix command and reruns the tests on the
//      same working tree, then close deletes it

import { execute } from "./server.mjs";

const probeRepo = process.argv[2] || "https://github.com/lukeed/clsx";
const repairRepo = process.argv[3] || "https://github.com/jonschlinkert/is-number";
const started = Date.now();

const brief = (p) =>
  p
    ? {
        ok: p.ok,
        exitCode: p.exitCode,
        timedOut: p.timedOut,
        durationMs: p.durationMs,
        command: p.command,
        outputTail: p.output.slice(-400),
      }
    : null;

function call(label, payload) {
  return execute(payload).then(({ status, body }) => {
    console.log(
      JSON.stringify({ label, status, ok: body.ok, reason: body.reason }, null, 0),
    );
    return body;
  });
}

const probes = await call("probe", { repoUrl: probeRepo, probes: "node" });
console.log(
  JSON.stringify(
    {
      probeRepo,
      clone: brief(probes.clone),
      probes: (probes.probes || []).map((p) => ({
        command: p.command,
        exitCode: p.exitCode,
        output: p.output.slice(0, 160),
      })),
    },
    null,
    2,
  ),
);

const prepared = await call("prepare", {
  repoUrl: repairRepo,
  install: ["npm", "install", "--no-audit", "--no-fund", "--loglevel=error"],
  tests: [{ cwd: ".", argv: ["npm", "test"] }],
});
console.log(
  JSON.stringify(
    {
      repairRepo,
      sessionId: prepared.sessionId ? prepared.sessionId.slice(0, 8) : null,
      clone: brief(prepared.clone),
      install: brief(prepared.install),
      tests: (prepared.tests || []).map(brief),
    },
    null,
    2,
  ),
);

let cycle = null;
if (prepared.ok && prepared.sessionId) {
  cycle = await call("cycle", {
    repoUrl: repairRepo,
    sessionId: prepared.sessionId,
    fixCommands: [["npm", "pkg", "set", "scripts.handoverProbe=yes"]],
    tests: [{ cwd: ".", argv: ["npm", "test"] }],
  });
  console.log(
    JSON.stringify(
      {
        fixes: (cycle.fixes || []).map(brief),
        tests: (cycle.tests || []).map(brief),
        note: cycle.note ?? null,
      },
      null,
      2,
    ),
  );

  const closed = await call("close", {
    repoUrl: repairRepo,
    sessionId: prepared.sessionId,
    close: true,
  });
  console.log(JSON.stringify({ closed: closed.closed }));
}

const transportOk = probes.ok === true && prepared.ok === true && (cycle ? cycle.ok === true : true);
console.log(JSON.stringify({ transportOk, wallMs: Date.now() - started }, null, 2));

// Exit nonzero if the runner itself malfunctioned (transport-level failure).
process.exit(transportOk ? 0 : 1);
