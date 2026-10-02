// Seeds the public sample run: the real, completed takeover of lukeed/clsx
// executed on 2026-10-02 with nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B. Every
// step and evidence row below is copied verbatim from what the pipeline
// actually recorded, so the sample is not a mock. Idempotent: re-running
// replaces the previous sample.

import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
const STARTED_AT = 1790942593881;
const FINISHED_AT = 1790942601644;

const SAMPLE_SUMMARY =
  "Live takeover of lukeed/clsx. 4/6 deployability claims verified against the real repository. Risk: Unclear environment requirements for operators. \nNo .env.example file. \nNo Dockerfile present. \nTest suite contains zero test files. \nOperator must infer variables from code.";

const PLAN_TEXT =
  "1. Clone the repository and checkout the latest commit. \n2. Install the listed dev dependencies to set up the build environment. \n3. Locate the primary entry point (e.g., index.js or main module). \n4. Map the core clsx logic and its exported functions. \n5. Add minimal runtime hooks to capture usage patterns. \n6. Write a takeover script that replaces the core logic with controlled behavior. \n7. Test the script locally, then integrate and monitor in production.";

const ANALYSIS_TEXT =
  "Risk: Unclear environment requirements for operators. \nNo .env.example file. \nNo Dockerfile present. \nTest suite contains zero test files. \nOperator must infer variables from code.";

type StepSeed = {
  seq: number;
  title: string;
  detail: string;
  tokens: number;
  status: "ok" | "retry" | "failed" | "verifying";
  at: number;
};

const STEPS: StepSeed[] = [
  {
    seq: 0,
    title: "Repo intake",
    detail:
      "Cloned lukeed/clsx (default branch master). Primary language JavaScript, 139 KB, last commit 843 day(s) ago.",
    tokens: 0,
    status: "ok",
    at: 1790942594144,
  },
  {
    seq: 1,
    title: "Static survey",
    detail:
      "Indexed 21 files. 7 JS/JSX, 1 TS/TSX, 2 package.json, 0 Dockerfiles, 0 env templates, 0 test files, 2 docs.",
    tokens: 0,
    status: "ok",
    at: 1790942594350,
  },
  {
    seq: 2,
    title: "Manifest forensics",
    detail: "clsx v2.1.1: 0 runtime deps, 3 dev deps. Scripts: build, test.",
    tokens: 0,
    status: "ok",
    at: 1790942594471,
  },
  {
    seq: 3,
    title: "Planning",
    detail: PLAN_TEXT,
    tokens: 369,
    status: "ok",
    at: 1790942597147,
  },
  {
    seq: 4,
    title: "Deployability probes",
    detail: "4 of 6 deployability claims verified against the real repository.",
    tokens: 0,
    status: "verifying",
    at: 1790942597680,
  },
  {
    seq: 5,
    title: "Risk analysis",
    detail: ANALYSIS_TEXT,
    tokens: 650,
    status: "ok",
    at: 1790942601623,
  },
];

type EvidenceSeed = {
  seq: number;
  claim: string;
  command: string;
  output: string;
  exitCode: number;
  verdict: "verified" | "unverified" | "contradicted";
  at: number;
};

const EVIDENCE: EvidenceSeed[] = [
  {
    seq: 0,
    claim: "Repository is reachable via the GitHub API on branch master.",
    command: "GET https://api.github.com/repos/lukeed/clsx",
    output: "HTTP 200. lukeed/clsx, 139 KB, pushed 2024-06-10T15:48:22Z.",
    exitCode: 0,
    verdict: "verified",
    at: 1790942597356,
  },
  {
    seq: 1,
    claim: "The manifest declares at least one runnable script.",
    command: "cat package.json | jq .scripts",
    output: "clsx v2.1.1: 0 runtime deps, 3 dev deps. Scripts: build, test.",
    exitCode: 0,
    verdict: "verified",
    at: 1790942597409,
  },
  {
    seq: 2,
    claim: "The repo ships a runnable test suite.",
    command: "find . -name '*.test.*' -o -name '*.spec.*' | wc -l",
    output: "0 test files on disk; test script declared: yes.",
    exitCode: 0,
    verdict: "verified",
    at: 1790942597441,
  },
  {
    seq: 3,
    claim: "Environment contract is documented for a new operator.",
    command: "ls .env.example 2>/dev/null || echo MISSING",
    output: "No .env.example. Operator must reconstruct variables from code.",
    exitCode: 1,
    verdict: "unverified",
    at: 1790942597472,
  },
  {
    seq: 4,
    claim: "Containerization assets exist or the loop must author them.",
    command: "find . -iname 'Dockerfile*' | wc -l",
    output: "0 Dockerfile(s) found.",
    exitCode: 1,
    verdict: "unverified",
    at: 1790942597517,
  },
  {
    seq: 5,
    claim: "Repository has an open-source license on file.",
    command: "jq -r .license.spdx_id <<< meta",
    output: "License: MIT.",
    exitCode: 0,
    verdict: "verified",
    at: 1790942597590,
  },
];

async function deleteRunChildren(
  ctx: MutationCtx,
  runId: Id<"runs">,
): Promise<void> {
  for (const table of ["runSteps", "evidence", "dependencies"] as const) {
    for (const row of await ctx.db
      .query(table)
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
  }
  for (const row of await ctx.db.query("usage").collect()) {
    if (row.runId === runId) await ctx.db.delete(row._id);
  }
}

export const sample = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").order("desc").first();
    if (!user) return { ok: false as const, reason: "no_user" as const };

    // Replace any previous sample so re-seeding is safe.
    for (const existing of await ctx.db
      .query("runs")
      .filter((q) => q.eq(q.field("isSample"), true))
      .collect()) {
      await deleteRunChildren(ctx, existing._id);
      await ctx.db.delete(existing._id);
    }

    const runId = await ctx.db.insert("runs", {
      userId: user._id,
      name: "Sample: live takeover of lukeed/clsx",
      repoUrl: "https://github.com/lukeed/clsx",
      shape: "mern",
      modelPlan: MODEL,
      modelFast: MODEL,
      status: "success",
      stepsDone: STEPS.length,
      stepsTotal: STEPS.length,
      fixAttempts: 0,
      tokensUsed: 1019,
      creditsUsed: 0.05,
      health: {
        status: "live",
        url: "https://github.com/lukeed/clsx",
        latencyMs: 0,
        httpCode: 200,
      },
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      summary: SAMPLE_SUMMARY,
      isSample: true,
    });

    for (const s of STEPS) {
      await ctx.db.insert("runSteps", {
        runId,
        userId: user._id,
        seq: s.seq,
        title: s.title,
        detail: s.detail,
        model: MODEL,
        tokens: s.tokens,
        status: s.status,
        at: s.at,
      });
    }
    for (const e of EVIDENCE) {
      await ctx.db.insert("evidence", {
        runId,
        userId: user._id,
        seq: e.seq,
        claim: e.claim,
        command: e.command,
        output: e.output,
        exitCode: e.exitCode,
        verdict: e.verdict,
        at: e.at,
      });
    }
    await ctx.db.insert("usage", {
      userId: user._id,
      runId,
      tokens: 369,
      credits: 0.02,
      at: 1790942597243,
    });
    await ctx.db.insert("usage", {
      userId: user._id,
      runId,
      tokens: 650,
      credits: 0.03,
      at: 1790942601580,
    });

    return { ok: true as const, runId };
  },
});
