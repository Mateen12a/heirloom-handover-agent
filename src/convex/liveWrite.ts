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
