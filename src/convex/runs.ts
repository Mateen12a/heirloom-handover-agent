// Heirloom runs API. All access is authenticated and owner-scoped.

import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { SCENARIO_KEYS, getScenario } from "./scenarios";

export const listScenarios = query({
  args: {},
  handler: async () => {
    return SCENARIO_KEYS.map((key) => {
      const s = getScenario(key);
      return { key, label: s.label, blurb: s.blurb };
    });
  },
});

// Tells the UI which pipeline a new run will take: the live Nebius/Nemotron
// pipeline when NEBIUS_API_KEY is configured, otherwise the demo replay.
export const config = query({
  args: {},
  handler: async () => ({
    liveMode: Boolean(process.env.NEBIUS_API_KEY),
    runnerMode: Boolean(process.env.RUNNER_URL && process.env.RUNNER_TOKEN),
    modelPlan: process.env.NEBIUS_PLAN_MODEL || "nvidia/Nemotron-3-Ultra-550b-a55b",
    modelFast: process.env.NEBIUS_FAST_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  }),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const run = await ctx.db.get(runId);
    if (!run || run.userId !== userId) return null;
    return run;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    repoUrl: v.string(),
    shape: v.string(),
  },
  handler: async (ctx, { name, repoUrl, shape }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required");

    const trimmed = repoUrl.trim();
    const isGithub = /^(https?:\/\/)?(www\.)?github\.com\/[\w.-]+\/[\w.-]+(\/)?(\.git)?$/i.test(trimmed);
    if (!isGithub) {
      throw new Error("Only public github.com repository URLs are supported.");
    }

    // Credit budget guard: cap how often one account can spend.
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (existing.length >= 20) {
      throw new Error("This account reached its run limit (20). Contact the operator to raise it.");
    }
    if (existing.filter((r) => r.startedAt > dayAgo).length >= 6) {
      throw new Error("Daily run limit reached (6 per 24 hours). Try again tomorrow.");
    }

    const scenario = getScenario(shape);
    const liveMode = Boolean(process.env.NEBIUS_API_KEY);
    const now = Date.now();

    const runId = await ctx.db.insert("runs", {
      userId,
      name: name.trim() || "Untitled takeover",
      repoUrl: repoUrl.trim(),
      shape,
      modelPlan: process.env.NEBIUS_PLAN_MODEL || "nvidia/Nemotron-3-Ultra-550b-a55b",
      modelFast: process.env.NEBIUS_FAST_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      status: "queued",
      stepsDone: 0,
      // The live pipeline emits six feed steps without the sandbox runner;
      // the execution phase adds up to three more. Finalize trims the total
      // to the exact count.
      stepsTotal: liveMode ? (process.env.RUNNER_URL ? 9 : 6) : scenario.timeline.length,
      fixAttempts: liveMode ? 0 : scenario.timeline.filter((s) => s.status === "retry").length,
      tokensUsed: 0,
      creditsUsed: 0,
      startedAt: now,
    });

    if (liveMode) {
      // Real pipeline: fetch the repo, call Nemotron, record live evidence.
      await ctx.scheduler.runAfter(600, internal.live.runLive, { runId, userId });
    } else {
      // Demo replay of the tuned scenario timeline.
      await ctx.scheduler.runAfter(600, internal.engine.advance, { runId, seq: 0 });
    }
    return runId;
  },
});

export const remove = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required");
    const run = await ctx.db.get(runId);
    if (!run || run.userId !== userId) throw new Error("Run not found");

    for (const table of ["runSteps", "evidence", "dependencies"] as const) {
      for (const row of await ctx.db
        .query(table)
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect()) {
        await ctx.db.delete(row._id);
      }
    }
    for (const row of await ctx.db
      .query("usage")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      if (row.runId === runId) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(runId);
  },
});

// ── Workspace-wide queries ─────────────────────────────────────────────────

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { runs: 0, live: 0, verifiedClaims: 0, tokens: 0, credits: 0 };
    }
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let verifiedClaims = 0;
    let tokens = 0;
    let credits = 0;
    for (const run of runs) {
      const ev = await ctx.db
        .query("evidence")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      verifiedClaims += ev.filter((e) => e.verdict === "verified").length;
      tokens += run.tokensUsed;
      credits += run.creditsUsed;
    }
    return {
      runs: runs.length,
      live: runs.filter((r) => r.health?.status === "live").length,
      verifiedClaims,
      tokens,
      credits: Math.round(credits * 100) / 100,
    };
  },
});

export const listSteps = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const run = await ctx.db.get(runId);
    if (!run || run.userId !== userId) return [];
    return await ctx.db
      .query("runSteps")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
  },
});

export const listEvidence = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const run = await ctx.db.get(runId);
    if (!run || run.userId !== userId) return [];
    return await ctx.db
      .query("evidence")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
  },
});

export const listDependencies = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const run = await ctx.db.get(runId);
    if (!run || run.userId !== userId) return [];
    return await ctx.db
      .query("dependencies")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
  },
});

// The seeded sample run: a completed real takeover anyone can open, signed in
// or not, without spending a credit.
export const sample = query({
  args: {},
  handler: async (ctx) => {
    const run = await ctx.db
      .query("runs")
      .filter((q) => q.eq(q.field("isSample"), true))
      .first();
    if (!run) return null;
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    const evidence = await ctx.db
      .query("evidence")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    const dependencies = await ctx.db
      .query("dependencies")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    return { run, steps, evidence, dependencies };
  },
});
