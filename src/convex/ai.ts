// Real Nebius Token Factory call: drafts the handover pack's executive
// summary with an NVIDIA Nemotron model, strictly from the evidence ledger.
// The key comes from NEBIUS_API_KEY (set via the project's Keys tab); the
// model id can be overridden with NEBIUS_MODEL.

"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const BASE_URL = "https://api.tokenfactory.nebius.com/v1";

export const draftSummary = action({
  args: {
    runName: v.string(),
    repoUrl: v.string(),
    shape: v.string(),
    status: v.string(),
    evidence: v.array(
      v.object({
        claim: v.string(),
        command: v.string(),
        exitCode: v.number(),
        verdict: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required");

    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) {
      return { ok: false as const, reason: "missing_key" as const };
    }

    const model = process.env.NEBIUS_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

    const evidenceBlock = args.evidence
      .map(
        (e, i) =>
          `${i + 1}. [${e.verdict}] ${e.claim} | proof: \`${e.command}\` (exit ${e.exitCode})`,
      )
      .join("\n");

    const messages = [
      {
        role: "system" as const,
        content:
          "You write the executive summary for a codebase handover pack. Be concrete and brief. Never claim anything that is not backed by the evidence given; if the evidence is thin, say what the next engineer should verify first. 120 words max. Plain text, no markdown headings.",
      },
      {
        role: "user" as const,
        content: `Run: ${args.runName}\nRepo: ${args.repoUrl}\nRepo shape: ${args.shape}\nOutcome: ${args.status}\n\nEvidence ledger:\n${
          evidenceBlock || "(no evidence recorded)"
        }\n\nWrite the executive summary for the handover pack.`,
      },
    ];

    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 700,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        return {
          ok: false as const,
          reason: "api_error" as const,
          detail: detail.slice(0, 300),
        };
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return { ok: false as const, reason: "empty" as const };
      }
      return { ok: true as const, text, model };
    } catch (err) {
      return {
        ok: false as const,
        reason: "network_error" as const,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
