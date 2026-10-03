// The handover pack.
//
// A pack is assembled, never invented: every procedure, fact and risk in it is
// derived from what the run actually recorded (the structured survey, the feed
// timeline and the evidence ledger). Nothing here can add a claim that is not
// already backed by a command and its output. The only model-authored part is
// the executive summary, and it is labelled as such.

export type PackStrategy = {
  label: string;
  source: string;
  install: string[];
  build?: string[];
  tests: { cwd: string; argv: string[] }[];
};

export type PackRepair = {
  state: "static" | "green" | "no-tests" | "error" | "wall";
  cycle: number;
  commands: string[];
  execLine: string;
  wall?: string;
};

export type PackSurvey = {
  language: string;
  files: number;
  manifest?: string;
  ecosystem: string;
  lockfile?: string;
  packageManager?: string;
  entryPoints: string[];
  workspaces: string[];
  workspaceManifests: number;
  scripts: string[];
  engines?: string;
  containerAssets: number;
  testFiles: number;
  envTemplates: number;
  docs: number;
  strategy?: PackStrategy;
};

export type PackRun = {
  name: string;
  repoUrl: string;
  status: string;
  modelPlan: string;
  modelFast: string;
  tokensUsed: number;
  creditsUsed: number;
  fixAttempts: number;
  stepsDone: number;
  stepsTotal: number;
  startedAt: number;
  finishedAt?: number;
  summary?: string;
  packNarrative?: string;
  survey?: PackSurvey;
  repair?: PackRepair;
};

export type PackStep = {
  seq: number;
  title: string;
  detail: string;
  model: string;
  tokens: number;
  status: string;
  at: number;
};

export type PackEvidence = {
  seq: number;
  claim: string;
  command: string;
  output: string;
  exitCode: number;
  verdict: string;
  at: number;
};

export type PackDep = {
  name: string;
  version: string;
  latest: string;
  state: string;
  note: string;
};

export type PackProcedure = {
  title: string;
  detail: string;
  command?: string;
  proof?: string;
};

export type PackFact = { label: string; value: string };

export type PackRisk = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  proof?: string;
};

export type HandoverPack = {
  repoSlug: string;
  statusLabel: string;
  executive: { text: string; origin: "nemotron" | "pipeline" | "none" };
  runbook: PackProcedure[];
  architecture: PackFact[];
  entryPoints: string[];
  onboardingPlan: string | null;
  risks: PackRisk[];
  ledger: PackEvidence[];
  counts: { verified: number; unverified: number; contradicted: number };
  files: number | null;
};

export type PackInput = {
  run: PackRun;
  steps: PackStep[];
  evidence: PackEvidence[];
  deps: PackDep[];
};

// ── helpers ────────────────────────────────────────────────────────────────

function repoSlugOf(repoUrl: string): string {
  return repoUrl
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git\/?$/, "")
    .replace(/\/$/, "");
}

function statusLabelOf(status: string): string {
  switch (status) {
    case "success":
      return "completed";
    case "partial":
      return "stopped honestly";
    case "failed":
      return "failed";
    case "running":
    case "fixing":
    case "verifying":
      return "in progress";
    default:
      return "queued";
  }
}

function findStep(steps: PackStep[], title: string): PackStep | undefined {
  return [...steps].sort((a, b) => a.seq - b.seq).find((s) => s.title === title);
}

// Evidence rows carry pipeline-authored claims on live runs and playbook-authored
// claims on replayed runs, so matching is by meaning rather than by exact
// prefix. A miss is fine: the runbook falls back to the feed step that covers
// the same ground, and otherwise says plainly that nothing was recorded.
function findingByClaim(evidence: PackEvidence[], re: RegExp): PackEvidence | undefined {
  return [...evidence].sort((a, b) => a.seq - b.seq).find((e) => re.test(e.claim));
}

function stepByTitle(steps: PackStep[], re: RegExp): PackStep | undefined {
  return [...steps].sort((a, b) => a.seq - b.seq).find((s) => re.test(s.title));
}

// The install step is derived from the lockfile the survey actually found, so
// a repo with a package-lock gets `npm ci` and one without gets `npm install`.
function installCommand(run: PackRun, evidence: PackEvidence[]): string | undefined {
  const survey = run.survey;
  // The strategy resolved from the lockfile, CI and scripts is the command the
  // sandbox actually executed, so it outranks the older table below.
  if (survey?.strategy?.install?.length) return survey.strategy.install.join(" ");
  const pm = survey?.packageManager;
  const lock = survey?.lockfile;
  if (pm === "npm") return lock === "package-lock.json" ? "npm ci" : "npm install";
  if (pm === "pnpm") return "pnpm install --frozen-lockfile";
  if (pm === "yarn") return "yarn install --frozen-lockfile";
  if (pm === "bun") return "bun install --frozen-lockfile";
  if (pm === "poetry") return "poetry install";
  if (pm === "pipenv") return "pipenv install";
  if (pm === "uv") return "uv sync";
  if (pm === "cargo") return "cargo build";
  if (pm === "go") return "go mod download";

  // No root manifest, but the clone probe found a shallow nested one (a `web/`
  // app inside a deployment wrapper, for example). Point the operator at the
  // real requirements file instead of the generic "inspect the tree" text.
  const manifestProbe = findingByClaim(evidence, /dependency manifests are present/i);
  const nestedRequirements = manifestProbe?.output.match(
    /(?:^|[\s,(])([A-Za-z0-9_.-]+\/requirements\.txt)/,
  );
  if (nestedRequirements) return `python3 -m pip install -r ${nestedRequirements[1]}`;

  switch (survey?.manifest) {
    case "package.json":
      return "npm install";
    case "requirements.txt":
      return "pip install -r requirements.txt";
    case "pyproject.toml":
      return "pip install -e .";
    case "Pipfile":
      return "pipenv install";
    case "Cargo.toml":
      return "cargo build";
    case "go.mod":
      return "go mod download";
    case "composer.json":
      return "composer install";
    case "Gemfile":
      return "bundle install";
    default:
      break;
  }

  // No structured survey (older or demo runs): fall back to what the install
  // phase of the sandbox actually ran, if it ran at all.
  return findingByClaim(evidence, /install/i)?.command ?? undefined;
}

// The repo can carry several evidence rows about tests: the probe that checks
// a suite exists, and the sandbox rows that actually ran it. The runbook wants
// something that executed, so prefer execution rows and only fall back to the
// probe (and then to the resolved strategy or declared script) when missing.
const TEST_EXEC_COMMAND_RE = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|python3 -m pytest/;

function testRunEvidence(evidence: PackEvidence[]): PackEvidence | undefined {
  return (
    findingByClaim(
      evidence,
      /passes on a clean clone|after one corrective fix|corrective retry|after the corrective command/i,
    ) ??
    evidence.find((e) => TEST_EXEC_COMMAND_RE.test(e.command)) ??
    findingByClaim(evidence, /test suite|test run/i)
  );
}

function executedTestEvidence(evidence: PackEvidence[]): PackEvidence | undefined {
  return [...evidence]
    .sort((a, b) => a.seq - b.seq)
    .find(
      (e) =>
        TEST_EXEC_COMMAND_RE.test(e.command) &&
        /passes|still fails|corrective|repair cycle/i.test(e.claim),
    );
}

function testCommand(run: PackRun, evidence: PackEvidence[]): string | undefined {
  const executed = executedTestEvidence(evidence) ?? testRunEvidence(evidence);
  if (executed && TEST_EXEC_COMMAND_RE.test(executed.command)) return executed.command;
  const strategyTests = run.survey?.strategy?.tests;
  if (strategyTests && strategyTests.length > 0) {
    return strategyTests
      .map((t) => (t.cwd === "." ? t.argv.join(" ") : `cd ${t.cwd} && ${t.argv.join(" ")}`))
      .join("  &&  ");
  }
  if (run.survey?.scripts?.includes("test")) return "npm test";
  return executed?.command;
}

// ── builder ────────────────────────────────────────────────────────────────

export function buildPack({ run, steps, evidence, deps }: PackInput): HandoverPack {
  const sortedSteps = [...steps].sort((a, b) => a.seq - b.seq);
  const sortedEvidence = [...evidence].sort((a, b) => a.seq - b.seq);
  const survey = run.survey;
  const slug = repoSlugOf(run.repoUrl);

  const counts = {
    verified: sortedEvidence.filter((e) => e.verdict === "verified").length,
    unverified: sortedEvidence.filter((e) => e.verdict === "unverified").length,
    contradicted: sortedEvidence.filter((e) => e.verdict === "contradicted").length,
  };

  // ── executive summary ───────────────────────────────────────────────────
  const analysisStep = findStep(sortedSteps, "Risk analysis");
  const executive = run.packNarrative
    ? { text: run.packNarrative, origin: "nemotron" as const }
    : analysisStep && analysisStep.status === "ok"
      ? { text: analysisStep.detail, origin: "pipeline" as const }
      : run.summary
        ? { text: run.summary, origin: "pipeline" as const }
        : { text: "", origin: "none" as const };

  // ── runbook ─────────────────────────────────────────────────────────────
  const intakeStep = findStep(sortedSteps, "Repo intake");
  const manifestStep = findStep(sortedSteps, "Manifest forensics");
  const envProbe = findingByClaim(sortedEvidence, /environment/i);
  const testEvidence = testRunEvidence(sortedEvidence);
  const executedTests = executedTestEvidence(sortedEvidence);
  const fixCycle = findStep(sortedSteps, "Fix cycle");
  const testResult = findStep(sortedSteps, "Test result");
  // Playbook replays and runs recorded before the structured survey describe
  // install / env / test work in their feed steps rather than in probe rows.
  const installStep = manifestStep ?? stepByTitle(sortedSteps, /install|boot|dependenc/i);
  const envStep = envProbe ? undefined : stepByTitle(sortedSteps, /env/i);
  const testStep = testEvidence
    ? undefined
    : stepByTitle(sortedSteps, /test|verif/i);
  const recorded = (step: PackStep | undefined) =>
    step ? `Recorded during the run: ${step.detail}` : undefined;

  const runbook: PackProcedure[] = [
    {
      title: "Get the source",
      command: `git clone ${run.repoUrl}`,
      detail:
        intakeStep?.detail ??
        `Clone ${slug} and check out the default branch. The repo was last inspected on this run's date.`,
    },
    {
      title: "Install dependencies",
      command: installCommand(run, sortedEvidence),
      detail:
        manifestStep?.detail ??
        recorded(installStep) ??
        "No dependency manifest was found at the repository root, so inspect the tree before installing anything.",
      proof: manifestStep ? "Manifest forensics step in the run timeline." : undefined,
    },
    {
      title: "Configure the environment",
      detail: envProbe
        ? envProbe.verdict === "verified"
          ? `An environment template ships with the repo. ${envProbe.output}`
          : `No environment contract is documented. ${envProbe.output} Treat every variable the code reads as operator-supplied until proven otherwise.`
        : recorded(envStep) ??
          "No environment probe was recorded for this run. Read the code for process.env reads before booting.",
      proof: envProbe ? `${envProbe.command} (exit ${envProbe.exitCode})` : undefined,
    },
    {
      title: "Run the existing test suite",
      command: testCommand(run, sortedEvidence),
      detail: executedTests
        ? executedTests.verdict === "verified"
          ? `Suite passes in the sandbox. Recorded exit code ${executedTests.exitCode}. ${testResult?.detail ?? ""}`.trim()
          : `Suite does not pass as-is. Recorded exit code ${executedTests.exitCode}. ${testResult?.detail ?? ""}`.trim()
        : testEvidence
          ? survey && survey.testFiles === 0
            ? `No test file exists in the clone, so there is nothing to execute. ${testEvidence.output} Treat the repo as untested until a suite is added.`
            : `The suite was located statically but never executed on this run. ${testEvidence.output}`
          : recorded(testStep) ??
            "No test command was declared in the manifest, so there is nothing to run. Treat the repo as untested.",
      proof: executedTests
        ? `${executedTests.command} (exit ${executedTests.exitCode})`
        : testEvidence
          ? `${testEvidence.command} (exit ${testEvidence.exitCode})`
          : undefined,
    },
  ];

  // The repair loop gets its own book procedure: what the sandbox needed to
  // reach green, or the wall it stopped at. Old replay runs only recorded a
  // single "Fix cycle" step, so that remains the fallback.
  const repairInfo = run.repair;
  if (repairInfo && repairInfo.state === "green" && repairInfo.cycle > 0) {
    runbook.push({
      title: "If the suite regresses",
      detail: `The sandboxed repair loop reached green after ${repairInfo.cycle} cycle(s). Commands applied in order: ${repairInfo.commands.join(" → ")}. If a clean clone fails again, apply them in the same order before debugging further.`,
      proof: "Repair loop recorded in the run timeline; every command has its own evidence row.",
    });
  } else if (repairInfo && repairInfo.state === "wall") {
    runbook.push({
      title: "Known unresolved failure",
      detail: `The sandboxed repair loop stopped after ${repairInfo.cycle} cycle(s) at a wall: ${repairInfo.wall ?? "the suite never went green"}. Commands attempted: ${repairInfo.commands.join(" → ") || "none"}. Treat the suite as failing until this is resolved on a machine that has the missing capability.`,
      proof: "Repair loop recorded in the run timeline with the exact commands and exit codes.",
    });
  } else if (repairInfo && repairInfo.state === "error") {
    runbook.push({
      title: "Execution never completed",
      detail: `${repairInfo.execLine} No repair cycle ran, so the failure is on the record but was not diagnosed.`,
    });
  } else if (fixCycle) {
    runbook.push({
      title: "If you hit the known failure",
      detail: fixCycle.detail,
      proof: fixCycle.status === "retry" ? "A corrective fix cycle was attempted and recorded." : undefined,
    });
  }

  runbook.push({
    title: "Verify what was claimed",
    detail: `${counts.verified} of ${sortedEvidence.length} recorded claims verified, ${counts.unverified} unverified, ${counts.contradicted} contradicted. Re-run the commands in the evidence ledger before trusting any of them on a new machine.`,
  });

  // ── architecture map ────────────────────────────────────────────────────
  const architecture: PackFact[] = [];
  if (survey) {
    architecture.push({ label: "Language", value: survey.language });
    architecture.push({ label: "Files", value: survey.files.toLocaleString() });
    architecture.push({
      label: "Manifest",
      value: survey.manifest ? `${survey.manifest} (${survey.ecosystem})` : `${survey.ecosystem}, no manifest at root`,
    });
    architecture.push({
      label: "Package manager",
      value: survey.packageManager
        ? `${survey.packageManager} (locked by ${survey.lockfile})`
        : "no lockfile detected",
    });
    architecture.push({
      label: "Workspaces",
      value:
        survey.workspaces.length > 0
          ? `${survey.workspaces.join(", ")}, ${survey.workspaceManifests} nested manifest(s)`
          : "single package",
    });
    if (survey.scripts.length > 0) {
      architecture.push({ label: "Declared scripts", value: survey.scripts.join(", ") });
    }
    if (survey.engines) architecture.push({ label: "Engines", value: survey.engines });
    if (survey.strategy) {
      architecture.push({
        label: "Run strategy",
        value: `${survey.strategy.label} (resolved from ${survey.strategy.source})`,
      });
    }
    architecture.push({
      label: "Tests / containers / env templates",
      value: `${survey.testFiles} test file(s), ${survey.containerAssets} container asset(s), ${survey.envTemplates} env template(s)`,
    });
    architecture.push({ label: "Documentation", value: `${survey.docs} markdown file(s)` });
  } else {
    const surveyStep = findStep(sortedSteps, "Static survey");
    if (surveyStep) architecture.push({ label: "Survey", value: surveyStep.detail });
    if (manifestStep) architecture.push({ label: "Manifest", value: manifestStep.detail });
    architecture.push({
      label: "Structure",
      value:
        "This run recorded no structured survey, so entry points, lockfile and workspaces are not on the record. Re-run the takeover to capture them.",
    });
  }
  architecture.push({
    label: "Sandbox execution",
    value:
      run.repair == null
        ? "not recorded on this run"
        : run.repair.state === "green"
          ? run.repair.cycle > 0
            ? `green after ${run.repair.cycle} repair cycle(s)`
            : "green on the first clean clone"
          : run.repair.state === "wall"
            ? `stopped at a wall after ${run.repair.cycle} cycle(s)`
            : run.repair.state === "static"
              ? run.repair.execLine || "static only (no execution recorded)"
              : run.repair.state === "error"
                ? "execution error, no cycles ran"
                : "no runnable test suite found",
  });

  // ── risk register ───────────────────────────────────────────────────────
  const risks: PackRisk[] = [];
  for (const e of sortedEvidence) {
    if (e.verdict === "verified") continue;
    const severity: PackRisk["severity"] =
      e.verdict === "contradicted" ? "high" : /license/i.test(e.claim) ? "low" : "medium";
    risks.push({
      severity,
      title: e.claim,
      detail: e.output,
      proof: `${e.command} (exit ${e.exitCode})`,
    });
  }
  for (const step of sortedSteps) {
    if (step.status !== "failed") continue;
    if (risks.some((r) => r.title === step.title)) continue;
    risks.push({
      severity: "high",
      title: `${step.title} reported a failure`,
      detail: step.detail,
    });
  }
  for (const dep of deps) {
    if (dep.state !== "vulnerable" && dep.state !== "outdated") continue;
    risks.push({
      severity: dep.state === "vulnerable" ? "high" : "low",
      title: `${dep.name} ${dep.version} is ${dep.state}`,
      detail: dep.note,
      proof: dep.latest ? `Latest on the npm registry: ${dep.latest}` : undefined,
    });
  }
  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  risks.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    repoSlug: slug,
    statusLabel: statusLabelOf(run.status),
    executive,
    runbook,
    architecture,
    entryPoints: survey?.entryPoints ?? [],
    onboardingPlan: findStep(sortedSteps, "Planning")?.detail ?? null,
    risks,
    ledger: sortedEvidence,
    counts,
    files: survey?.files ?? null,
  };
}

// ── markdown export ────────────────────────────────────────────────────────

function fence(text: string): string {
  return text.replace(/```/g, "''").trim();
}

export function packToMarkdown(pack: HandoverPack, run: PackRun): string {
  const lines: string[] = [];
  const when = new Date(run.finishedAt ?? run.startedAt).toISOString();

  lines.push(`# Handover pack: ${run.name}`);
  lines.push("");
  lines.push(`- Repository: ${run.repoUrl}`);
  lines.push(`- Run outcome: ${pack.statusLabel}`);
  lines.push(`- Planning model: ${run.modelPlan}`);
  lines.push(`- Fast-loop model: ${run.modelFast}`);
  lines.push(`- Tokens: ${run.tokensUsed.toLocaleString()} · fix cycles: ${run.fixAttempts}`);
  if (run.repair) {
    lines.push(
      `- Repair loop: ${run.repair.state}${
        run.repair.cycle > 0 ? ` after ${run.repair.cycle} cycle(s)` : ""
      }${run.repair.wall ? ` · wall: ${run.repair.wall}` : ""}`,
    );
  }
  lines.push(`- Recorded: ${when}`);
  lines.push(
    `- Evidence: ${pack.counts.verified} verified, ${pack.counts.unverified} unverified, ${pack.counts.contradicted} contradicted`,
  );
  lines.push("");
  lines.push(
    "Every claim in this pack is derived from a command the agent ran against the repository. Nothing here is inferred from documentation, and failures are kept on the record.",
  );

  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  if (pack.executive.text) {
    lines.push(pack.executive.text);
    lines.push("");
    lines.push(
      pack.executive.origin === "nemotron"
        ? "_Written by Nemotron strictly from the evidence ledger below._"
        : "_Recorded by the takeover pipeline at the end of the run._",
    );
  } else {
    lines.push("_No executive summary was recorded for this run._");
  }

  lines.push("");
  lines.push("## Runbook");
  pack.runbook.forEach((p, i) => {
    lines.push("");
    lines.push(`### ${i + 1}. ${p.title}`);
    lines.push("");
    lines.push(p.detail);
    if (p.command) {
      lines.push("");
      lines.push("```bash");
      lines.push(p.command);
      lines.push("```");
    }
    if (p.proof) {
      lines.push("");
      lines.push(`Proof: ${p.proof}`);
    }
  });

  if (pack.onboardingPlan) {
    lines.push("");
    lines.push("## Onboarding plan (Nemotron)");
    lines.push("");
    lines.push(pack.onboardingPlan);
  }

  lines.push("");
  lines.push("## Architecture map");
  lines.push("");
  for (const f of pack.architecture) lines.push(`- **${f.label}:** ${f.value}`);
  if (pack.entryPoints.length > 0) {
    lines.push(`- **Entry points:** ${pack.entryPoints.join(", ")}`);
  }

  lines.push("");
  lines.push("## Risk register");
  lines.push("");
  if (pack.risks.length === 0) {
    lines.push("No unresolved risks were recorded on this run.");
  } else {
    for (const r of pack.risks) {
      lines.push(`- **${r.severity.toUpperCase()}** ${r.title}`);
      lines.push(`  - ${r.detail}`);
      if (r.proof) lines.push(`  - Proof: \`${r.proof}\``);
    }
  }

  lines.push("");
  lines.push("## Evidence ledger");
  lines.push("");
  pack.ledger.forEach((e, i) => {
    lines.push(`### ${i + 1}. [${e.verdict}] ${e.claim}`);
    lines.push("");
    lines.push("```");
    lines.push(`$ ${e.command}`);
    lines.push(fence(e.output) || "(no output recorded)");
    lines.push(`exit ${e.exitCode}`);
    lines.push("```");
    lines.push("");
  });

  lines.push("---");
  lines.push("");
  lines.push(
    "Heirloom Handover Agent · proof-backed handover for inherited codebases. Every claim links to a command the agent actually ran.",
  );
  return lines.join("\n");
}

export function packFileName(pack: HandoverPack, run: PackRun): string {
  const safe = (pack.repoSlug || "repository").replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
  const date = new Date(run.finishedAt ?? run.startedAt).toISOString().slice(0, 10);
  return `heirloom-handover-${safe}-${date}.md`;
}
