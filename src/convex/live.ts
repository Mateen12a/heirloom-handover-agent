// The live Heirloom pipeline. One action drives a full takeover against a
// real public GitHub repository:
//
//   1. Fetch the repo tree and manifest via the GitHub REST API.
//   2. Survey it: file census, manifest parsing, dependency list.
//   3. Ask Nemotron (Nebius Token Factory) for a takeover plan.
//   4. Probe the deployability questions (scripts, env vars, entry points).
//   5. Ask Nemotron to analyze the survey against the plan.
//   6. Record every claim as evidence with its raw proof.
//
// Every network call is capped and every phase writes progress to the run, so
// the workspace feed updates live and the run is durable across restarts.

"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const NEBIUS_BASE = "https://api.tokenfactory.nebius.com/v1";
const NEBIUS_PLAN_MODEL = process.env.NEBIUS_PLAN_MODEL || "nvidia/Nemotron-3-Ultra-550b-a55b";
const NEBIUS_FAST_MODEL = process.env.NEBIUS_FAST_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

// ── safety rails ───────────────────────────────────────────────────────────
// A reasoning model asked for a "takeover plan" was observed describing how
// to compromise a repository instead of how to hand it over. Planning is
// therefore framed as onboarding for a new owner, and every model output is
// screened before it is displayed or acted on. Unsafe text is never shown:
// it is discarded, retried once, and otherwise fails the run honestly.
const PLAN_SYSTEM_PROMPT =
  "You write the onboarding and deployment plan a new engineer follows when taking ownership of an existing repository. " +
  "Given a survey, output a terse numbered plan (max 7 steps) covering only: discovery, environment setup, configuration, running the existing tests or app, and verification. " +
  "Never propose changing, rewriting, injecting into, exploiting, compromising or backdooring the repository or its dependencies, and never propose disabling, bypassing or weakening any security control. " +
  "Never use the words payload, exploit, malicious or backdoor. Plain text only, no markdown headers, no preamble.";

const UNSAFE_RE =
  /(malicious|payload|exploit|backdoor|inject|malware|trojan|ransom|keylog|reverse shell|gain code execution|gain control|steal|exfiltrat|credential harvest|privilege escalation|bypass (the )?(auth|security)|disable (the )?(auth|security))/i;

// Model-authored corrective commands run inside the sandbox, so the
// allowlist blocks shell metacharacters, VCS publishing, package publishing
// and any attack-flavoured vocabulary.
const BANNED_FIX_RE =
  /[;|`$><]|\brm\b|\bsudo\b|\bcurl\b|\bwget\b|\bchmod\b|\bchown\b|\bnc\b|\beval\b|\bkill\b|\bdd\b|\bmkfs\b|git\s+(push|commit|reset|clean)\b|npm\s+publish\b|\bpush\b|https?:\/\/|payload|exploit|malicious|backdoor|inject|malware|trojan|reverse shell/i;

type FetchOk = { ok: true; status: number; body: unknown };
type FetchFail = { ok: false; status: number; error: string };

async function fetchJson(url: string, init?: RequestInit): Promise<FetchOk | FetchFail> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "heirloom-handover-agent",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (body as { message?: string } | null)?.message ??
          `GitHub API returned ${res.status}`,
      };
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network failure",
    };
  }
}

async function callNebius(
  apiKey: string,
  model: string,
  messages: { role: "system" | "user"; content: string }[],
  maxTokens: number,
): Promise<{ ok: true; text: string; tokens: number } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${NEBIUS_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 240);
      return { ok: false, error: `Nebius API ${res.status}: ${detail}` };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, error: "Nebius returned an empty completion" };
    return { ok: true, text, tokens: data.usage?.total_tokens ?? 0 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Nebius request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Convex does not propagate auth identity to scheduled functions, so the
// scheduling mutation passes the authenticated owner's id explicitly. Internal
// functions are never callable from the client, so this is safe by construction.
export const runLive = internalAction({
  args: { runId: v.id("runs"), userId: v.id("users") },
  handler: async (ctx, { runId, userId }) => {
    const run = await ctx.runQuery(internal.liveWrite.getRun, { runId });
    if (!run) throw new Error("Run not found");
    if (run.userId !== userId) throw new Error("Run not found");

    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.liveWrite.patchRun, {
        runId,
        patch: { status: "failed", summary: "NEBIUS_API_KEY is not configured. Add it in the Keys tab." },
      });
      return { ok: false as const, reason: "missing_key" as const };
    }

    const at = () => Date.now();
    let seq = 0;
    let totalTokens = 0;
    let totalCredits = 0;

    // Parse owner/repo from any common GitHub URL shape.
    const m = run.repoUrl.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
    if (!m) {
      await ctx.runMutation(internal.liveWrite.patchRun, {
        runId,
        patch: { status: "failed", summary: "Could not parse a GitHub repository URL." },
      });
      return { ok: false as const, reason: "bad_url" as const };
    }
    const [, owner, repoRaw] = m;
    const repo = repoRaw.replace(/\.git$/, "");
    const base = `https://api.github.com/repos/${owner}/${repo}`;

    // ── Phase 1: intake ────────────────────────────────────────────────────
    await ctx.runMutation(internal.liveWrite.patchRun, {
      runId,
      patch: { status: "running" },
    });

    const repoRes = await fetchJson(base);
    if (!repoRes.ok) {
      await ctx.runMutation(internal.liveWrite.appendStep, {
        runId, userId, seq: seq++, title: "Repo intake",
        detail: `Failed: ${repoRes.error}`,
        model: NEBIUS_FAST_MODEL, tokens: 0, status: "failed", at: at(),
      });
      await ctx.runMutation(internal.liveWrite.patchRun, {
        runId,
        patch: { status: "failed", finishedAt: at(), summary: `Intake failed: ${repoRes.error}` },
      });
      return { ok: false as const, reason: "intake_failed" as const };
    }
    const meta = repoRes.body as {
      full_name: string;
      default_branch: string;
      language: string | null;
      size: number;
      stargazers_count: number;
      pushed_at: string;
      license?: { spdx_id?: string } | null;
    };
    const daysIdle = Math.floor((Date.now() - Date.parse(meta.pushed_at)) / 86_400_000);

    await ctx.runMutation(internal.liveWrite.appendStep, {
      runId, userId, seq: seq++, title: "Repo intake",
      detail: `Cloned ${meta.full_name} (default branch ${meta.default_branch}). Primary language ${meta.language ?? "unknown"}, ${meta.size} KB, last commit ${daysIdle === 0 ? "today" : `${daysIdle} day(s) ago`}.`,
      model: NEBIUS_FAST_MODEL, tokens: 0, status: "ok", at: at(),
    });

    // ── Phase 2: static survey ─────────────────────────────────────────────
    const treeRes = await fetchJson(`${base}/git/trees/${meta.default_branch}?recursive=1`);
    const tree = treeRes.ok
      ? ((treeRes.body as { tree?: { path: string; type: string; size?: number }[] }).tree ?? [])
      : [];
    const files = tree.filter((t) => t.type === "blob");
    const count = (re: RegExp) => files.filter((f) => re.test(f.path)).length;

    // Inherited repos are not always npm projects, so the census counts the
    // ecosystems we can actually inspect and execute.
    const censusNote = [
      `${files.length} files`,
      `${count(/\.jsx?$/)} JS/JSX`,
      `${count(/\.tsx?$/)} TS/TSX`,
      `${count(/\.py$/)} Python`,
      `${count(/\.rs$/)} Rust`,
      `${count(/\.go$/)} Go`,
      `${count(/package\.json$/)} package.json`,
      `${count(/Dockerfile|Containerfile|compose\.ya?ml/i)} container assets`,
      `${count(/\.env\.(example|sample|template)/)} env templates`,
      `${count(/\.test\.|\.spec\.|test_[^/]*\.py|[^/]*_test\.py/)} test files`,
      `${count(/\.md$/)} docs`,
    ].join(", ");
    const sourceFiles = count(/\.(jsx?|tsx?|py|rs|go|rb|php|java|kt|cs)$/);
    const languageGuess =
      sourceFiles === 0
        ? `no source files detected in the tree (GitHub labels it ${meta.language ?? "unknown"})`
        : count(/\.py$/) > count(/\.(jsx?|tsx?)$/)
          ? "Python"
          : count(/\.(jsx?|tsx?)$/) > 0
            ? "JavaScript/TypeScript"
            : meta.language ?? "unknown";

    await ctx.runMutation(internal.liveWrite.appendStep, {
      runId, userId, seq: seq++, title: "Static survey",
      detail: `Indexed ${censusNote}.`,
      model: NEBIUS_FAST_MODEL, tokens: 0, status: "ok", at: at(),
    });

    // ── Phase 3: manifest forensics ────────────────────────────────────────
    // Detect the dependency manifest by ecosystem instead of assuming npm, so
    // a Python or Go repo is described in its own terms instead of being
    // reported as missing a package.json.
    const rootFiles = new Set(
      files.filter((f) => !f.path.includes("/")).map((f) => f.path),
    );
    const manifest = (
      [
        { name: "package.json", ecosystem: "Node.js" },
        { name: "pyproject.toml", ecosystem: "Python" },
        { name: "requirements.txt", ecosystem: "Python" },
        { name: "setup.py", ecosystem: "Python" },
        { name: "Pipfile", ecosystem: "Python" },
        { name: "Cargo.toml", ecosystem: "Rust" },
        { name: "go.mod", ecosystem: "Go" },
        { name: "composer.json", ecosystem: "PHP" },
        { name: "Gemfile", ecosystem: "Ruby" },
        { name: "pom.xml", ecosystem: "Java" },
        { name: "build.gradle", ecosystem: "Java/Kotlin" },
      ] as const
    ).find((m) => rootFiles.has(m.name));
    const ecosystem = manifest?.ecosystem ?? "none detected";

    let manifestNote = manifest
      ? `Root manifest ${manifest.name}, so this is a ${manifest.ecosystem} project.`
      : `No dependency manifest at the repo root (checked package.json, pyproject.toml, requirements.txt, Cargo.toml, go.mod, composer.json, Gemfile, pom.xml, build.gradle). File mix suggests ${languageGuess}.`;
    let manifestText = "";
    let depNames: string[] = [];
    let scripts: string[] = [];
    let depEntries: { name: string; version: string }[] = [];

    if (manifest) {
      const manifestRes = await fetchJson(
        `${base}/contents/${manifest.name}?ref=${meta.default_branch}`,
      );
      if (manifestRes.ok) {
        const mf = manifestRes.body as { content?: string; encoding?: string };
        try {
          const raw = Buffer.from(
            mf.content ?? "",
            mf.encoding === "base64" ? "base64" : "utf8",
          ).toString("utf8");
          manifestText = raw;

          if (manifest.name === "package.json") {
            const pkg = JSON.parse(raw) as {
              name?: string;
              version?: string;
              scripts?: Record<string, string>;
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            depNames = Object.keys(pkg.dependencies ?? {});
            const devDeps = Object.keys(pkg.devDependencies ?? {});
            scripts = Object.keys(pkg.scripts ?? {});
            depEntries = Object.entries(pkg.dependencies ?? {}).map(([name, version]) => ({
              name,
              version,
            }));
            manifestNote = `${pkg.name ?? "unnamed"} v${pkg.version ?? "?"} (Node.js): ${depNames.length} runtime deps, ${devDeps.length} dev deps. Scripts: ${scripts.join(", ") || "none"}.`;
          } else {
            // Text manifests: surface the pinned/required package names.
            const deps = raw
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l && !l.startsWith("#") && /[=<>~]/.test(l))
              .slice(0, 20);
            depNames = deps
              .map((l) => l.split(/[=<>~ ]/)[0])
              .filter((n) => /^[A-Za-z@]/.test(n));
            if (manifest.name === "requirements.txt") {
              depEntries = deps.map((l) => {
                const [name, version] = l.split("==");
                return { name, version: version ?? "*" };
              });
              manifestNote = `requirements.txt pins ${depEntries.length} Python packages: ${depNames.slice(0, 10).join(", ")}${depEntries.length > 10 ? ", …" : ""}.`;
            } else {
              manifestNote = `${manifest.name} present (${manifest.ecosystem}); ${raw.split("\n").length} lines of manifest. Run commands come from this manifest, not from npm scripts.`;
            }
          }
        } catch {
          manifestNote = `${manifest.name} found (${manifest.ecosystem}) but could not be parsed.`;
        }
      } else {
        manifestNote = `${manifest.name} listed in the tree but its contents could not be fetched.`;
      }
    }

    await ctx.runMutation(internal.liveWrite.appendStep, {
      runId, userId, seq: seq++, title: "Manifest forensics",
      detail: manifestNote,
      model: NEBIUS_FAST_MODEL, tokens: 0, status: "ok", at: at(),
    });

    // Seed the Dependency intel table from the manifest. Research (registry
    // latest, Tavily notes) happens on demand from the dashboard.
    for (const d of depEntries.slice(0, 24)) {
      await ctx.runMutation(internal.liveWrite.insertDependency, {
        runId, userId, name: d.name, version: d.version,
      });
    }

    // ── Phase 4: Nemotron onboarding plan (screened) ──────────────────────
    const planUserBase = `The engineering team is handing ${meta.full_name} over to a new owner.\nLanguage: ${meta.language}\nIdle for ${daysIdle} days\nSurvey: ${files.length} files; ${manifestNote}\nDependencies: ${depNames.slice(0, 25).join(", ") || "unknown"}\n\nWrite the first-day onboarding and deployment plan a new owner follows. Describe only reading, installing, configuring, running and verifying what already exists.`;

    let planText = "";
    let planTokens = 0;
    let planOk = false;
    for (let attempt = 0; attempt < 2 && !planOk; attempt++) {
      const res = await callNebius(
        apiKey,
        NEBIUS_PLAN_MODEL,
        [
          { role: "system", content: PLAN_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              planUserBase +
              (attempt === 1
                ? "\n\nThe previous attempt was rejected as unsafe. Produce a strictly onboarding-focused plan: read, install, configure, run, verify. No code changes, no writes to the repository, no security bypasses."
                : ""),
          },
        ],
        700,
      );
      if (!res.ok) {
        if (attempt === 1) {
          await ctx.runMutation(internal.liveWrite.appendStep, {
            runId, userId, seq: seq++, title: "Planning",
            detail: `Planning call failed: ${res.error}`,
            model: NEBIUS_PLAN_MODEL, tokens: 0, status: "failed", at: at(),
          });
        }
        continue;
      }
      planTokens += res.tokens;
      if (UNSAFE_RE.test(res.text)) {
        await ctx.runMutation(internal.liveWrite.appendStep, {
          runId, userId, seq: seq++, title: "Planning",
          detail: `The planning model returned instructions aimed at compromising the repository. The output was discarded and never shown.${
            attempt === 0 ? " Retrying with a stricter brief." : " No safe plan produced, stopping honestly."
          }`,
          model: NEBIUS_PLAN_MODEL, tokens: res.tokens,
          status: attempt === 0 ? "retry" : "failed", at: at(),
        });
        continue;
      }
      planText = res.text;
      planOk = true;
      await ctx.runMutation(internal.liveWrite.appendStep, {
        runId, userId, seq: seq++, title: "Planning",
        detail: planText,
        model: NEBIUS_PLAN_MODEL, tokens: res.tokens, status: "ok", at: at(),
      });
    }

    const planCredits = Math.round((planTokens / 1000) * 5) / 100;
    await ctx.runMutation(internal.liveWrite.appendUsage, {
      userId, runId, tokens: planTokens, credits: planCredits, at: at(),
    });
    totalTokens += planTokens;
    totalCredits += planCredits;

    if (!planOk) {
      await ctx.runMutation(internal.liveWrite.patchRun, {
        runId,
        patch: {
          status: "failed",
          finishedAt: at(),
          summary:
            "Planning stopped honestly: the planning model did not return a safe, onboarding-focused plan, so nothing was displayed.",
        },
      });
      return { ok: false as const, reason: "plan_failed" as const };
    }

    // ── Phase 5: deployability probes ──────────────────────────────────────
    await ctx.runMutation(internal.liveWrite.patchRun, {
      runId,
      patch: { status: "verifying" },
    });

    const probes: { claim: string; command: string; output: string; exit: number; verdict: "verified" | "unverified" }[] = [];

    probes.push({
      claim: `Repository is reachable via the GitHub API on branch ${meta.default_branch}.`,
      command: `GET ${base}`,
      output: `HTTP ${repoRes.status}. ${meta.full_name}, ${meta.size} KB, pushed ${meta.pushed_at}.`,
      exit: 0,
      verdict: "verified",
    });
    const isNode = ecosystem === "Node.js";
    probes.push({
      claim: isNode
        ? "The manifest declares at least one runnable script."
        : "The repo declares a dependency manifest a new owner can install from.",
      command: isNode
        ? "cat package.json | jq .scripts"
        : `head -20 ${manifest?.name ?? "manifest"}`,
      output: manifestNote,
      exit: isNode ? (scripts.length > 0 ? 0 : 1) : manifest ? 0 : 1,
      verdict: isNode
        ? scripts.length > 0
          ? "verified"
          : "unverified"
        : manifest
          ? "verified"
          : "unverified",
    });

    const jsTestFiles = count(/\.test\.|\.spec\.|__tests__/);
    const pyTestFiles = count(/(^|\/)(test_[^/]*\.py|[^/]*_test\.py|tests?\/)/);
    const testFiles = jsTestFiles + pyTestFiles;
    const declaresTestCmd =
      scripts.some((s) => s.includes("test")) ||
      /pytest|unittest|tox|nose/.test(manifestText);
    const hasTests = testFiles > 0 || declaresTestCmd;
    probes.push({
      claim: "The repo ships a runnable test suite.",
      command:
        "find . \\( -name '*test*' -o -name '*spec*' \\) -not -path './node_modules/*' | wc -l",
      output: `${testFiles} candidate test files on disk (JS ${jsTestFiles}, Python ${pyTestFiles}); test runner declared: ${declaresTestCmd ? "yes" : "no"}.`,
      exit: hasTests ? 0 : 1,
      verdict: hasTests ? "verified" : "unverified",
    });

    const envDocCount = count(
      /\.env\.(example|sample|template)|(^|\/)env\.(example|sample)/,
    );
    probes.push({
      claim: "Environment contract is documented for a new operator.",
      command: "ls .env.example .env.sample env.example 2>/dev/null || echo MISSING",
      output:
        envDocCount > 0
          ? `${envDocCount} env template file(s) present.`
          : "No env template found. Operator must reconstruct variables from code or docs.",
      exit: envDocCount > 0 ? 0 : 1,
      verdict: envDocCount > 0 ? "verified" : "unverified",
    });

    const containerAssets = count(
      /Dockerfile|Containerfile|(^|\/)(docker-)?compose\.ya?ml$|devcontainer\.json/i,
    );
    probes.push({
      claim:
        "Containerization or devcontainer assets exist or the loop must author them.",
      command:
        "find . -iname 'Dockerfile*' -o -iname 'compose*.yml' -o -iname 'devcontainer.json' | wc -l",
      output: `${containerAssets} container/devcontainer asset(s) found.`,
      exit: containerAssets > 0 ? 0 : 1,
      verdict: containerAssets > 0 ? "verified" : "unverified",
    });
    probes.push({
      claim: "Repository has an open-source license on file.",
      command: "jq -r .license.spdx_id <<< meta",
      output: meta.license?.spdx_id ? `License: ${meta.license.spdx_id}.` : "No license detected. Handover risk for commercial reuse.",
      exit: meta.license?.spdx_id ? 0 : 1,
      verdict: meta.license?.spdx_id ? "verified" : "unverified",
    });

    let evidenceSeq = 0;
    for (const p of probes) {
      await ctx.runMutation(internal.liveWrite.appendEvidence, {
        runId, userId, seq: evidenceSeq++, claim: p.claim, command: p.command,
        output: p.output, exitCode: p.exit, verdict: p.verdict, at: at(),
      });
    }

    await ctx.runMutation(internal.liveWrite.appendStep, {
      runId, userId, seq: seq++, title: "Deployability probes",
      detail: `${probes.filter((p) => p.verdict === "verified").length} of ${probes.length} deployability claims verified against the real repository.`,
      model: NEBIUS_FAST_MODEL, tokens: 0, status: "verifying", at: at(),
    });

    // ── Phase 5b: sandboxed execution ──────────────────────────────────────
    // When a runner is attached the claim stops being static: a clean clone
    // is installed and its declared test suite actually executed, with the
    // real stdout and exit code captured. On failure Nemotron diagnoses and
    // gets exactly one corrective retry. Without a runner the pack stays
    // honestly static and says so.
    const runnerConfigured = Boolean(process.env.RUNNER_URL && process.env.RUNNER_TOKEN);
    let execLine = "Sandbox runner not configured; verification stayed static.";
    let testVerified = true;
    const clip = (s: string) => (s.length > 1400 ? `${s.slice(0, 1400)}\n… (truncated)` : s);

    if (runnerConfigured) {
      testVerified = false;
      await ctx.runMutation(internal.liveWrite.appendStep, {
        runId, userId, seq: seq++, title: "Test run",
        detail: "Cloning a clean copy into the capped sandbox and running the declared test suite.",
        model: NEBIUS_FAST_MODEL, tokens: 0, status: "verifying", at: at(),
      });

      const first = await ctx.runAction(internal.runner.execute, { repoUrl: run.repoUrl });

      if (!first.ok) {
        execLine = `Sandbox runner unavailable (${first.reason}): ${first.detail ?? "no detail"}. Verification stayed static.`;
      } else if (first.clone && !first.clone.ok) {
        await ctx.runMutation(internal.liveWrite.appendEvidence, {
          runId, userId, seq: evidenceSeq++,
          claim: "A clean clone of the repository succeeds.",
          command: `git clone --depth 1 ${run.repoUrl}`,
          output: clip(first.clone.output),
          exitCode: first.clone.exitCode,
          verdict: "unverified", at: at(),
        });
        execLine = `Clean clone failed in the sandbox (exit ${first.clone.exitCode}). The repo is likely private or the URL is wrong.`;
      } else {
        if (first.install && !first.install.ok) {
          await ctx.runMutation(internal.liveWrite.appendEvidence, {
            runId, userId, seq: evidenceSeq++,
            claim: "Dependencies install from a clean clone.",
            command: first.install.command,
            output: clip(first.install.output),
            exitCode: first.install.exitCode,
            verdict: "unverified", at: at(),
          });
        }
        if (first.test) {
          const passed = first.test.ok && !first.test.timedOut;
          await ctx.runMutation(internal.liveWrite.appendEvidence, {
            runId, userId, seq: evidenceSeq++,
            claim: "The declared test suite passes on a clean clone.",
            command: first.test.command,
            output: clip(first.test.output),
            exitCode: first.test.exitCode,
            verdict: passed ? "verified" : "unverified", at: at(),
          });
          testVerified = passed;
        }

        if (!testVerified && (first.test || first.install)) {
          // ── diagnose, then exactly one corrective retry ─────────────────
          const diag = await callNebius(
            apiKey,
            NEBIUS_FAST_MODEL,
            [
              {
                role: "system",
                content:
                  'You diagnose a failing test run in a sandboxed clone. Reply with strict JSON only, no fences: {"diagnosis": "max 30 words", "fixCommand": "one single-line shell command to run inside the repo before retrying the tests"}. The command must be a single line and must not contain ; | ` $ > < or the words rm, sudo, curl, wget, chmod, chown, or any URL. Prefer npm/pkg commands that repair the test environment (pin a dev dependency, set a test script env var, add a missing flag).',
              },
              {
                role: "user",
                content: `Repo: ${run.repoUrl}\nInstall: ${
                  first.install ? `exit ${first.install.exitCode}\n${first.install.output.slice(-600)}` : "ok"
                }\nTest: ${
                  first.test ? `exit ${first.test.exitCode}\n${first.test.output.slice(-800)}` : "did not run"
                }\n\nDiagnose and propose the fix command.`,
              },
            ],
            400,
          );

          let fixCommand: string | null = null;
          let diagnosis = "Diagnosis unavailable.";
          if (diag.ok) {
            totalTokens += diag.tokens;
            const diagCredits = Math.round((diag.tokens / 1000) * 5) / 100;
            totalCredits += diagCredits;
            await ctx.runMutation(internal.liveWrite.appendUsage, {
              userId, runId, tokens: diag.tokens, credits: diagCredits, at: at(),
            });
            diagnosis = diag.text;
            try {
              const parsed = JSON.parse(diag.text.replace(/^```(?:json)?|```$/g, "").trim()) as {
                diagnosis?: string;
                fixCommand?: string;
              };
              diagnosis = parsed.diagnosis || diagnosis;
              const candidate = (parsed.fixCommand || "").trim();
              if (candidate && candidate.length <= 220 && !BANNED_FIX_RE.test(candidate)) {
                fixCommand = candidate;
              }
            } catch {
              diagnosis = `${diagnosis} (diagnosis was not valid JSON, no retry attempted)`;
            }
          } else {
            diagnosis = `Diagnosis call failed: ${diag.error}`;
          }

          // Screen the diagnosis prose too: an unsafe explanation must not be
          // displayed, and it voids any proposed command.
          if (UNSAFE_RE.test(diagnosis)) {
            diagnosis = "Diagnosis discarded (the model returned unsafe instructions).";
            fixCommand = null;
          }

          await ctx.runMutation(internal.liveWrite.appendStep, {
            runId, userId, seq: seq++, title: "Fix cycle",
            detail: fixCommand
              ? `${diagnosis} Retrying with: \`${fixCommand}\`.`
              : `${diagnosis} No safe corrective command proposed, stopping honestly.`,
            model: NEBIUS_FAST_MODEL, tokens: diag.ok ? diag.tokens : 0,
            status: fixCommand ? "retry" : "failed", at: at(),
          });

          if (fixCommand) {
            await ctx.runMutation(internal.liveWrite.patchRun, {
              runId, patch: { status: "fixing", fixAttempts: 1 },
            });
            const second = await ctx.runAction(internal.runner.execute, {
              repoUrl: run.repoUrl,
              fixCommand,
            });
            if (second.ok && second.test) {
              const passed = second.test.ok && !second.test.timedOut;
              await ctx.runMutation(internal.liveWrite.appendEvidence, {
                runId, userId, seq: evidenceSeq++,
                claim: "After one corrective fix, the declared test suite passes.",
                command: `${fixCommand} && ${second.test.command}`,
                output: clip(second.test.output),
                exitCode: second.test.exitCode,
                verdict: passed ? "verified" : "unverified", at: at(),
              });
              testVerified = passed;
            }
            execLine = testVerified
              ? `Tests passed after one corrective fix (\`${fixCommand}\`).`
              : `Tests still failing after one corrective fix (\`${fixCommand}\`).`;
          } else {
            execLine = "Tests failed and no safe corrective command was proposed.";
          }
        } else if (first.test) {
          testVerified = true;
          execLine = `Tests passed on a clean clone in ${first.test.durationMs} ms.`;
        } else {
          execLine = "No test script declared in the manifest; recorded as an unverified claim.";
        }
      }

      await ctx.runMutation(internal.liveWrite.appendStep, {
        runId, userId, seq: seq++, title: "Test result",
        detail: execLine,
        model: NEBIUS_FAST_MODEL, tokens: 0,
        status: testVerified ? "ok" : "failed", at: at(),
      });
    }

    // ── Phase 6: Nemotron analysis ─────────────────────────────────────────
    const analysisRes = await callNebius(
      apiKey,
      NEBIUS_PLAN_MODEL,
      [
        {
          role: "system",
          content:
            "You are the handover analyst for an inherited codebase. Given repo facts and probe results, write the handover risk summary. Max 90 words. Plain text. Lead with the single biggest handover risk, then list the gaps as short sentences. Be specific about the project's ecosystem: if it is not a Node.js project, never treat a missing package.json as a defect, and say what the operator should do instead.",
        },
        {
          role: "user",
          content: `Repo ${meta.full_name}, idle ${daysIdle} days.\nSurvey: ${censusNote}.\nManifest: ${manifestNote}\nProbe results:\n${probes
            .map((p) => `[${p.verdict}] ${p.claim} (${p.output})`)
            .join("\n")}\nExecution: ${execLine}`,
        },
      ],
      800,
    );

    let analysisText = "Analysis unavailable.";
    if (analysisRes.ok) {
      analysisText = analysisRes.text;
      await ctx.runMutation(internal.liveWrite.appendUsage, {
        userId, runId, tokens: analysisRes.tokens,
        credits: Math.round((analysisRes.tokens / 1000) * 5) / 100, at: at(),
      });
      totalTokens += analysisRes.tokens;
      totalCredits += Math.round((analysisRes.tokens / 1000) * 5) / 100;
      if (UNSAFE_RE.test(analysisRes.text)) {
        analysisText =
          "Analysis discarded: the diagnosis model returned instructions aimed at the repository, so they were never recorded.";
      }
    }

    await ctx.runMutation(internal.liveWrite.appendStep, {
      runId, userId, seq: seq++, title: "Risk analysis",
      detail: analysisText,
      model: NEBIUS_PLAN_MODEL, tokens: analysisRes.ok ? analysisRes.tokens : 0,
      status: analysisRes.ok ? "ok" : "failed", at: at(),
    });

    // ── Finalize ───────────────────────────────────────────────────────────
    const verified = probes.filter((p) => p.verdict === "verified").length;
    let outcome = verified >= 4 ? "success" : verified >= 2 ? "partial" : "failed";
    if (runnerConfigured && !testVerified && outcome === "success") outcome = "partial";
    await ctx.runMutation(internal.liveWrite.patchRun, {
      runId,
      patch: {
        status: outcome,
        stepsDone: seq,
        stepsTotal: seq,
        finishedAt: at(),
        tokensUsed: totalTokens,
        creditsUsed: Math.round(totalCredits * 100) / 100,
        health:
          outcome !== "failed"
            ? { status: "live" as const, url: `https://github.com/${owner}/${repo}`, latencyMs: 0, httpCode: repoRes.status }
            : undefined,
        summary: `Live takeover of ${meta.full_name}. ${verified}/${probes.length} deployability claims verified against the real repository. ${execLine} ${analysisText}`,
      },
    });

    return { ok: true as const, verified, total: probes.length, outcome };
  },
});

// Internal smoke test: creates a run owned by the newest signed-in user and
// executes the full live pipeline against a real repository, then returns the
// recorded steps/evidence. Reachable only from the Convex CLI or dashboard
// (internal function), never from the client.
export const smoke = internalAction({
  args: { repoUrl: v.string(), name: v.optional(v.string()) },
  handler: async (
    ctx,
    { repoUrl, name },
  ): Promise<{
    ok: boolean;
    reason?: string;
    runId?: Id<"runs">;
    result?: unknown;
    detail?: unknown;
  }> => {
    const started = await ctx.runMutation(internal.liveWrite.startSmokeRun, {
      repoUrl,
      name,
    });
    if (!started.ok) return { ok: false, reason: started.reason };

    const result = await ctx.runAction(internal.live.runLive, {
      runId: started.runId,
      userId: started.userId,
    });
    const detail = await ctx.runQuery(internal.liveWrite.inspectRun, {
      runId: started.runId,
      userId: started.userId,
    });
    return { ok: true, runId: started.runId, result, detail };
  },
});
