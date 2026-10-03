// Run strategy resolution.
//
// A handover that executes the repo must run it the way the repo's own
// toolchain expects: the lockfile decides the package manager, CI decides the
// real commands for monorepos, and package.json scripts are the last resort.
// Everything here is pure so it can be unit-tested without a network; the
// caller feeds in facts already collected by the survey.

import { validateCommandArgv, tokenizeCommand } from "./fixCommand";

export type TestJob = { cwd: string; argv: string[] };

export type NodeFacts = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[];
  packageManager?: string;
};

export type StrategyInput = {
  ecosystem: string;
  lockfile?: string;
  pkg?: NodeFacts | null;
  /** Executable `run:` lines lifted from CI workflows, in file order. */
  ciRuns?: string[];
  /** Workflow path the commands came from, e.g. ".github/workflows/ci.yml". */
  ciSource?: string;
  testFiles: number;
  workspaceManifests: number;
  manifestText?: string;
};

export type RunStrategy = {
  label: string;
  source: string;
  install: string[];
  build?: string[];
  tests: TestJob[];
};

type Manager = "npm" | "pnpm" | "yarn" | "bun";

const LOCKFILE_MANAGERS: Record<string, Manager> = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
};

const RUNNER_ARGS: Record<string, string[]> = {
  vitest: ["npx", "vitest", "run"],
  jest: ["npx", "jest", "--ci"],
  mocha: ["npx", "mocha"],
  ava: ["npx", "ava"],
  jasmine: ["npx", "jasmine"],
};

function isDefaultTestScript(script: string): boolean {
  return /no test specified/i.test(script) || /^\s*echo\s+.*exit 1/i.test(script);
}

function managerOf(input: StrategyInput): { manager: Manager; declared?: string } {
  const declared = (input.pkg?.packageManager ?? "").trim();
  const declaredName = declared.split("@")[0] as Manager;
  if (["npm", "pnpm", "yarn", "bun"].includes(declaredName)) {
    return { manager: declaredName, declared };
  }
  const fromLock = input.lockfile ? LOCKFILE_MANAGERS[input.lockfile] : undefined;
  if (fromLock) return { manager: fromLock, declared };
  return { manager: "npm", declared };
}

function installFor(manager: Manager, input: StrategyInput, declared?: string): string[] {
  switch (manager) {
    case "pnpm":
      return input.lockfile === "pnpm-lock.yaml"
        ? ["pnpm", "install", "--frozen-lockfile"]
        : ["pnpm", "install"];
    case "yarn": {
      const major = Number(declared?.split("@")[1]?.split(".")[0] ?? "1");
      return major >= 2
        ? ["yarn", "install", "--immutable"]
        : ["yarn", "install", "--frozen-lockfile"];
    }
    case "bun":
      return ["bun", "install", "--frozen-lockfile"];
    default:
      return input.lockfile === "package-lock.json" || input.lockfile === "npm-shrinkwrap.json"
        ? ["npm", "ci", "--no-audit", "--no-fund"]
        : ["npm", "install", "--no-audit", "--no-fund"];
  }
}

function runScript(manager: Manager, script: string): string[] {
  return manager === "bun" ? ["bun", "run", script] : [manager, "run", script];
}

function workspaceTest(manager: Manager, declared?: string): string[] {
  const major = Number(declared?.split("@")[1]?.split(".")[0] ?? "1");
  switch (manager) {
    case "pnpm":
      return ["pnpm", "-r", "test"];
    case "bun":
      return ["bun", "run", "--filter", "*", "test"];
    case "yarn":
      return major >= 2
        ? ["yarn", "workspaces", "foreach", "run", "test"]
        : ["yarn", "workspaces", "run", "test"];
    default:
      return ["npm", "run", "test", "--workspaces", "--if-present"];
  }
}

// Lifts executable commands out of a GitHub Actions workflow: single-line
// `run:` values and the lines of indented block scalars. Flags are carried
// over so monorepo invocations like `pnpm -r test` survive.
export function ciCommandsFrom(workflow: string): string[] {
  const lines = workflow.split(/\r?\n/);
  const commands: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*-?\s*run:\s*(.*)$/);
    if (!match) continue;
    const value = match[1].trim();
    if (value === "|" || value === ">" || value === "|-" || value === ">-") {
      const indent = (line.match(/^\s*/)?.[0].length ?? 0) + 2;
      for (let j = i + 1; j < lines.length; j++) {
        const block = lines[j];
        if (!block.trim()) continue;
        const blockIndent = block.match(/^\s*/)?.[0].length ?? 0;
        if (blockIndent < indent) break;
        commands.push(block.trim().replace(/^-\s*/, ""));
      }
      continue;
    }
    if (value && !value.includes("${{")) commands.push(value.replace(/^["']|["']$/g, ""));
  }
  return commands;
}

function kindOf(argv: string[]): "install" | "test" | "build" | null {
  const tokens = argv.map((t) => t.toLowerCase());
  const words = tokens.filter((t) => !t.startsWith("-"));
  const exe = words[0] ?? "";
  const isPkgManager = ["npm", "pnpm", "yarn", "bun"].includes(exe);
  const has = (w: string) => words.includes(w);
  if (exe === "python3" && has("pip") && has("install")) return "install";
  if ((exe === "python3" && has("pytest")) || words.includes("pytest")) return "test";
  if (isPkgManager && !words.some((w) => w === "run" || w === "run-script")) {
    if (words.some((w) => ["ci", "install", "i"].includes(w))) return "install";
  }
  if (words.some((w) => ["mocha", "jest", "vitest", "ava", "jasmine", "pytest"].includes(w))) {
    return "test";
  }
  if (words.some((w) => w === "test" || w.startsWith("test:"))) return "test";
  if (words.some((w) => w === "build" || w.startsWith("build:"))) return "build";
  return null;
}

function acceptable(argv: string[] | null): argv is string[] {
  return argv !== null && validateCommandArgv(argv).ok;
}

function resolveNode(input: StrategyInput): RunStrategy | null {
  const { manager, declared } = managerOf(input);
  const scripts = input.pkg?.scripts ?? {};
  const devDeps = input.pkg?.devDependencies ?? {};

  const ciInstall = (input.ciRuns ?? [])
    .map((line) => tokenizeCommand(line))
    .find((argv) => acceptable(argv) && kindOf(argv) === "install");
  const ciTest = (input.ciRuns ?? [])
    .map((line) => tokenizeCommand(line))
    .find((argv) => acceptable(argv) && kindOf(argv) === "test");
  const ciBuild = (input.ciRuns ?? [])
    .map((line) => tokenizeCommand(line))
    .find((argv) => acceptable(argv) && kindOf(argv) === "build");

  const install = ciInstall ? ciInstall : installFor(manager, input, declared);
  const installSource = ciInstall
    ? `${input.ciSource ?? "CI workflow"} (install)`
    : input.lockfile ?? `${manager} default`;

  let build: string[] | undefined = ciBuild ?? undefined;
  if (!build && typeof scripts.build === "string" && scripts.build.trim()) {
    build = runScript(manager, "build");
  }

  let tests: string[] | null = ciTest ?? null;
  let testSource = ciTest ? `${input.ciSource ?? "CI workflow"} (tests)` : "package.json scripts";
  if (!tests) {
    const testScript = scripts.test;
    if (typeof testScript === "string" && testScript.trim() && !isDefaultTestScript(testScript)) {
      tests = runScript(manager, "test");
    } else if ((input.pkg?.workspaces?.length ?? 0) > 0 && input.workspaceManifests > 1) {
      tests = workspaceTest(manager, declared);
      testSource = "workspace layout";
    } else {
      const runner = Object.keys(RUNNER_ARGS).find((name) => name in devDeps);
      if (runner && input.testFiles > 0) {
        tests = RUNNER_ARGS[runner];
        testSource = `devDependencies (${runner})`;
      }
    }
  }

  if (!tests) return null;
  const source = ciTest
    ? installSource === testSource
      ? testSource
      : `${installSource} + ${testSource}`
    : installSource === "package.json scripts"
      ? testSource
      : `${installSource} + ${testSource}`;

  const label = [install.join(" "), build?.join(" "), tests.join(" ")]
    .filter(Boolean)
    .join(" → ");
  return {
    label: label.length > 140 ? `${label.slice(0, 137)}…` : label,
    source,
    install,
    ...(build ? { build } : {}),
    tests: [{ cwd: ".", argv: tests }],
  };
}

function resolvePython(input: StrategyInput): RunStrategy | null {
  const text = input.manifestText ?? "";
  const hasPytestHint = /pytest/.test(text) || input.testFiles > 0;
  if (!hasPytestHint) return null;

  const install: string[] = [];
  if (input.lockfile === "requirements.txt" || /requirements\.txt$/m.test(text)) {
    install.push("python3", "-m", "pip", "install", "-r", "requirements.txt");
  } else if (/\[tool\.poetry\]/.test(text)) {
    // The runner image does not ship poetry; pytest is preinstalled, so the
    // suite still runs even though the editable install is skipped.
    install.length = 0;
  }
  const tests = ["python3", "-m", "pytest", "-q"];
  const label = [install.length ? install.join(" ") : null, tests.join(" ")]
    .filter(Boolean)
    .join(" → ");
  return {
    label,
    source: input.lockfile === "requirements.txt" ? "requirements.txt" : "Python project layout",
    install: install.length ? install : ["python3", "-m", "pip", "install", "--upgrade", "pytest"],
    tests: [{ cwd: ".", argv: tests }],
  };
}

export function resolveStrategy(input: StrategyInput): RunStrategy | null {
  const strategy =
    input.ecosystem === "Node.js"
      ? resolveNode(input)
      : input.ecosystem === "Python"
        ? resolvePython(input)
        : null;
  if (!strategy) return null;
  // Defense in depth: the runner re-validates, but a strategy we would not be
  // allowed to execute must never leave the pipeline.
  if (!validateCommandArgv(strategy.install).ok) return null;
  if (strategy.build && !validateCommandArgv(strategy.build).ok) return null;
  if (strategy.tests.some((t) => !validateCommandArgv(t.argv).ok)) return null;
  return strategy;
}
