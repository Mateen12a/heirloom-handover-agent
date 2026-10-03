// Client for the sandboxed test-runner service (see /runner in the repo).
// The runner is a small Docker container (non-root, CPU/memory/pid caps, hard
// timeouts) that git-clones a public repository and executes a resolved
// strategy with the real stdout and exit code for every phase. RUNNER_URL
// points at it; RUNNER_TOKEN is the shared bearer token.
//
// Call shapes:
//   - probe mode:   { repoUrl, probes } clones and runs the runner's fixed
//                   probe commands, then deletes the clone.
//   - prepare:      { repoUrl, install, build, tests } clones, installs and
//                   runs the baseline tests, then keeps the working tree open
//                   as a session for repair cycles.
//   - cycle:        { sessionId, fixCommands, tests } applies allowlisted
//                   corrective commands to the open session and reruns tests.
//   - close:        { sessionId, close: true } deletes the session.

"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export type PhaseResult = {
  ok: boolean;
  command: string;
  exitCode: number;
  timedOut: boolean;
  output: string;
  durationMs: number;
};

export type ProbeResult = {
  command: string;
  output: string;
  exitCode: number;
};

export type TestJob = { cwd: string; argv: string[] };

export type RunnerReason =
  | "not_configured"
  | "unreachable"
  | "rejected"
  | "session_expired"
  | "busy";

export type ExecuteResult = {
  ok: boolean;
  reason?: RunnerReason;
  detail?: string;
  clone?: PhaseResult;
  probes?: ProbeResult[];
  sessionId?: string;
  install?: PhaseResult | null;
  build?: PhaseResult | null;
  fixes?: PhaseResult[];
  tests?: PhaseResult[];
  closed?: boolean;
  note?: string;
  totalMs?: number;
};

export const execute = internalAction({
  args: {
    repoUrl: v.string(),
    probes: v.optional(v.union(v.literal("node"), v.literal("generic"))),
    install: v.optional(v.array(v.string())),
    build: v.optional(v.array(v.string())),
    tests: v.optional(
      v.array(v.object({ cwd: v.string(), argv: v.array(v.string()) })),
    ),
    fixCommands: v.optional(v.array(v.array(v.string()))),
    sessionId: v.optional(v.string()),
    close: v.optional(v.boolean()),
  },
  handler: async (
    _ctx,
    { repoUrl, probes, install, build, tests, fixCommands, sessionId, close },
  ): Promise<ExecuteResult> => {
    const base = process.env.RUNNER_URL;
    const token = process.env.RUNNER_TOKEN;
    if (!base || !token) return { ok: false, reason: "not_configured" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 470_000);
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoUrl,
          probes: probes ?? null,
          install: install ?? null,
          build: build ?? null,
          tests: tests ?? null,
          fixCommands: fixCommands ?? null,
          sessionId: sessionId ?? null,
          close: close === true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // The runner answers 400/409 with a JSON reason; keep it instead of
        // flattening every failure into "unreachable".
        const body = (await res.json().catch(() => null)) as ExecuteResult | null;
        if (
          body?.reason === "rejected" ||
          body?.reason === "session_expired" ||
          body?.reason === "busy"
        ) {
          return { ...body, ok: false };
        }
        const detail = JSON.stringify(body ?? {}).slice(0, 240);
        return { ok: false, reason: "unreachable", detail: `Runner ${res.status}: ${detail}` };
      }
      return (await res.json()) as ExecuteResult;
    } catch (err) {
      return {
        ok: false,
        reason: "unreachable",
        detail: err instanceof Error ? err.message : "Runner request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  },
});
