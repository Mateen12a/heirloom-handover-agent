// Client for the sandboxed test-runner service (see /runner in the repo).
// The runner is a small Docker container (non-root, CPU/memory/pid caps, hard
// timeouts) that git-clones a public repository, installs its dependencies and
// executes its declared test script, then returns the real stdout and exit
// code. RUNNER_URL points at it; RUNNER_TOKEN is the shared bearer token.

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

export type ExecuteResult = {
  ok: boolean;
  reason?: "not_configured" | "unreachable" | "rejected";
  detail?: string;
  clone?: PhaseResult;
  install?: PhaseResult;
  test?: PhaseResult;
  fixCommand?: string;
  totalMs?: number;
};

// Runs one sandboxed execution against a public repository.
export const execute = internalAction({
  args: {
    repoUrl: v.string(),
    fixCommand: v.optional(v.string()),
  },
  handler: async (_ctx, { repoUrl, fixCommand }): Promise<ExecuteResult> => {
    const base = process.env.RUNNER_URL;
    const token = process.env.RUNNER_TOKEN;
    if (!base || !token) return { ok: false, reason: "not_configured" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240_000);
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repoUrl, fixCommand: fixCommand ?? null }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 240);
        return { ok: false, reason: "unreachable", detail: `Runner ${res.status}: ${detail}` };
      }
      const data = (await res.json()) as ExecuteResult;
      return data;
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
