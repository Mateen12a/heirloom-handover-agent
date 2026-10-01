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

    const scenario = getScenario(shape);
    const now = Date.now();

    const runId = await ctx.db.insert("runs", {
      userId,
      name: name.trim() || "Untitled takeover",
      repoUrl: repoUrl.trim(),
      shape,
      modelPlan: "nvidia/nemotron-3-ultra",
      modelFast: "nvidia/nemotron-3-nano",
      status: "queued",
      stepsDone: 0,
      stepsTotal: scenario.timeline.length,
      fixAttempts: scenario.timeline.filter((s) => s.status === "retry").length,
      tokensUsed: 0,
      creditsUsed: 0,
      startedAt: now,
    });

    await ctx.scheduler.runAfter(600, internal.engine.advance, { runId, seq: 0 });
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
