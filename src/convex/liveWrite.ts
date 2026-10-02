// Internal write helpers for the live pipeline. The action in live.ts fetches
// real repo data and calls Nebius, then records each phase here so the whole
// workspace (feed, ledger, usage meter) stays reactive while it runs.

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getRun = internalQuery({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => ctx.db.get(runId),
});

export const patchRun = internalMutation({
  args: { runId: v.id("runs"), patch: v.any() },
  handler: async (ctx, { runId, patch }) => {
    await ctx.db.patch(runId, patch);
  },
});

export const appendStep = internalMutation({
  args: {
    runId: v.id("runs"),
    userId: v.id("users"),
    seq: v.number(),
    title: v.string(),
    detail: v.string(),
    model: v.string(),
    tokens: v.number(),
    status: v.union(
      v.literal("ok"),
      v.literal("retry"),
      v.literal("failed"),
      v.literal("verifying"),
    ),
    at: v.number(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("runSteps", a);
    // Keep the workspace progress bar live while the pipeline runs.
    const run = await ctx.db.get(a.runId);
    if (run && run.stepsDone < a.seq + 1) {
      await ctx.db.patch(a.runId, { stepsDone: a.seq + 1 });
    }
  },
});

export const appendEvidence = internalMutation({
  args: {
    runId: v.id("runs"),
    userId: v.id("users"),
    seq: v.number(),
    claim: v.string(),
    command: v.string(),
    output: v.string(),
    exitCode: v.number(),
    verdict: v.union(
      v.literal("verified"),
      v.literal("unverified"),
      v.literal("contradicted"),
    ),
    at: v.number(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("evidence", a);
  },
});

export const appendUsage = internalMutation({
  args: {
    userId: v.id("users"),
    runId: v.id("runs"),
    tokens: v.number(),
    credits: v.number(),
    at: v.number(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("usage", a);
  },
});

// Creates a run owned by the newest signed-in user. Used by the internal
// smoke test so the live pipeline can be exercised from the CLI without a
// client session. Internal: never exposed to the browser.
export const startSmokeRun = internalMutation({
  args: {
    repoUrl: v.string(),
    name: v.optional(v.string()),
    shape: v.optional(v.string()),
  },
  handler: async (ctx, { repoUrl, name, shape }) => {
    const user = await ctx.db.query("users").order("desc").first();
    if (!user) return { ok: false as const, reason: "no_user" as const };

    const short = repoUrl
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .replace(/\.git\/?$/, "")
      .replace(/\/$/, "");
    const runId = await ctx.db.insert("runs", {
      userId: user._id,
      name: name?.trim() || `Live takeover of ${short}`,
      repoUrl,
      shape: shape ?? "mern",
      modelPlan: process.env.NEBIUS_PLAN_MODEL || "nvidia/Nemotron-3-Ultra-550b-a55b",
      modelFast: process.env.NEBIUS_FAST_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      status: "queued",
      stepsDone: 0,
      // Six phases without the sandbox runner; the execution phase adds a
      // start step, a possible fix cycle and a result step. Finalize trims
      // stepsTotal to the exact count.
      stepsTotal: process.env.RUNNER_URL ? 9 : 6,
      fixAttempts: 0,
      tokensUsed: 0,
      creditsUsed: 0,
      startedAt: Date.now(),
    });
    return { ok: true as const, runId, userId: user._id };
  },
});

// Dependency rows written by the live pipeline (manifest forensics), later
// enriched by the research action.
export const insertDependency = internalMutation({
  args: {
    runId: v.id("runs"),
    userId: v.id("users"),
    name: v.string(),
    version: v.string(),
  },
  handler: async (ctx, { runId, userId, name, version }) => {
    await ctx.db.insert("dependencies", {
      runId,
      userId,
      name,
      version,
      latest: "",
      state: "pending",
      note: "Not researched yet.",
    });
  },
});

export const getDependencies = internalQuery({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) =>
    ctx.db
      .query("dependencies")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect(),
});

export const patchDependency = internalMutation({
  args: {
    depId: v.id("dependencies"),
    latest: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("current"),
      v.literal("outdated"),
      v.literal("vulnerable"),
    ),
    note: v.string(),
  },
  handler: async (ctx, { depId, latest, state, note }) => {
    await ctx.db.patch(depId, { latest, state, note });
  },
});

// Owner check used by client-invoked actions (research, draft summary).
export const assertRunOwner = internalMutation({
  args: { runId: v.id("runs"), userId: v.id("users") },
  handler: async (ctx, { runId, userId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.userId !== userId) throw new Error("Run not found");
  },
});

// Wipes a run's timeline, ledger and usage while keeping the run document, so
// a clean re-run starts from an empty feed. Internal tooling only.
export const resetRun = internalMutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
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
    await ctx.db.patch(runId, {
      status: "queued",
      stepsDone: 0,
      stepsTotal: 9,
      fixAttempts: 0,
      tokensUsed: 0,
      creditsUsed: 0,
      // Re-read the model ids so the run card can never show a stale tier.
      modelPlan: process.env.NEBIUS_PLAN_MODEL || "nvidia/Nemotron-3-Ultra-550b-a55b",
      modelFast: process.env.NEBIUS_FAST_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      startedAt: Date.now(),
      summary: undefined,
      finishedAt: undefined,
      health: undefined,
    });
  },
});

// Deletes a run and every child row. Internal tooling only.
export const purgeRun = internalMutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
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
    await ctx.db.delete(runId);
    return { ok: true as const };
  },
});

// Dev guard: scans every recorded step for the vocabulary that indicates the
// model slipped into describing an attack on the repository. Used to verify
// that nothing judge-visible contains such text.
export const scanUnsafeText = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pattern =
      /(malicious|payload|exploit|backdoor|inject|malware|trojan|ransom|keylog|reverse shell|gain code execution|gain control|steal|exfiltrat|credential harvest|privilege escalation)/i;
    const runs = await ctx.db.query("runs").collect();
    const hits: { run: string; status: string; title: string; snippet: string }[] = [];
    for (const run of runs) {
      const steps = await ctx.db
        .query("runSteps")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      for (const step of steps) {
        if (pattern.test(step.detail)) {
          const match = step.detail.match(pattern);
          const idx = match?.index ?? 0;
          hits.push({
            run: run.name,
            status: run.status,
            title: step.title,
            snippet: step.detail.slice(Math.max(0, idx - 60), idx + 80),
          });
        }
      }
    }
    return { runsScanned: runs.length, hits };
  },
});

// CLI-only introspection for debugging stuck runs (internal, never client-callable).
export const debugRuns = internalQuery({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("runs").collect();
    return runs
      .map((r) => ({
        _id: r._id,
        name: r.name,
        repoUrl: r.repoUrl,
        status: r.status,
        stepsDone: r.stepsDone,
        stepsTotal: r.stepsTotal,
        userId: r.userId,
        startedAt: r.startedAt,
        isSample: r.isSample ?? false,
      }))
      .sort((a, b) => b.startedAt - a.startedAt);
  },
});

// Full readback of one run: status, feed timeline, evidence ledger, usage.
export const inspectRun = internalQuery({
  args: { runId: v.id("runs"), userId: v.id("users") },
  handler: async (ctx, { runId, userId }) => {
    const run = await ctx.db.get(runId);
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("asc")
      .collect();
    const evidence = await ctx.db
      .query("evidence")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("asc")
      .collect();
    const usage = (
      await ctx.db
        .query("usage")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter((u) => u.runId === runId);
    return { run, steps, evidence, usage };
  },
});
