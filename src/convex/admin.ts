// Heirloom admin. Bootstrap promotes the first signed-in user to admin; every
// other function requires the caller to already hold the admin role.

import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { ROLES, roleValidator } from "./schema";

type QueryCtx = GenericQueryCtx<DataModel>;

async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== ROLES.ADMIN) {
    throw new Error("Admin access required");
  }
  return userId;
}

async function countAdmins(ctx: QueryCtx) {
  const users = await ctx.db.query("users").collect();
  return users.filter((u) => u.role === ROLES.ADMIN).length;
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { canBootstrap: false, isAdmin: false, totals: null, recentRuns: [] };
    }
    const me = await ctx.db.get(userId);
    const isAdmin = me?.role === ROLES.ADMIN;
    const admins = await countAdmins(ctx);
    const canBootstrap = !isAdmin && admins === 0;

    if (!isAdmin && !canBootstrap) {
      return { canBootstrap: false, isAdmin: false, totals: null, recentRuns: [] };
    }

    const allUsers = await ctx.db.query("users").collect();
    const allRuns = await ctx.db.query("runs").collect();
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    let tokens = 0;
    let credits = 0;
    let live = 0;
    for (const run of allRuns) {
      tokens += run.tokensUsed;
      credits += run.creditsUsed;
      if (run.health?.status === "live") live += 1;
    }

    const recentRuns = [...allRuns]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 8)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        repoUrl: r.repoUrl,
        status: r.status,
        shape: r.shape,
        creditsUsed: r.creditsUsed,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      }));

    return {
      canBootstrap,
      isAdmin,
      totals: {
        users: allUsers.length,
        newUsers24h: allUsers.filter((u) => (u._creationTime ?? 0) > dayAgo).length,
        runs: allRuns.length,
        activeRuns: allRuns.filter(
          (r) =>
            r.status === "queued" || r.status === "running" || r.status === "fixing" || r.status === "verifying",
        ).length,
        liveStaging: live,
        tokens,
        credits: Math.round(credits * 100) / 100,
      },
      recentRuns,
    };
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const runs = await ctx.db.query("runs").collect();

    return users
      .map((u) => {
        const userRuns = runs.filter((r) => r.userId === u._id);
        const credits = userRuns.reduce((acc, r) => acc + r.creditsUsed, 0);
        return {
          _id: u._id,
          name: u.name ?? null,
          email: u.email ?? null,
          isAnonymous: u.isAnonymous ?? false,
          role: u.role ?? "user",
          runs: userRuns.length,
          creditsUsed: Math.round(credits * 100) / 100,
          joinedAt: u._creationTime,
        };
      })
      .sort((a, b) => b.joinedAt - a.joinedAt);
  },
});

export const listAllRuns = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const runs = await ctx.db.query("runs").collect();
    const users = await ctx.db.query("users").collect();
    const nameById = new Map(users.map((u) => [u._id, u.name ?? u.email ?? "Anonymous"]));

    return runs
      .map((r) => ({
        _id: r._id,
        name: r.name,
        repoUrl: r.repoUrl,
        shape: r.shape,
        status: r.status,
        owner: nameById.get(r.userId) ?? "Unknown",
        ownerRole: users.find((u) => u._id === r.userId)?.role ?? null,
        creditsUsed: r.creditsUsed,
        tokensUsed: r.tokensUsed,
        health: r.health ? { status: r.health.status } : null,
        startedAt: r.startedAt,
      }))
      .sort((a, b) => b.startedAt - a.startedAt);
  },
});

export const bootstrapAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required");
    const admins = await countAdmins(ctx);
    if (admins > 0) {
      throw new Error("An admin already exists. Ask them to grant access.");
    }
    await ctx.db.patch(userId, { role: ROLES.ADMIN });
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, { userId, role }) => {
    const adminId = await requireAdmin(ctx);
    if (userId === adminId && role !== ROLES.ADMIN) {
      throw new Error("You cannot demote your own account.");
    }
    await ctx.db.patch(userId, { role });
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const adminId = await requireAdmin(ctx);
    if (userId === adminId) {
      throw new Error("You cannot delete your own account.");
    }
    for (const run of await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      for (const table of ["runSteps", "evidence", "dependencies"] as const) {
        for (const row of await ctx.db
          .query(table)
          .withIndex("by_run", (q) => q.eq("runId", run._id))
          .collect()) {
          await ctx.db.delete(row._id);
        }
      }
      await ctx.db.delete(run._id);
    }
    for (const row of await ctx.db
      .query("usage")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(userId);
  },
});

export const removeRun = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    await requireAdmin(ctx);
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("Run not found");
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
      .withIndex("by_user", (q) => q.eq("userId", run.userId))
      .collect()) {
      if (row.runId === runId) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(runId);
  },
});
