// Dependency intelligence. For each dependency row of a run we check the npm
// registry for the real latest version, then (when TAVILY_API_KEY is set)
// research end-of-life status, advisories and known issues via Tavily search.
// Results are written back to the dependencies table and shown in the
// Dependency intel tab. Client-invoked, owner-scoped.

"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { GenericActionCtx } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";

const MAX_DEPS = 8;

type RegistryResponse = { "dist-tags"?: { latest?: string } };

function normalizeVersion(range: string): string {
  return range.replace(/^[\^~>=<\s]+/, "").split("-")[0].trim();
}

async function fetchLatest(name: string): Promise<string | null> {
  try {
    const path = name.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`https://registry.npmjs.org/${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RegistryResponse;
    return data["dist-tags"]?.latest ?? null;
  } catch {
    return null;
  }
}

type TavilyResult = { title?: string; url?: string; content?: string };
type TavilyResponse = { results?: TavilyResult[] };

async function tavilyResearch(
  apiKey: string,
  query: string,
): Promise<TavilyResult[]> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, max_results: 3, search_depth: "basic" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as TavilyResponse;
    return data.results ?? [];
  } catch {
    return [];
  }
}

function pickNote(results: TavilyResult[]): string | null {
  const scored = [...results].sort((a, b) => {
    const text = `${a.title ?? ""} ${a.content ?? ""}`.toLowerCase();
    const textB = `${b.title ?? ""} ${b.content ?? ""}`.toLowerCase();
    const score = (s: string) =>
      (/(end of life|eol|deprecated)/.test(s) ? 2 : 0) +
      (/(cve-|advisory|vulnerab|security)/.test(s) ? 2 : 0) +
      (/(breaking|migration)/.test(s) ? 1 : 0);
    return score(textB) - score(text);
  });
  const best = scored[0];
  if (!best?.title) return null;
  const host = (() => {
    try {
      return new URL(best.url ?? "").hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const note = `${best.title}${host ? ` (${host})` : ""}`;
  return note.length > 180 ? `${note.slice(0, 177)}...` : note;
}

type ResearchResult = { researched: number; tavily: boolean; done: boolean };

// Shared research loop: npm registry lookup plus Tavily notes, written back
// to the dependencies table. Used by the client action (authed) and the
// internal action (CLI verification).
async function researchDeps(
  ctx: GenericActionCtx<DataModel>,
  deps: Doc<"dependencies">[],
): Promise<ResearchResult> {
    const pending = deps
      .filter((d) => d.state === "pending" || !d.latest)
      .slice(0, MAX_DEPS);
    if (pending.length === 0) {
      return { researched: 0, tavily: false, done: true };
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    let tavilyUsed = false;

    for (const dep of pending) {
      const latest = await fetchLatest(dep.name);
      const installed = normalizeVersion(dep.version);
      const state: "current" | "outdated" =
        latest && normalizeVersion(latest) === installed ? "current" : "outdated";

      let note = latest
        ? `npm registry: latest is ${latest}, repo pins ${installed}.`
        : "Version could not be checked against the npm registry.";

      if (tavilyKey) {
        const results = await tavilyResearch(
          tavilyKey,
          `${dep.name} ${installed} end of life security advisory known issues`,
        );
        const tavilyNote = pickNote(results);
        if (tavilyNote) {
          note = `${tavilyNote} · ${note}`;
          tavilyUsed = true;
        }
      } else {
        note = `${note} Tavily research not configured.`;
      }

      await ctx.runMutation(internal.liveWrite.patchDependency, {
        depId: dep._id,
        latest: latest ?? "unknown",
        state,
        note,
      });
    }

    return { researched: pending.length, tavily: tavilyUsed, done: true };
}

export const research = action({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }): Promise<ResearchResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required");
    await ctx.runMutation(internal.liveWrite.assertRunOwner, { runId, userId });
    const deps: Doc<"dependencies">[] = await ctx.runQuery(api.runs.listDependencies, {
      runId,
    });
    return researchDeps(ctx, deps);
  },
});

// CLI verification path (internal, never client-callable): the same loop
// without a client auth context.
export const researchInternal = internalAction({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }): Promise<ResearchResult> => {
    const deps: Doc<"dependencies">[] = await ctx.runQuery(
      internal.liveWrite.getDependencies,
      { runId },
    );
    return researchDeps(ctx, deps);
  },
});
