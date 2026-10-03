import { describe, expect, it } from "vitest";
import { buildPack, packToMarkdown, type PackInput } from "./pack";

function baseInput(overrides: Partial<PackInput> = {}): PackInput {
  const run = {
    name: "Live takeover of acme/widget",
    repoUrl: "https://github.com/acme/widget",
    status: "success",
    modelPlan: "nvidia/Nemotron-3-Ultra-550b-a55b",
    modelFast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    tokensUsed: 1234,
    creditsUsed: 0.5,
    fixAttempts: 0,
    stepsDone: 10,
    stepsTotal: 10,
    startedAt: Date.UTC(2026, 9, 2),
    finishedAt: Date.UTC(2026, 9, 2, 1),
    summary: "Summary.",
    survey: {
      language: "JavaScript/TypeScript",
      files: 42,
      manifest: "package.json",
      ecosystem: "Node.js",
      lockfile: "pnpm-lock.yaml",
      packageManager: "pnpm",
      entryPoints: ["index.js"],
      workspaces: [],
      workspaceManifests: 0,
      scripts: ["test", "build"],
      containerAssets: 0,
      testFiles: 2,
      envTemplates: 0,
      docs: 3,
      strategy: {
        label: "pnpm install --frozen-lockfile → pnpm run test",
        source: "pnpm-lock.yaml",
        install: ["pnpm", "install", "--frozen-lockfile"],
        tests: [{ cwd: ".", argv: ["pnpm", "run", "test"] }],
      },
    },
    ...overrides.run,
  };
  const steps = overrides.steps ?? [
    {
      seq: 6,
      title: "Deployability probes",
      detail: "6 of 7 claims verified.",
      model: "m",
      tokens: 0,
      status: "ok",
      at: 0,
    },
    {
      seq: 7,
      title: "Fix cycle 1",
      detail: "Retrying.",
      model: "m",
      tokens: 0,
      status: "retry",
      at: 0,
    },
  ];
  const evidence = overrides.evidence ?? [
    {
      seq: 0,
      claim: "A clean clone of the repository succeeds.",
      command: "git clone --depth 1 --quiet https://github.com/acme/widget repo",
      output: "done",
      exitCode: 0,
      verdict: "verified",
      at: 0,
    },
    {
      seq: 1,
      claim: "The declared test suite passes on a clean clone.",
      command: "pnpm run test",
      output: "3 passing",
      exitCode: 0,
      verdict: "verified",
      at: 0,
    },
    {
      seq: 2,
      claim: "The repository has an open-source license on file.",
      command: "git ls-files '*LICENSE*'",
      output: "No license file in the clone.",
      exitCode: 1,
      verdict: "unverified",
      at: 0,
    },
  ];
  return {
    run,
    steps,
    evidence,
    deps: overrides.deps ?? [],
  };
}

describe("buildPack", () => {
  it("prefers the resolved strategy for the install command and shows it", () => {
    const pack = buildPack(baseInput());
    const install = pack.runbook.find((p) => p.title === "Install dependencies");
    expect(install?.command).toBe("pnpm install --frozen-lockfile");
    expect(pack.architecture.find((f) => f.label === "Run strategy")?.value).toContain(
      "pnpm install --frozen-lockfile",
    );
  });

  it("counts verdicts including contradicted", () => {
    const input = baseInput();
    input.evidence.push({
      seq: 99,
      claim: "The repository ships a runnable test suite.",
      command: "git ls-files '*test*'",
      output: "none",
      exitCode: 1,
      verdict: "contradicted",
      at: 0,
    });
    const pack = buildPack(input);
    expect(pack.counts).toEqual({ verified: 2, unverified: 1, contradicted: 1 });
  });

  it("describes a green repair loop with its commands", () => {
    const input = baseInput({
      run: {
        ...baseInput().run,
        fixAttempts: 2,
        repair: {
          state: "green",
          cycle: 2,
          commands: ["pnpm install --frozen-lockfile", "npm install --save-dev mocha"],
          execLine: "Tests passed after 2 repair cycle(s).",
        },
      },
    });
    const pack = buildPack(input);
    const regression = pack.runbook.find((p) => p.title === "If the suite regresses");
    expect(regression?.detail).toContain("green after 2 cycle(s)");
    expect(regression?.detail).toContain("npm install --save-dev mocha");
    expect(
      pack.architecture.find((f) => f.label === "Sandbox execution")?.value,
    ).toBe("green after 2 repair cycle(s)");
  });

  it("renders a wall as a known unresolved failure and never a success claim", () => {
    const input = baseInput({
      run: {
        ...baseInput().run,
        status: "partial",
        repair: {
          state: "wall",
          cycle: 3,
          commands: ["npm install --save-dev mocha"],
          execLine: "Stopped at a wall after 3 repair cycle(s): missing private registry.",
          wall: "missing private registry credential",
        },
      },
    });
    const pack = buildPack(input);
    expect(pack.statusLabel).toBe("stopped honestly");
    const wall = pack.runbook.find((p) => p.title === "Known unresolved failure");
    expect(wall?.detail).toContain("missing private registry credential");
    expect(wall?.detail).toContain("Treat the suite as failing");
  });

  it("does not call a statically located suite a passing suite", () => {
    const input = baseInput({
      evidence: [
        {
          seq: 0,
          claim: "The repository ships a runnable test suite.",
          command: "git ls-files '*test*' '*spec*'",
          output: "2 convention test file(s) in the clone.",
          exitCode: 0,
          verdict: "verified",
          at: 0,
        },
      ],
      run: {
        ...baseInput().run,
        repair: {
          state: "static",
          cycle: 0,
          commands: [],
          execLine: "Sandbox runner not configured; verification stayed static.",
        },
      },
    });
    const pack = buildPack(input);
    const tests = pack.runbook.find((p) => p.title === "Run the existing test suite");
    expect(tests?.detail).toContain("never executed on this run");
    expect(tests?.command).toBe("pnpm run test");
  });

  it("does not claim a suite was located when the clone has no test files", () => {
    const base = baseInput();
    const input = baseInput({
      run: {
        ...base.run,
        survey: { ...base.run.survey!, testFiles: 0 },
        repair: {
          state: "static",
          cycle: 0,
          commands: [],
          execLine:
            "The repository declares no root dependency manifest and no runnable test strategy, so the sandbox stayed unused and verification is static.",
        },
      },
      evidence: [
        {
          seq: 0,
          claim: "The repository ships a runnable test suite.",
          command: "git ls-files '*test*' '*spec*'",
          output: "No path in the clone contains test/spec in its name.",
          exitCode: 1,
          verdict: "unverified",
          at: 0,
        },
      ],
    });
    const pack = buildPack(input);
    const tests = pack.runbook.find((p) => p.title === "Run the existing test suite");
    expect(tests?.detail).toContain("No test file exists in the clone");
    expect(tests?.detail).not.toContain("located statically");
  });

  it("reports a runner-attached static run without claiming no runner is attached", () => {
    const base = baseInput();
    const input = baseInput({
      run: {
        ...base.run,
        repair: {
          state: "static",
          cycle: 0,
          commands: [],
          execLine:
            "The repository declares no root dependency manifest and no runnable test strategy, so the sandbox stayed unused and verification is static. Nested manifests exist in the tree: web/requirements.txt.",
        },
      },
    });
    const pack = buildPack(input);
    const fact = pack.architecture.find((f) => f.label === "Sandbox execution")?.value;
    expect(fact).toContain("no root dependency manifest");
    expect(fact).not.toContain("no sandbox runner attached");
  });

  it("points the install step at a shallow nested requirements file when there is no root manifest", () => {
    const base = baseInput();
    const input = baseInput({
      run: {
        ...base.run,
        survey: {
          ...base.run.survey!,
          manifest: undefined,
          ecosystem: "none detected",
          packageManager: undefined,
          lockfile: undefined,
          strategy: undefined,
        },
      },
      evidence: [
        {
          seq: 1,
          claim: "Dependency manifests are present in the clone.",
          command: "git ls-files '*requirements*.txt'",
          output: "0 root manifest(s); 1 nested manifest(s): web/requirements.txt.",
          exitCode: 0,
          verdict: "verified",
          at: 0,
        },
      ],
    });
    const pack = buildPack(input);
    const install = pack.runbook.find((p) => p.title === "Install dependencies");
    expect(install?.command).toBe("python3 -m pip install -r web/requirements.txt");
  });

  it("does not invent an install command from deep nested paths", () => {
    const base = baseInput();
    const input = baseInput({
      run: {
        ...base.run,
        survey: {
          ...base.run.survey!,
          manifest: undefined,
          ecosystem: "none detected",
          packageManager: undefined,
          lockfile: undefined,
          strategy: undefined,
        },
      },
      evidence: [
        {
          seq: 1,
          claim: "Dependency manifests are present in the clone.",
          command: "git ls-files '*requirements*.txt'",
          output:
            "0 root manifest(s); 1 nested manifest(s): .claude/skills/ui-styling/scripts/requirements.txt.",
          exitCode: 0,
          verdict: "verified",
          at: 0,
        },
      ],
    });
    const pack = buildPack(input);
    const install = pack.runbook.find((p) => p.title === "Install dependencies");
    expect(install?.command).toBeUndefined();
  });

  it("exports a markdown pack with the repair state", () => {
    const input = baseInput({
      run: {
        ...baseInput().run,
        repair: {
          state: "wall",
          cycle: 1,
          commands: [],
          execLine: "Stopped at a wall.",
          wall: "node 18 missing",
        },
      },
    });
    const md = packToMarkdown(buildPack(input), input.run);
    expect(md).toContain("Repair loop: wall after 1 cycle(s)");
    expect(md).toContain("wall: node 18 missing");
    expect(md).toContain("## Evidence ledger");
  });
});
