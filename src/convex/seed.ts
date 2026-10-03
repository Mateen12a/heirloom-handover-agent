// Seeds the public sample run by copying a real completed run verbatim:
// every step, evidence row and usage entry is cloned from the source run, so
// the sample can never drift from what the pipeline actually produced (and can
// be refreshed after any new run with one command).
//
//   bun convex run internal.seed.sample '{"sourceRunId":"<run id>"}'
//
// Idempotent: replaces the previous sample run.

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const sample = internalMutation({
  args: { sourceRunId: v.id("runs") },
  handler: async (ctx, { sourceRunId }) => {
    const source = await ctx.db.get(sourceRunId);
    if (!source) return { ok: false as const, reason: "no_source" as const };

    const owner = await ctx.db.query("users").order("desc").first();
    if (!owner) return { ok: false as const, reason: "no_user" as const };

    // Remove any previous sample run and its children.
    for (const existing of await ctx.db
      .query("runs")
      .filter((q) => q.eq(q.field("isSample"), true))
      .collect()) {
      for (const table of ["runSteps", "evidence", "dependencies"] as const) {
        for (const row of await ctx.db
          .query(table)
          .withIndex("by_run", (q) => q.eq("runId", existing._id))
          .collect()) {
          await ctx.db.delete(row._id);
        }
      }
      for (const row of await ctx.db.query("usage").collect()) {
        if (row.runId === existing._id) await ctx.db.delete(row._id);
      }
      await ctx.db.delete(existing._id);
    }

    const repoSlug = source.repoUrl
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .replace(/\.git\/?$/, "");

    const runId: Id<"runs"> = await ctx.db.insert("runs", {
      userId: owner._id,
      name: `Sample: live takeover of ${repoSlug}`,
      repoUrl: source.repoUrl,
      shape: source.shape,
      modelPlan: source.modelPlan,
      modelFast: source.modelFast,
      status: source.status,
      stepsDone: source.stepsDone,
      stepsTotal: source.stepsTotal,
      fixAttempts: source.fixAttempts,
      tokensUsed: source.tokensUsed,
      creditsUsed: source.creditsUsed,
      health: source.health,
      startedAt: source.startedAt,
      finishedAt: source.finishedAt,
      summary: source.summary,
      survey: source.survey,
      // The cross-phase notes and the repair-loop outcome are part of the
      // handover story, so the sample must carry them verbatim too.
      notes: source.notes,
      repair: source.repair,
      packNarrative: source.packNarrative,
      isSample: true,
    });

    const sourceSteps = await ctx.db
      .query("runSteps")
      .withIndex("by_run", (q) => q.eq("runId", sourceRunId))
      .collect();
    for (const step of sourceSteps) {
      const { _id, _creationTime, ...rest } = step;
      void _id;
      void _creationTime;
      await ctx.db.insert("runSteps", { ...rest, runId, userId: owner._id });
    }

    const sourceEvidence = await ctx.db
      .query("evidence")
      .withIndex("by_run", (q) => q.eq("runId", sourceRunId))
      .collect();
    for (const row of sourceEvidence) {
      const { _id, _creationTime, ...rest } = row;
      void _id;
      void _creationTime;
      await ctx.db.insert("evidence", { ...rest, runId, userId: owner._id });
    }

    const sourceDeps = await ctx.db
      .query("dependencies")
      .withIndex("by_run", (q) => q.eq("runId", sourceRunId))
      .collect();
    for (const row of sourceDeps) {
      // _creationTime is off-limits on insert; copying it made the whole seed
      // command fail for any source run that had dependency rows.
      const { _id, _creationTime, ...rest } = row;
      void _id;
      void _creationTime;
      await ctx.db.insert("dependencies", { ...rest, runId, userId: owner._id });
    }

    const sourceUsage = await ctx.db.query("usage").collect();
    for (const row of sourceUsage) {
      if (row.runId === sourceRunId) {
        await ctx.db.insert("usage", {
          userId: owner._id,
          runId,
          tokens: row.tokens,
          credits: row.credits,
          at: row.at,
        });
      }
    }

    return {
      ok: true as const,
      runId,
      steps: sourceSteps.length,
      evidence: sourceEvidence.length,
      deps: sourceDeps.length,
    };
  },
});