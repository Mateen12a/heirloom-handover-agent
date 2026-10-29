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

// Claiming the console is limited to the addresses in ADMIN_EMAILS (comma
// separated, set in the Convex dashboard). Guests can never claim it.
function mayClaim(user: { email?: string; isAnonymous?: boolean } | null) {
  if (!user || user.isAnonymous || !user.email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.toLowerCase());
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
    const canBootstrap = !isAdmin && admins === 0 && mayClaim(me);

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
    if (!mayClaim(await ctx.db.get(userId))) {
      throw new Error("This account is not on the admin list (ADMIN_EMAILS).");
    }
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

// Usage analytics for the console: who has used Heirloom, how often, and what
// it cost. "Active" means the person started a session or a takeover in the
// window. The seeded sample run is not usage, so it is left out.
export const analytics = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const sessions = await ctx.db.query("authSessions").collect();
    const runs = (await ctx.db.query("runs").collect()).filter((r) => !r.isSample);

    // Last activity per person, from sessions and takeovers.
    const lastSeen = new Map<string, number>();
    const touch = (id: string, at: number) => lastSeen.set(id, Math.max(lastSeen.get(id) ?? 0, at));
    for (const s of sessions) touch(s.userId, s._creationTime);
    for (const r of runs) touch(r.userId, r.startedAt);
    const activeWithin = (ms: number) => [...lastSeen.values()].filter((t) => t > now - ms).length;

    // Daily series for the last 14 days, oldest first, in UTC days.
    const today = Math.floor(now / DAY) * DAY;
    const days = Array.from({ length: 14 }, (_, i) => {
      const start = today - (13 - i) * DAY;
      const end = start + DAY;
      const active = new Set<string>();
      for (const s of sessions) if (s._creationTime >= start && s._creationTime < end) active.add(s.userId);
      for (const r of runs) if (r.startedAt >= start && r.startedAt < end) active.add(r.userId);
      return {
        day: start,
        people: active.size,
        newPeople: users.filter((u) => u._creationTime >= start && u._creationTime < end).length,
        takeovers: runs.filter((r) => r.startedAt >= start && r.startedAt < end).length,
      };
    });

    const byStatus: Record<string, number> = {};
    for (const r of runs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const finished = runs.filter((r) => r.finishedAt);
    const settled = (byStatus.success ?? 0) + (byStatus.failed ?? 0) + (byStatus.partial ?? 0);

    const repoCounts = new Map<string, number>();
    for (const r of runs) repoCounts.set(r.repoUrl, (repoCounts.get(r.repoUrl) ?? 0) + 1);

    const runners = new Set(runs.map((r) => r.userId));
    return {
      people: {
        total: users.length,
        guests: users.filter((u) => u.isAnonymous).length,
        withEmail: users.filter((u) => !u.isAnonymous && u.email).length,
        admins: users.filter((u) => u.role === ROLES.ADMIN).length,
        ranTakeover: runners.size,
        new7d: users.filter((u) => u._creationTime > now - 7 * DAY).length,
      },
      active: { day: activeWithin(DAY), week: activeWithin(7 * DAY), month: activeWithin(30 * DAY) },
      takeovers: {
        total: runs.length,
        week: runs.filter((r) => r.startedAt > now - 7 * DAY).length,
        byStatus,
        successRate: settled ? Math.round(((byStatus.success ?? 0) / settled) * 100) : null,
        avgSeconds: finished.length
          ? Math.round(finished.reduce((a, r) => a + (r.finishedAt! - r.startedAt), 0) / finished.length / 1000)
          : null,
      },
      spend: {
        tokens: runs.reduce((a, r) => a + r.tokensUsed, 0),
        credits: Math.round(runs.reduce((a, r) => a + r.creditsUsed, 0) * 100) / 100,
      },
      days,
      topRepos: [...repoCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([repoUrl, count]) => ({ repoUrl, count })),
    };
  },
});
