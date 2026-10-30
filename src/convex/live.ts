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
import { extractFixCommand } from "./fixCommand";
import { ciCommandsFrom, resolveStrategy, type RunStrategy } from "./strategy";

const NEBIUS_BASE = "https://api.tokenfactory.nebius.com/v1";
const NEBIUS_PLAN_MODEL = process.env.NEBIUS_PLAN_MODEL || "nvidia/Nemotron-3-Ultra-550b-a55b";
const NEBIUS_FAST_MODEL = process.env.NEBIUS_FAST_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

// The repair loop is bounded: after this many diagnosed cycles the run stops
// at a wall the model named, instead of looping forever or claiming green.
const MAX_FIX_CYCLES = 4;
// Cycles only start while this much of the action's budget remains, so the
// diagnosis call and the final analysis always have room to run.
const CYCLE_WINDOW_MS = 420_000;

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

// Model-authored corrective commands are screened in ./fixCommand (argv
// allowlist, no shell metacharacters, no absolute paths, no traversal) and
// re-screened by the runner, which never trusts this client.

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
  attempt = 0,
): Promise<
  | { ok: true; text: string; tokens: number; truncated: boolean }
  | { ok: false; error: string }
> {
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
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, error: "Nebius returned an empty completion" };
    const finishReason = data.choices?.[0]?.finish_reason;
    // Nemotron bills its thinking against the token budget, so a long prompt
    // can leave the visible answer cut off mid-sentence. Retry once with
    // double the budget before anyone sees a truncated paragraph.
    if (finishReason === "length" && attempt < 1) {
      const retry = await callNebius(apiKey, model, messages, maxTokens * 2, attempt + 1);
      // Keep the usage ledger honest: both attempts were billed.
      if (retry.ok) {
        return { ...retry, tokens: retry.tokens + (data.usage?.total_tokens ?? 0) };
      }
      return retry;
    }
    return {
      ok: true,
      text,
      tokens: data.usage?.total_tokens ?? 0,
      truncated: finishReason === "length",
    };
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
    const pipelineStarted = at();
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

    // Test files by convention, not by a single naming scheme: .test./.spec.
    // names, __tests__/test/tests directories, and plain test.js style entry
    // files (is-number v7 ships `test.js` at the root, for example).
    const TEST_JS_RE =
      /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?|specs?)\/[^/]+\.[cm]?[jt]sx?$|(^|\/)(test|tests|spec|specs)\.[cm]?[jt]sx?$/;
    const TEST_PY_RE = /(^|\/)(test_[^/]*\.py|[^/]*_test\.py)$|(^|\/)(test|tests)\/[^/]+\.py$/;
    const TEST_GO_RE = /_test\.go$/;
    const TEST_RS_RE = /(^|\/)tests\/[^/]+\.rs$/;

    // Inherited repos are not always npm projects, so the census counts the
    // ecosystems we can actually inspect and execute. The test counts are
    // computed once here so the ledger, the survey and the pack can never
    // disagree.
    const jsTestFiles = count(TEST_JS_RE);
    const pyTestFiles = count(TEST_PY_RE);
    const testFiles = jsTestFiles + pyTestFiles + count(TEST_GO_RE) + count(TEST_RS_RE);
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
      testFiles === 1 ? "1 test file" : `${testFiles} test files`,
      `${count(/\.md$/)} docs`,
    ].join(", ");
    const sourceFiles = count(/\.(jsx?|tsx?|py|rs|go|rb|php|java|kt|cs)$/);
    const envDocCount = count(/\.env\.(example|sample|template)|(^|\/)env\.(example|sample)/);
    const containerAssets = count(
      /Dockerfile|Containerfile|(^|\/)(docker-)?compose\.ya?ml$|devcontainer\.json/i,
    );
    const docCount = count(/\.md$/);
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

    // Manifest files can live in a subdirectory (a `web/` app whose root is a
    // deployment wrapper, for example). Record them so "no root manifest" is
    // never read as "nothing installable" when the tree says otherwise.
    const MANIFEST_NAMES = [
      "package.json",
      "pyproject.toml",
      "requirements.txt",
      "setup.py",
      "Pipfile",
      "Cargo.toml",
      "go.mod",
      "composer.json",
      "Gemfile",
      "pom.xml",
      "build.gradle",
    ] as const;
    const nestedManifestFiles = files
      .filter(
        (f) =>
          f.path.includes("/") &&
          MANIFEST_NAMES.some((n) => f.path.endsWith(`/${n}`)),
      )
      .map((f) => f.path);
    const nestedManifestNote =
      nestedManifestFiles.length > 0
        ? ` Nested manifests exist in the tree: ${nestedManifestFiles.slice(0, 5).join(", ")}${
            nestedManifestFiles.length > 5
              ? `, and ${nestedManifestFiles.length - 5} more`
              : ""
          }. Inspect those before installing anything.`
        : "";
    let manifestNote = manifest
      ? `Root manifest ${manifest.name}, so this is a ${manifest.ecosystem} project.${nestedManifestNote}`
      : `No dependency manifest at the repo root (checked package.json, pyproject.toml, requirements.txt, Cargo.toml, go.mod, composer.json, Gemfile, pom.xml, build.gradle). File mix suggests ${languageGuess}.${nestedManifestNote}`;
    let manifestText = "";
    let depNames: string[] = [];
    let scripts: string[] = [];
    let depEntries: { name: string; version: string }[] = [];
    // Fields hoisted out of the manifest parse so the structured survey can
    // record what the manifest actually declares.
    let pkgMain: string | undefined;
    let pkgModule: string | undefined;
    let pkgBins: string[] = [];
    let workspacePatterns: string[] = [];
    let engines: string | undefined;
    // Facts the run-strategy resolver needs beyond the display strings.
    let scriptMap: Record<string, string> = {};
    let devDepMap: Record<string, string> = {};
    let pkgPackageManager: string | undefined;

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
              main?: unknown;
              module?: unknown;
              bin?: unknown;
              workspaces?: unknown;
              engines?: Record<string, unknown>;
              packageManager?: string;
            };
            depNames = Object.keys(pkg.dependencies ?? {});
            const devDeps = Object.keys(pkg.devDependencies ?? {});
            scripts = Object.keys(pkg.scripts ?? {});
            scriptMap = pkg.scripts ?? {};
            devDepMap = pkg.devDependencies ?? {};
            pkgPackageManager =
              typeof pkg.packageManager === "string" ? pkg.packageManager : undefined;
            // Runtime and dev dependencies both belong in the handover: for a
            // library with no runtime deps (is-number, for example) the dev
            // tooling is the only dependency surface an operator can inherit.
            depEntries = [
              ...Object.entries(pkg.dependencies ?? {}),
              ...Object.entries(pkg.devDependencies ?? {}),
            ].map(([name, version]) => ({ name, version: String(version) }));
            pkgMain = typeof pkg.main === "string" ? pkg.main : undefined;
            pkgModule = typeof pkg.module === "string" ? pkg.module : undefined;
            pkgBins =
              typeof pkg.bin === "string"
                ? [pkg.bin]
                : pkg.bin && typeof pkg.bin === "object"
                  ? Object.values(pkg.bin)
                  : [];
            const ws = pkg.workspaces;
            workspacePatterns = Array.isArray(ws)
              ? ws.filter((w): w is string => typeof w === "string")
              : ws && Array.isArray((ws as { packages?: unknown }).packages)
                ? ((ws as { packages: unknown[] }).packages.filter(
                    (w): w is string => typeof w === "string",
                  ))
                : [];
            engines = pkg.engines
              ? Object.entries(pkg.engines)
                  .map(([k, v]) => `${k} ${String(v)}`)
                  .join(", ")
              : undefined;
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

    // ── Structured survey ──────────────────────────────────────────────────
    // The pack's architecture map and runbook are assembled from these facts,
    // captured once here instead of being re-parsed out of prose later.
    const lockfile = (
      [
        { file: "package-lock.json", manager: "npm" },
        { file: "pnpm-lock.yaml", manager: "pnpm" },
        { file: "yarn.lock", manager: "yarn" },
        { file: "bun.lock", manager: "bun" },
        { file: "bun.lockb", manager: "bun" },
        { file: "poetry.lock", manager: "poetry" },
        { file: "Pipfile.lock", manager: "pipenv" },
        { file: "uv.lock", manager: "uv" },
        { file: "Cargo.lock", manager: "cargo" },
        { file: "go.sum", manager: "go" },
      ] as const
    ).find((l) => rootFiles.has(l.file));

    const declaredEntryPoints = [pkgMain, pkgModule, ...pkgBins].filter(
      (p): p is string => Boolean(p),
    );
    const conventionEntryPoints: string[] =
      (
        {
          "package.json": [
            "src/index.ts", "src/index.tsx", "src/index.js", "src/index.jsx",
            "src/main.ts", "src/main.tsx", "src/main.js",
            "index.js", "server.js", "src/server.ts", "src/server.js",
          ],
          "pyproject.toml": ["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "src/main.py"],
          "requirements.txt": ["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "src/main.py"],
          "setup.py": ["main.py", "app.py"],
          Pipfile: ["main.py", "app.py"],
          "Cargo.toml": ["src/main.rs", "src/lib.rs"],
          "go.mod": ["main.go", "cmd"],
          "composer.json": ["index.php", "public/index.php"],
          Gemfile: ["config.ru", "app.rb"],
          "pom.xml": ["src/main/java"],
          "build.gradle": ["src/main/java"],
        } as Record<string, string[]>
      )[manifest?.name ?? ""] ?? [];
    const foundEntryPoints = conventionEntryPoints
      .filter((p) => files.some((f) => f.path === p || f.path.startsWith(`${p}/`)))
      .map((p) => (p === "cmd" ? "cmd/" : p));
    const entryPoints = [
      ...new Set([...declaredEntryPoints, ...foundEntryPoints]),
    ].slice(0, 6);

    const nestedManifests = manifest
      ? files.filter((f) => f.path !== manifest.name && f.path.endsWith(manifest.name)).length
      : 0;

    // ── Execution strategy ─────────────────────────────────────────────────
    // How this repo's own toolchain installs, builds and tests itself: the
    // lockfile picks the package manager, executable CI commands cover
    // monorepos, and package.json scripts are the fallback. Resolved once
    // here so the plan, the sandbox loop, the runbook and the pack all read
    // the same answer instead of re-deriving it.
    const runnerConfigured = Boolean(
      process.env.RUNNER_URL && process.env.RUNNER_TOKEN,
    );
    let strategy: RunStrategy | null = null;
    if (runnerConfigured) {
      let ciRuns: string[] = [];
      let ciSource: string | undefined;
      if (manifest?.name === "package.json") {
        const workflowPaths = files
          .filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f.path))
          .slice(0, 3)
          .map((f) => f.path);
        for (const path of workflowPaths) {
          if (ciRuns.length >= 12) break;
          const wfRes = await fetchJson(`${base}/contents/${path}?ref=${meta.default_branch}`);
          if (!wfRes.ok) continue;
          const wf = wfRes.body as { content?: string; encoding?: string };
          const text = Buffer.from(
            wf.content ?? "",
            wf.encoding === "base64" ? "base64" : "utf8",
          ).toString("utf8");
          const runs = ciCommandsFrom(text).slice(0, 8);
          if (runs.length > 0) {
            ciRuns = ciRuns.concat(runs);
            if (!ciSource) ciSource = path;
          }
        }
      }
      strategy = resolveStrategy({
        ecosystem,
        lockfile: lockfile?.file,
        pkg:
          manifest?.name === "package.json"
            ? {
                scripts: scriptMap,
                devDependencies: devDepMap,
                workspaces: workspacePatterns,
                packageManager: pkgPackageManager,
              }
            : null,
        ciRuns,
        ciSource,
        testFiles,
        workspaceManifests: nestedManifests,
        manifestText,
        rootFiles: [...rootFiles],
      });
    }

    const survey = {
      language: languageGuess,
      files: files.length,
      manifest: manifest?.name,
      ecosystem,
      lockfile: lockfile?.file,
      packageManager: lockfile?.manager,
      entryPoints,
      workspaces: workspacePatterns,
      workspaceManifests: nestedManifests,
      scripts,
      engines,
      containerAssets,
      testFiles,
      envTemplates: envDocCount,
      docs: docCount,
      ...(strategy ? { strategy } : {}),
    };
    // Cross-phase handoff: later phases (probes, repair, analysis) read these
    // instead of re-fetching the same facts.
    const notesObj = {
      census: censusNote,
      manifest: manifestNote,
      repo: meta.full_name,
      branch: meta.default_branch,
      license: meta.license?.spdx_id ?? "none",
      reach: `HTTP ${repoRes.status}`,
      httpCode: repoRes.status,
      idleDays: daysIdle,
      declaresTest:
        scripts.includes("test") || /pytest|unittest|tox|nose/.test(manifestText),
    };
    await ctx.runMutation(internal.liveWrite.patchRun, {
      runId,
      patch: { survey, notes: notesObj },
    });

    if (runnerConfigured) {
      await ctx.runMutation(internal.liveWrite.appendStep, {
        runId, userId, seq: seq++, title: "Run strategy",
        detail: strategy
          ? `Resolved from ${strategy.source}: ${strategy.label}.`
          : `The sandbox is configured, but no runnable test strategy was found: no test script, CI test step or recognised test runner at the root (execution stays static).${nestedManifestNote}`,
        model: NEBIUS_FAST_MODEL, tokens: 0, status: "ok", at: at(),
      });
    }

    // Seed the Dependency intel table from the manifest. Research (registry
    // latest, Tavily notes) happens on demand from the dashboard.
    for (const d of depEntries.slice(0, 24)) {
      await ctx.runMutation(internal.liveWrite.insertDependency, {
        runId, userId, name: d.name, version: d.version,
      });
    }

    // ── Phase 4: Nemotron onboarding plan (screened) ──────────────────────
    const planUserBase = `The engineering team is handing ${meta.full_name} over to a new owner.\nLanguage: ${meta.language}\nIdle for ${daysIdle} days\nSurvey: ${files.length} files; ${manifestNote}\nEntry points: ${entryPoints.join(", ") || "none identified"}. Lockfile: ${
      lockfile?.file ?? "none"
    }. Workspaces: ${
      workspacePatterns.length > 0
        ? `${workspacePatterns.join(", ")} (${nestedManifests} nested manifests)`
        : "single package"
    }.\nExecution strategy: ${strategy?.label ?? "not resolved; execution stays static"}\nDependencies: ${depNames.slice(0, 25).join(", ") || "unknown"}\n\nWrite the first-day onboarding and deployment plan a new owner follows. Describe only reading, installing, configuring, running and verifying what already exists.`;

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
        1000,
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
      if (res.truncated) {
        planText += " (The plan hit the model's token limit and ends here.)";
      }
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

    type ProbeRow = {
      claim: string;
      command: string;
      output: string;
      exit: number;
      verdict: "verified" | "unverified" | "contradicted";
    };
    const probeRows: ProbeRow[] = [];
    const isNode = ecosystem === "Node.js";
    const clipOutput = (s: string) =>
      s.length > 1400 ? `${s.slice(0, 1400)}\n… (truncated)` : s;

    // Intake reachability is a real HTTP request, so it is always recorded.
    probeRows.push({
      claim: `Repository is reachable via the GitHub API on branch ${meta.default_branch}.`,
      command: `GET ${base}`,
      output: `HTTP ${repoRes.status}. ${meta.full_name}, ${meta.size} KB, pushed ${meta.pushed_at}.`,
      exit: 0,
      verdict: "verified",
    });

    // With a runner attached, the deployability claims are checked against a
    // fresh clone with real commands; without one, the same claims come from
    // the GitHub tree and the recorded command says exactly that. The two
    // modes can never be confused in the ledger.
    let probeSource: "clone" | "github-tree" = "github-tree";
    let probeNote = "";
    if (runnerConfigured) {
      const cloneProbe = await ctx.runAction(internal.runner.execute, {
        repoUrl: run.repoUrl,
        probes: isNode ? "node" : "generic",
      });
      const list = cloneProbe.probes ?? [];
      if (cloneProbe.ok && cloneProbe.clone?.ok && list.length > 0) {
        probeSource = "clone";
        const probeFor = (needle: string) => list.find((p) => p.command.includes(needle));
        const head = probeFor("rev-parse");
        const committed = probeFor("log -1");
        const testPaths = probeFor("*test*");
        const ciPaths = probeFor(".github/workflows");
        const containerPaths = probeFor("Dockerfile");
        const envPaths = probeFor("env.example");
        const licensePaths = probeFor("LICENSE");
        const manifestProbe = probeFor("npm pkg get");
        const nodeVersion = probeFor("node --version");
        const npmVersion = probeFor("npm --version");
        // The runner renders genuinely empty output as "(no output)"; that
        // placeholder must never be mistaken for a matched file path, or an
        // absent CI workflow would count as present.
        const pathsOf = (p: { output: string } | undefined) =>
          (p?.output ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && l !== "(no output)");
        const listed = (paths: string[], cap = 8) =>
          `${paths.length} file(s): ${paths.slice(0, cap).join(", ")}${paths.length > cap ? ", …" : ""}.`;
        const someVerdict = (found: boolean, staticCount: number) =>
          found ? ("verified" as const) : staticCount > 0 ? ("contradicted" as const) : ("unverified" as const);

        probeRows.push({
          claim: "A clean clone of the repository succeeds.",
          command: cloneProbe.clone.command,
          output: clipOutput(cloneProbe.clone.output),
          exit: cloneProbe.clone.exitCode,
          verdict: "verified",
        });
        probeRows.push({
          claim: "The working tree matches the repository's current head commit.",
          command: [head?.command, committed?.command].filter(Boolean).join("  ·  "),
          output: `${head?.output.trim() ?? "unknown"}${
            committed?.output.trim() ? ` committed ${committed.output.trim()}` : ""
          }.`,
          exit: head?.exitCode ?? 1,
          verdict: head?.exitCode === 0 ? "verified" : "unverified",
        });

        const testPathList = pathsOf(testPaths);
        const conventionTests = testPathList.filter(
          (p) => TEST_JS_RE.test(p) || TEST_PY_RE.test(p),
        );
        probeRows.push({
          claim: "The repository ships a runnable test suite.",
          command: testPaths?.command ?? "git ls-files '*test*' '*spec*'",
          output:
            conventionTests.length > 0
              ? `${listed(conventionTests)}
Convention matches are the files a runner would pick up.`
              : testPathList.length > 0
                ? `${testPathList.length} path(s) contain test/spec in their name, but none is a convention test file.`
                : "No path in the clone contains test/spec in its name.",
          exit: conventionTests.length > 0 ? 0 : 1,
          verdict: someVerdict(conventionTests.length > 0, testFiles),
        });

        // Dependency manifests anywhere in the clone. A real inherited repo
        // often has no root manifest and keeps its install contract in a
        // subdirectory, so the absence of a root manifest is never reported as
        // "nothing to install" without this list.
        const manifestPathsProbe = probeFor("*requirements*");
        if (manifestPathsProbe) {
          const manifestList = pathsOf(manifestPathsProbe);
          const rootManifests = manifestList.filter((p) => !p.includes("/"));
          const nested = manifestList.filter((p) => p.includes("/"));
          probeRows.push({
            claim: "Dependency manifests are present in the clone.",
            command: manifestPathsProbe.command,
            output:
              manifestList.length === 0
                ? "No dependency manifest anywhere in the clone."
                : `${rootManifests.length} root manifest(s)${
                    rootManifests.length > 0 ? `: ${rootManifests.join(", ")}` : ""
                  }; ${nested.length} nested manifest(s)${
                    nested.length > 0
                      ? `: ${nested.slice(0, 6).join(", ")}${nested.length > 6 ? ", …" : ""}`
                      : ""
                  }.`,
            exit: manifestPathsProbe.exitCode,
            verdict:
              manifestList.length > 0
                ? "verified"
                : ecosystem !== "none detected"
                  ? "contradicted"
                  : "unverified",
          });
        }

        if (isNode && manifestProbe) {
          let declared: string[] = [];
          try {
            const parsed = JSON.parse(manifestProbe.output) as {
              scripts?: Record<string, unknown>;
            };
            declared = Object.keys(parsed.scripts ?? {});
          } catch {
            /* npm printed an error instead of JSON; the raw output stands */
          }
          probeRows.push({
            claim: "The manifest declares runnable scripts.",
            command: manifestProbe.command,
            output:
              declared.length > 0
                ? `${declared.length} script(s): ${declared.join(", ")}.`
                : clipOutput(manifestProbe.output),
            exit: manifestProbe.exitCode,
            verdict: someVerdict(declared.length > 0, scripts.length),
          });
        }

        const ciList = pathsOf(ciPaths);
        probeRows.push({
          claim: "Continuous integration workflows are present.",
          command: ciPaths?.command ?? "git ls-files .github/workflows",
          output: ciList.length > 0 ? listed(ciList) : "No workflow files in the clone.",
          exit: ciPaths?.exitCode ?? 1,
          verdict: ciList.length > 0 ? "verified" : "unverified",
        });

        const containerList = pathsOf(containerPaths);
        probeRows.push({
          claim: "Container assets ship with the repository.",
          command: containerPaths?.command ?? "git ls-files '*Dockerfile*' '*compose.y*ml' '*.devcontainer*'",
          output:
            containerList.length > 0
              ? listed(containerList)
              : "No container or devcontainer assets in the clone; the loop must author them.",
          exit: containerPaths?.exitCode ?? 1,
          verdict: someVerdict(containerList.length > 0, containerAssets),
        });

        const envList = pathsOf(envPaths);
        probeRows.push({
          claim: "The environment contract is documented for a new operator.",
          command: envPaths?.command ?? "git ls-files '*env.example' '*env.sample' '*env.template'",
          output:
            envList.length > 0
              ? listed(envList)
              : "No env template in the clone. The operator must reconstruct variables from code or docs.",
          exit: envPaths?.exitCode ?? 1,
          verdict: someVerdict(envList.length > 0, envDocCount),
        });

        const licenseList = pathsOf(licensePaths);
        probeRows.push({
          claim: "The repository has an open-source license on file.",
          command: licensePaths?.command ?? "git ls-files '*LICENSE*' '*COPYING*'",
          output:
            licenseList.length > 0
              ? listed(licenseList)
              : `No license file in the clone. The GitHub API reports ${meta.license?.spdx_id ?? "no license"} for this repository.`,
          exit: licensePaths?.exitCode ?? 1,
          verdict: licenseList.length > 0 ? "verified" : meta.license?.spdx_id ? "contradicted" : "unverified",
        });

        if (isNode && nodeVersion && npmVersion) {
          probeRows.push({
            claim: "The sandbox provides the toolchain this repository needs.",
            command: `${nodeVersion.command}  ·  ${npmVersion.command}`,
            output: `${nodeVersion.output.trim()} / npm ${npmVersion.output.trim()}.`,
            exit: nodeVersion.exitCode === 0 && npmVersion.exitCode === 0 ? 0 : 1,
            verdict: nodeVersion.exitCode === 0 && npmVersion.exitCode === 0 ? "verified" : "unverified",
          });
        }
      } else if (cloneProbe.ok && cloneProbe.clone && !cloneProbe.clone.ok) {
        probeRows.push({
          claim: "A clean clone of the repository succeeds.",
          command: cloneProbe.clone.command,
          output: clipOutput(cloneProbe.clone.output),
          exit: cloneProbe.clone.exitCode,
          verdict: "unverified",
        });
        probeNote =
          "The clone probe failed, so the remaining claims were checked against the GitHub tree instead.";
      } else {
        probeNote = `The runner probe call failed (${cloneProbe.reason ?? "unknown"}: ${
          cloneProbe.detail ?? "no detail"
        }); the remaining claims were checked against the GitHub tree instead.`;
      }
    }

    if (probeSource === "github-tree") {
      const treeCommand = `GET ${base}/git/trees/${meta.default_branch}?recursive=1`;
      if (isNode) {
        probeRows.push({
          claim: "The manifest declares at least one runnable script.",
          command: `${treeCommand} (filter: package.json scripts via GET ${base}/contents/package.json)`,
          output: manifestNote,
          exit: scripts.length > 0 ? 0 : 1,
          verdict: scripts.length > 0 ? "verified" : "unverified",
        });
      } else {
        probeRows.push({
          claim: "The repo declares a dependency manifest a new owner can install from.",
          command: treeCommand,
          output: manifestNote,
          exit: manifest ? 0 : 1,
          verdict: manifest ? "verified" : "unverified",
        });
      }
      probeRows.push({
        claim: "The repository ships test files recognized by convention.",
        command: `${treeCommand} (filter: *test*|*spec*)`,
        output: `${testFiles} convention test file(s) in the tree (JS ${jsTestFiles}, Python ${pyTestFiles}).`,
        exit: testFiles > 0 ? 0 : 1,
        verdict: testFiles > 0 ? "verified" : "unverified",
      });
      probeRows.push({
        claim: "Continuous integration workflows are present.",
        command: `${treeCommand} (filter: .github/workflows)`,
        output: `${files.filter((f) => /^\.github\/workflows\//.test(f.path)).length} workflow file(s) in the tree.`,
        exit: files.some((f) => /^\.github\/workflows\//.test(f.path)) ? 0 : 1,
        verdict: files.some((f) => /^\.github\/workflows\//.test(f.path)) ? "verified" : "unverified",
      });
      probeRows.push({
        claim: "The environment contract is documented for a new operator.",
        command: `${treeCommand} (filter: *env.example|*env.sample|*env.template)`,
        output:
          envDocCount > 0
            ? `${envDocCount} env template file(s) present.`
            : "No env template found. The operator must reconstruct variables from code or docs.",
        exit: envDocCount > 0 ? 0 : 1,
        verdict: envDocCount > 0 ? "verified" : "unverified",
      });
      probeRows.push({
        claim: "Container assets ship with the repository.",
        command: `${treeCommand} (filter: Dockerfile|compose|devcontainer)`,
        output:
          containerAssets > 0
            ? `${containerAssets} container/devcontainer asset(s) found.`
            : "No container assets in the tree; the loop must author them.",
        exit: containerAssets > 0 ? 0 : 1,
        verdict: containerAssets > 0 ? "verified" : "unverified",
      });
      probeRows.push({
        claim: "The repository has an open-source license on file.",
        command: `GET ${base}`,
        output: meta.license?.spdx_id
          ? `License: ${meta.license.spdx_id}.`
          : "No license detected. Handover risk for commercial reuse.",
        exit: meta.license?.spdx_id ? 0 : 1,
        verdict: meta.license?.spdx_id ? "verified" : "unverified",
      });
    }

    let evidenceSeq = 0;
    for (const p of probeRows) {
      await ctx.runMutation(internal.liveWrite.appendEvidence, {
        runId, userId, seq: evidenceSeq++, claim: p.claim, command: p.command,
        output: p.output, exitCode: p.exit, verdict: p.verdict, at: at(),
      });
    }

    const probeVerified = probeRows.filter((p) => p.verdict === "verified").length;
    const probeContradicted = probeRows.filter((p) => p.verdict === "contradicted").length;
    await ctx.runMutation(internal.liveWrite.appendStep, {
      runId, userId, seq: seq++, title: "Deployability probes",
      detail: `${probeVerified} of ${probeRows.length} deployability claims verified ${
        probeSource === "clone" ? "against a clean clone with real commands" : "from the GitHub tree"
      }${probeContradicted > 0 ? `; ${probeContradicted} contradicted by the clone` : ""}.${
        probeNote ? ` ${probeNote}` : ""
      }`,
      model: NEBIUS_FAST_MODEL, tokens: 0, status: "ok", at: at(),
    });
    await ctx.runMutation(internal.liveWrite.patchRun, {
      runId,
      patch: { notes: { ...notesObj, probeVerified, probeTotal: probeRows.length } },
    });

    // ── Phase 5b: sandboxed execution and the repair loop ───────────────────
    // With a runner attached the claim stops being static: one clean clone is
    // installed, the resolved strategy's tests run for real, and a bounded
    // repair loop lets the diagnosis model propose allowlisted fix commands on
    // the same working tree until the suite goes green, the cycle budget runs
    // out, or the model names a wall precisely. Without a runner the pack
    // stays honestly static and says so.
    let execLine = "Sandbox runner not configured; verification stayed static.";
    let testVerified = false;
    const clip = (s: string) => (s.length > 1400 ? `${s.slice(0, 1400)}\n… (truncated)` : s);
    type RepairState = {
      state: "static" | "green" | "no-tests" | "error" | "wall";
      cycle: number;
      commands: string[];
      execLine: string;
      wall?: string;
    };
    let repair: RepairState | null = null;

    if (!runnerConfigured) {
      repair = { state: "static", cycle: 0, commands: [], execLine };
    } else if (!strategy) {
      execLine =
        "No runnable test strategy was found (no test script, CI test step or recognised test runner at the root), so the sandbox stayed unused and verification is static." +
        (nestedManifestFiles.length > 0
          ? ` Nested manifests exist in the tree: ${nestedManifestFiles.slice(0, 5).join(", ")}.`
          : "");
      repair = { state: "static", cycle: 0, commands: [], execLine };
    } else {
      const testRunSeq = seq++;
      await ctx.runMutation(internal.liveWrite.appendStep, {
        runId, userId, seq: testRunSeq, title: "Test run",
        detail: `Cloning a clean copy into the capped sandbox and executing the resolved strategy: ${strategy.label}.`,
        model: NEBIUS_FAST_MODEL, tokens: 0, status: "verifying", at: at(),
      });

      const commandsUsed: string[] = [];
      // Spec: the filmed run should show the large Nemotron model doing the
      // diagnosis, so the tier is overridable rather than fixed to the fast
      // loop's model.
      const diagnoseModel = process.env.NEBIUS_DIAGNOSE_MODEL || NEBIUS_PLAN_MODEL;
      const resultLine = (
        label: string,
        res: { ok: boolean; exitCode: number; timedOut?: boolean; output: string } | null | undefined,
      ) =>
        res
          ? `${label}: ${res.ok ? "ok" : `exit ${res.exitCode}${res.timedOut ? " (timed out)" : ""}`}\n${res.output.slice(-600)}`
          : `${label}: did not run`;
      let stdout = "";
      let sessionId: string | null = null;
      let wall: string | undefined;
      let cyclesRun = 0;

      const prepare = await ctx.runAction(internal.runner.execute, {
        repoUrl: run.repoUrl,
        install: strategy.install,
        build: strategy.build,
        tests: strategy.tests,
      });

      const preparedClone = prepare.clone;
      if (!prepare.ok) {
        execLine = `Sandbox runner unavailable (${prepare.reason}): ${prepare.detail ?? "no detail"}. Verification stayed static.`;
        repair = { state: "error", cycle: 0, commands: [], execLine };
      } else if (!preparedClone || !preparedClone.ok) {
        await ctx.runMutation(internal.liveWrite.appendEvidence, {
          runId, userId, seq: evidenceSeq++,
          claim: "A clean clone of the repository succeeds.",
          command: preparedClone?.command ?? `git clone --depth 1 ${run.repoUrl}`,
          output: clip(preparedClone?.output ?? "The runner returned no clone result."),
          exitCode: preparedClone?.exitCode ?? -1,
          verdict: "unverified", at: at(),
        });
        execLine = `Clean clone failed in the sandbox (exit ${
          preparedClone?.exitCode ?? "?"
        }). The repo is likely private or the URL is wrong.`;
        repair = { state: "error", cycle: 0, commands: [], execLine };
      } else {
        sessionId = prepare.sessionId ?? null;
        commandsUsed.push(strategy.install.join(" "));
        if (strategy.build) commandsUsed.push(strategy.build.join(" "));

        if (prepare.install) {
          await ctx.runMutation(internal.liveWrite.appendEvidence, {
            runId, userId, seq: evidenceSeq++,
            claim: "Dependencies install from a clean clone.",
            command: prepare.install.command,
            output: clip(prepare.install.output),
            exitCode: prepare.install.exitCode,
            verdict: prepare.install.ok && !prepare.install.timedOut ? "verified" : "unverified", at: at(),
          });
        }
        if (prepare.build) {
          await ctx.runMutation(internal.liveWrite.appendEvidence, {
            runId, userId, seq: evidenceSeq++,
            claim: "The repository builds from a clean clone.",
            command: prepare.build.command,
            output: clip(prepare.build.output),
            exitCode: prepare.build.exitCode,
            verdict: prepare.build.ok && !prepare.build.timedOut ? "verified" : "unverified", at: at(),
          });
        }

        const baseline = prepare.tests ?? [];
        const baselinePassed =
          baseline.length > 0 && baseline.every((t) => t.ok && !t.timedOut);
        if (baseline.length > 0) {
          const last = baseline[baseline.length - 1];
          await ctx.runMutation(internal.liveWrite.appendEvidence, {
            runId, userId, seq: evidenceSeq++,
            claim: "The declared test suite passes on a clean clone.",
            command: baseline.map((t) => t.command).join("  &&  "),
            output: clip(last.output),
            exitCode: last.exitCode,
            verdict: baselinePassed ? "verified" : "unverified", at: at(),
          });
        }

        if (baselinePassed) {
          testVerified = true;
          execLine = `Tests passed on a clean clone in ${baseline.reduce((n, t) => n + t.durationMs, 0)} ms.`;
          repair = { state: "green", cycle: 0, commands: commandsUsed, execLine };
        } else {
          stdout = [
            resultLine("install", prepare.install),
            resultLine("build", prepare.build),
            resultLine("baseline tests", baseline[baseline.length - 1]),
          ].join("\n\n");

          for (let cycleNo = 1; cycleNo <= MAX_FIX_CYCLES; cycleNo++) {
            if (Date.now() - pipelineStarted > CYCLE_WINDOW_MS) {
              wall = `Stopped after ${cyclesRun} repair cycle(s): the run's time budget ran out before the suite went green.`;
              break;
            }
            if (!sessionId) {
              wall = "The sandbox opened no repair session, so no cycle could run.";
              break;
            }

            const diag = await callNebius(
              apiKey,
              diagnoseModel,
              [
                {
                  role: "system",
                  content:
                    'You diagnose a failing test run inside a sandboxed clone of a repository. Reply with strict JSON only, no fences: {"diagnosis": "<your diagnosis, max 30 words>", "fixCommand": "<one single-line command to run in the clone before the tests are retried>"}. Replace every <...> with your own words. The command must start with npm, pnpm, yarn, bun, npx, python3, go or cargo, must be a single line, and must not contain ; | & ` $ > < or absolute paths. Prefer commands that repair the environment: install a missing dev dependency, set or fix a package.json script, pin a toolchain flag. If no single safe command can repair the failure, reply {"diagnosis": "<your diagnosis, max 30 words>", "giveUp": true, "wall": "<the specific error that blocks the suite, quoted from the output>"}.',
                },
                {
                  role: "user",
                  content: `Repo: ${run.repoUrl}\nStrategy: ${strategy.label} (from ${strategy.source})\nCycle ${cycleNo} of at most ${MAX_FIX_CYCLES}.\n\n${stdout}\n\nCommands already tried:\n${
                    commandsUsed.length > 0
                      ? commandsUsed.map((c) => `- ${c}`).join("\n")
                      : "- none"
                  }\n\nDiagnose the failure and propose the next corrective command, or give up with a precise wall.`,
                },
              ],
              900,
            );

            let diagnosis: string;
            let argv: string[] | null = null;
            let giveUp: string | null = null;
            let rejected: string | undefined;
            if (diag.ok) {
              totalTokens += diag.tokens;
              const diagCredits = Math.round((diag.tokens / 1000) * 5) / 100;
              totalCredits += diagCredits;
              await ctx.runMutation(internal.liveWrite.appendUsage, {
                userId, runId, tokens: diag.tokens, credits: diagCredits, at: at(),
              });
              const parsed = extractFixCommand(diag.text);
              diagnosis = parsed.diagnosis;
              argv = parsed.argv;
              giveUp = parsed.giveUp;
              rejected = parsed.rejected;
              // A model that echoes the prompt's placeholders has not named a
              // cause; fall back to the last error line of the real output.
              const echoed = (t: string | null) =>
                !t || /^<.*>$/.test(t.trim()) || /max 30 words|the precise reason|your own words/i.test(t);
              const lastError =
                stdout.split(/\r?\n/).reverse().find((l) => /error|failed|cannot|not found/i.test(l))?.trim() ??
                "see the test output in the evidence ledger";
              if (echoed(diagnosis)) diagnosis = `The suite failed: ${lastError.slice(0, 200)}`;
              if (giveUp !== null && echoed(giveUp)) giveUp = lastError.slice(0, 240);
            } else {
              diagnosis = `Diagnosis call failed: ${diag.error}`;
            }

            // Screen the diagnosis prose too: an unsafe explanation must not
            // be displayed, and it voids any proposed command.
            if (UNSAFE_RE.test(diagnosis)) {
              diagnosis = "Diagnosis discarded (the model returned unsafe instructions).";
              argv = null;
              giveUp = null;
            }

            if (giveUp) {
              wall = giveUp;
              await ctx.runMutation(internal.liveWrite.appendStep, {
                runId, userId, seq: seq++, title: `Fix cycle ${cycleNo}`,
                detail: `${diagnosis} The model named the wall: ${giveUp}`,
                model: diagnoseModel, tokens: diag.ok ? diag.tokens : 0,
                status: "failed", at: at(),
              });
              break;
            }
            if (!argv) {
              wall = `No safe corrective command after cycle ${cycleNo}: ${
                rejected ?? "the model proposed nothing executable"
              }.`;
              await ctx.runMutation(internal.liveWrite.appendStep, {
                runId, userId, seq: seq++, title: `Fix cycle ${cycleNo}`,
                detail: `${diagnosis} ${wall}`,
                model: diagnoseModel, tokens: diag.ok ? diag.tokens : 0,
                status: "failed", at: at(),
              });
              break;
            }

            const fixLine = argv.join(" ");
            commandsUsed.push(fixLine);
            cyclesRun += 1;
            await ctx.runMutation(internal.liveWrite.appendStep, {
              runId, userId, seq: seq++, title: `Fix cycle ${cycleNo}`,
              detail: `${diagnosis} Running: \`${fixLine}\`.`,
              model: diagnoseModel, tokens: diag.ok ? diag.tokens : 0,
              status: "retry", at: at(),
            });
            await ctx.runMutation(internal.liveWrite.patchRun, {
              runId, patch: { status: "fixing", fixAttempts: cyclesRun },
            });

            const cycleRes = await ctx.runAction(internal.runner.execute, {
              repoUrl: run.repoUrl,
              sessionId,
              fixCommands: [argv],
              tests: strategy.tests,
            });
            if (!cycleRes.ok) {
              wall =
                cycleRes.reason === "session_expired"
                  ? `The sandbox session expired after ${cyclesRun} repair cycle(s), before the suite went green.`
                  : `The sandbox runner failed during cycle ${cycleNo} (${cycleRes.reason}): ${cycleRes.detail ?? "no detail"}.`;
              break;
            }

            const fixResults = cycleRes.fixes ?? [];
            const fixOk =
              fixResults.length > 0 && fixResults.every((f) => f.ok && !f.timedOut);
            if (fixResults.length > 0) {
              const lastFix = fixResults[fixResults.length - 1];
              await ctx.runMutation(internal.liveWrite.appendEvidence, {
                runId, userId, seq: evidenceSeq++,
                claim: `Cycle ${cycleNo}: the corrective command completes in the clone.`,
                command: fixLine,
                output: clip(lastFix.output),
                exitCode: lastFix.exitCode,
                verdict: fixOk ? "verified" : "unverified", at: at(),
              });
            }

            const cycleTests = cycleRes.tests ?? [];
            const ran = cycleTests.length > 0;
            const passed = fixOk && ran && cycleTests.every((t) => t.ok && !t.timedOut);
            if (ran) {
              const lastTest = cycleTests[cycleTests.length - 1];
              await ctx.runMutation(internal.liveWrite.appendEvidence, {
                runId, userId, seq: evidenceSeq++,
                claim: `Cycle ${cycleNo}: the declared test suite ${passed ? "passes" : "still fails"} after the corrective command.`,
                command: cycleTests.map((t) => t.command).join("  &&  "),
                output: clip(lastTest.output),
                exitCode: lastTest.exitCode,
                verdict: passed ? "verified" : "unverified", at: at(),
              });
            }

            if (passed) {
              testVerified = true;
              execLine = `Tests passed after ${cyclesRun} repair cycle(s) on the same clone: \`${fixLine}\`.`;
              repair = { state: "green", cycle: cyclesRun, commands: commandsUsed, execLine };
              break;
            }

            stdout = [
              resultLine("last corrective command", fixResults[fixResults.length - 1]),
              ran
                ? resultLine("tests after the corrective command", cycleTests[cycleTests.length - 1])
                : "tests after the corrective command: did not run",
            ].join("\n\n");

            if (!fixOk) {
              wall = `The corrective command exited ${
                fixResults[fixResults.length - 1]?.exitCode ?? "?"
              } in cycle ${cycleNo}, so the suite could not be rerun.`;
              break;
            }
          }
        }
      }

      if (!repair) {
        if (!wall) {
          wall = `Tests still failing after ${cyclesRun} repair cycle(s).`;
        }
        execLine = `Stopped at a wall after ${cyclesRun} repair cycle(s): ${wall}`;
        repair = { state: "wall", cycle: cyclesRun, commands: commandsUsed, execLine, wall };
      }

      // The session is closed either way; the runner also sweeps idle sessions.
      if (sessionId) {
        try {
          await ctx.runAction(internal.runner.execute, {
            repoUrl: run.repoUrl,
            sessionId,
            close: true,
          });
        } catch {
          /* cleanup is best-effort */
        }
      }

      await ctx.runMutation(internal.liveWrite.finishStep, {
        runId, seq: testRunSeq, status: testVerified ? "ok" : "failed",
      });
      await ctx.runMutation(internal.liveWrite.appendStep, {
        runId, userId, seq: seq++, title: "Test result",
        detail: execLine,
        model: NEBIUS_FAST_MODEL, tokens: 0,
        status: testVerified ? "ok" : "failed", at: at(),
      });
    }

    if (!repair) {
      repair = { state: "static", cycle: 0, commands: [], execLine };
    }
    const finalRepair = repair;
    await ctx.runMutation(internal.liveWrite.patchRun, {
      runId,
      patch: { repair: finalRepair, fixAttempts: finalRepair.cycle },
    });

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
          content: `Repo ${meta.full_name}, idle ${daysIdle} days.\nSurvey: ${censusNote}.\nManifest: ${manifestNote}\nProbe results:\n${probeRows
            .map((p) => `[${p.verdict}] ${p.claim} (${p.output})`)
            .join("\n")}\nExecution: ${execLine}\nRepair loop: ${
            finalRepair.state === "green"
              ? `green after ${finalRepair.cycle} repair cycle(s)`
              : finalRepair.state === "wall"
                ? `stopped at a wall after ${finalRepair.cycle} cycle(s): ${finalRepair.wall}`
                : finalRepair.state === "static"
                  ? "not executed in a sandbox; verification stayed static"
                  : finalRepair.state
          }`,
        },        ],
        1200,
      );

    let analysisText = "Analysis unavailable.";
    if (analysisRes.ok) {
      // The model sometimes restates its whole paragraph; keep each sentence once.
      const seen = new Set<string>();
      analysisText = (analysisRes.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [analysisRes.text])
        .map((s) => s.trim())
        .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
        .join(" ");
      if (analysisRes.truncated) {
        analysisText += " (The model hit its token limit and the summary ends here.)";
      }
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
    const verified = probeRows.filter((p) => p.verdict === "verified").length;
    let outcome = verified >= 4 ? "success" : verified >= 2 ? "partial" : "failed";
    // Green tests are the strongest claim in the run: a sandbox that could not
    // get there can never report a clean success, whatever the probes found.
    if (runnerConfigured && !testVerified && finalRepair.state !== "static" && outcome === "success") {
      outcome = "partial";
    }
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
        summary: `Live takeover of ${meta.full_name}. ${verified}/${probeRows.length} deployability claims verified against the real repository. ${execLine} ${analysisText}`,
      },
    });

    return { ok: true as const, verified, total: probeRows.length, outcome };
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
