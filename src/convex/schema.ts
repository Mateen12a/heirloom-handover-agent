import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ── Heirloom ────────────────────────────────────────────────────────────

    // One takeover run of a target repository.
    runs: defineTable({
      userId: v.id("users"),
      name: v.string(),
      repoUrl: v.string(),
      shape: v.string(), // scenario key, e.g. "mern", "express", "vite", "chaos"
      modelPlan: v.string(), // Nemotron id used for planning / diagnosis
      modelFast: v.string(), // Nemotron id used for fast loop calls
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("fixing"),
        v.literal("verifying"),
        v.literal("success"),
        v.literal("failed"),
        v.literal("partial"),
      ),
      stepsDone: v.number(),
      stepsTotal: v.number(),
      fixAttempts: v.number(),
      tokensUsed: v.number(),
      creditsUsed: v.number(),
      health: v.optional(
        v.object({
          status: v.union(v.literal("live"), v.literal("down")),
          url: v.string(),
          latencyMs: v.number(),
          httpCode: v.number(),
        }),
      ),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      summary: v.optional(v.string()),
      // Structured output of the static survey: the facts the handover pack's
      // architecture map and runbook are assembled from.
      survey: v.optional(
        v.object({
          language: v.string(),
          files: v.number(),
          manifest: v.optional(v.string()),
          ecosystem: v.string(),
          lockfile: v.optional(v.string()),
          packageManager: v.optional(v.string()),
          entryPoints: v.array(v.string()),
          workspaces: v.array(v.string()),
          workspaceManifests: v.number(),
          scripts: v.array(v.string()),
          engines: v.optional(v.string()),
          containerAssets: v.number(),
          testFiles: v.number(),
          envTemplates: v.number(),
          docs: v.number(),
          // How the sandbox should install, build and test this repo: derived
          // from the lockfile, CI workflows and package.json scripts, so a
          // monorepo or non-default toolchain executes the way its own CI
          // would instead of a hardcoded `npm test`.
          strategy: v.optional(
            v.object({
              label: v.string(),
              source: v.string(),
              install: v.array(v.string()),
              build: v.optional(v.array(v.string())),
              tests: v.array(
                v.object({ cwd: v.string(), argv: v.array(v.string()) }),
              ),
            }),
          ),
        }),
      ),
      // Cross-phase handoff: notes written during intake/survey that later
      // scheduled phases (probes, repair, analysis) need without re-fetching.
      notes: v.optional(
        v.object({
          census: v.string(),
          manifest: v.string(),
          repo: v.string(),
          branch: v.string(),
          idleDays: v.number(),
          license: v.string(),
          reach: v.string(),
          httpCode: v.number(),
          declaresTest: v.boolean(),
          probeVerified: v.optional(v.number()),
          probeTotal: v.optional(v.number()),
        }),
      ),
      // Terminal state of the sandboxed repair loop. Recorded so the summary,
      // the pack and the outcome all agree on how execution ended: green, a
      // wall the model named, an error, or nothing to execute.
      repair: v.optional(
        v.object({
          state: v.union(
            v.literal("static"),
            v.literal("green"),
            v.literal("no-tests"),
            v.literal("error"),
            v.literal("wall"),
          ),
          cycle: v.number(),
          commands: v.array(v.string()),
          execLine: v.string(),
          wall: v.optional(v.string()),
        }),
      ),
      // Nemotron's pack-ready executive summary, written strictly from the
      // evidence ledger and persisted so it ships with the pack.
      packNarrative: v.optional(v.string()),
      // The one seeded run anyone can open without signing in.
      isSample: v.optional(v.boolean()),
    })
      .index("by_user", ["userId"])
      .index("by_user_status", ["userId", "status"]),

    // Timeline entries of the agent loop for one run.
    runSteps: defineTable({
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
    }).index("by_run", ["runId"]),

    // Evidence ledger: every claim is proven by a command the agent ran.
    evidence: defineTable({
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
    }).index("by_run", ["runId"]),

    // Dependency intelligence produced by the research step.
    dependencies: defineTable({
      runId: v.id("runs"),
      userId: v.id("users"),
      name: v.string(),
      version: v.string(),
      latest: v.string(),
      state: v.union(
        v.literal("pending"),
        v.literal("current"),
        v.literal("outdated"),
        v.literal("vulnerable"),
      ),
      note: v.string(),
    }).index("by_run", ["runId"]),

    // Usage ledger per run for the credit meter.
    usage: defineTable({
      userId: v.id("users"),
      runId: v.id("runs"),
      tokens: v.number(),
      credits: v.number(),
      at: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
