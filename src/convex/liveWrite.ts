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
      stepsTotal: 6,
      fixAttempts: 0,
      tokensUsed: 0,
      creditsUsed: 0,
      startedAt: Date.now(),
    });
    return { ok: true as const, runId, userId: user._id };
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
