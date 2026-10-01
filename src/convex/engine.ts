// Heirloom run engine.
//
// `advance` is scheduled once per run by runs.create and then re-schedules
// itself, unfolding the scenario timeline over time. Timeline entries,
// evidence rows, dependency intel and usage rows land in the same tables the
// real Nebius/Nemotron loop targets, so every subscriber sees the same
// durable, resumable timeline.

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getScenario } from "./scenarios";

const STEP_DELAY_MS = 2600;
const FIXING_DELAY_MS = 1800;

export const advance = internalMutation({
  args: { runId: v.id("runs"), seq: v.number() },
  handler: async (ctx, { runId, seq }) => {
    const run = await ctx.db.get(runId);
    if (!run) return;
    if (run.status === "success" || run.status === "failed" || run.status === "partial") return;

    const scenario = getScenario(run.shape);
    const steps = scenario.timeline;

    if (seq >= steps.length) {
      // Finalise the run.
      const health =
        scenario.health.status === "live" ? scenario.health : undefined;
      await ctx.db.patch(runId, {
        status: scenario.outcome === "success" ? "success" : scenario.outcome === "partial" ? "partial" : "failed",
        stepsDone: steps.length,
        finishedAt: Date.now(),
        health,
        summary: scenario.summary,
      });
      return;
    }

    const step = steps[seq];
    const now = Date.now();

    await ctx.db.insert("runSteps", {
      runId,
      userId: run.userId,
      seq,
      title: step.title,
      detail: step.detail,
      model: step.model === "plan" ? run.modelPlan : run.modelFast,
      tokens: step.tokens,
      status: step.status,
      at: now,
    });

    // Usage + credits accrue per step.
    const credits = Math.round((step.tokens / 1000) * 5) / 100;
    await ctx.db.insert("usage", { userId: run.userId, runId, tokens: step.tokens, credits, at: now });
    await ctx.db.patch(runId, {
      tokensUsed: run.tokensUsed + step.tokens,
      creditsUsed: Math.round((run.creditsUsed + credits) * 100) / 100,
      stepsDone: seq + 1,
      status:
        step.status === "retry"
          ? "fixing"
          : step.status === "verifying"
            ? "verifying"
            : seq === steps.length - 1
              ? run.status
              : "running",
    });

    // Emit this step's evidence row, distributed across the run so the
    // ledger fills alongside the timeline rather than all up front.
    if (scenario.evidence.length > 0) {
      const eIdx = Math.min(
        scenario.evidence.length - 1,
        Math.floor((seq / steps.length) * scenario.evidence.length),
      );
      // One entry per step until the ledger is exhausted, then stop.
      if (seq < scenario.evidence.length) {
        const e = scenario.evidence[eIdx];
        await ctx.db.insert("evidence", {
          runId,
          userId: run.userId,
          seq,
          claim: e.claim,
          command: e.command,
          output: e.output,
          exitCode: e.exitCode,
          verdict: e.verdict,
          at: now,
        });
      }
    }

    // Emit dependency intel two steps before the end.
    const remaining = steps.length - seq;
    if (remaining === 3 && seq === steps.length - 3) {
      for (const dep of scenario.dependencies) {
        await ctx.db.insert("dependencies", {
          runId,
          userId: run.userId,
          name: dep.name,
          version: dep.version,
          latest: dep.latest,
          state: dep.state,
          note: dep.note,
        });
      }
    }

    const delay = step.status === "retry" ? FIXING_DELAY_MS : STEP_DELAY_MS;
    await ctx.scheduler.runAfter(delay, internal.engine.advance, { runId, seq: seq + 1 });
  },
});
