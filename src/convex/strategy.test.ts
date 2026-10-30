import { describe, expect, it } from "vitest";
import { validateCommandArgv } from "./fixCommand";
import { ciCommandsFrom, resolveStrategy } from "./strategy";

describe("resolveStrategy (Node.js)", () => {
  it("uses npm ci when a package-lock is present", () => {
    const s = resolveStrategy({
      ecosystem: "Node.js",
      lockfile: "package-lock.json",
      pkg: { scripts: { test: "mocha" } },
      testFiles: 1,
      workspaceManifests: 0,
    });
    expect(s?.install).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    expect(s?.tests[0].argv).toEqual(["npm", "run", "test"]);
    expect(s?.source).toContain("package-lock.json");
  });

  it("follows the lockfile's package manager", () => {
    const s = resolveStrategy({
      ecosystem: "Node.js",
      lockfile: "pnpm-lock.yaml",
      pkg: { scripts: { test: "vitest run" } },
      testFiles: 2,
      workspaceManifests: 3,
    });
    expect(s?.install).toEqual(["pnpm", "install", "--frozen-lockfile"]);
    expect(s?.tests[0].argv).toEqual(["pnpm", "run", "test"]);
  });

  it("lets the packageManager field override the lockfile", () => {
    const s = resolveStrategy({
      ecosystem: "Node.js",
      lockfile: "package-lock.json",
      pkg: { packageManager: "yarn@4.1.0", scripts: { test: "jest" } },
      testFiles: 1,
      workspaceManifests: 0,
    });
    expect(s?.install).toEqual(["yarn", "install", "--immutable"]);
    expect(s?.tests[0].argv).toEqual(["yarn", "run", "test"]);
  });

  it("prefers executable CI commands, including monorepo invocations", () => {
    const workflow = [
      "jobs:",
      "  test:",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - run: pnpm install --frozen-lockfile",
      "      - run: pnpm -r test",
      "      - run: |",
      "          pnpm -r build",
      "          pnpm lint",
    ].join("\n");
    const runs = ciCommandsFrom(workflow);
    expect(runs).toContain("pnpm -r test");
    expect(runs).toContain("pnpm -r build");

    const s = resolveStrategy({
      ecosystem: "Node.js",
      lockfile: "pnpm-lock.yaml",
      pkg: { scripts: { test: "vitest run" } },
      ciRuns: runs,
      ciSource: ".github/workflows/ci.yml",
      testFiles: 2,
      workspaceManifests: 5,
    });
    expect(s?.install).toEqual(["pnpm", "install", "--frozen-lockfile"]);
    expect(s?.tests[0].argv).toEqual(["pnpm", "-r", "test"]);
    expect(s?.build).toEqual(["pnpm", "-r", "build"]);
    expect(s?.source).toContain(".github/workflows/ci.yml");
  });

  it("falls back to workspace-wide test when there is no root script", () => {
    const s = resolveStrategy({
      ecosystem: "Node.js",
      lockfile: "package-lock.json",
      pkg: { workspaces: ["packages/*"] },
      testFiles: 0,
      workspaceManifests: 4,
    });
    expect(s?.tests[0].argv).toEqual(["npm", "run", "test", "--workspaces", "--if-present"]);
    expect(s?.source).toContain("workspace");
  });

  it("detects a test runner from devDependencies when the script is the npm stub", () => {
    const s = resolveStrategy({
      ecosystem: "Node.js",
      lockfile: "package-lock.json",
      pkg: {
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
        devDependencies: { mocha: "^10.0.0" },
      },
      testFiles: 3,
      workspaceManifests: 0,
    });
    expect(s?.tests[0].argv).toEqual(["npx", "mocha"]);
    expect(s?.source).toContain("mocha");
  });

  it("returns null when nothing runnable can be resolved", () => {
    const s = resolveStrategy({
      ecosystem: "Node.js",
      lockfile: "package-lock.json",
      pkg: { scripts: {} },
      testFiles: 0,
      workspaceManifests: 0,
    });
    expect(s).toBeNull();
  });

  it("never emits a strategy the runner would reject", () => {
    const strategies = [
      resolveStrategy({
        ecosystem: "Node.js",
        lockfile: "package-lock.json",
        pkg: { scripts: { test: "mocha", build: "tsc" } },
        testFiles: 1,
        workspaceManifests: 0,
      }),
      resolveStrategy({
        ecosystem: "Python",
        lockfile: "requirements.txt",
        manifestText: "pytest==8.0.0",
        testFiles: 4,
        workspaceManifests: 0,
      }),
    ];
    for (const s of strategies) {
      expect(s).not.toBeNull();
      expect(validateCommandArgv(s!.install).ok).toBe(true);
      if (s!.build) expect(validateCommandArgv(s!.build).ok).toBe(true);
      for (const t of s!.tests) expect(validateCommandArgv(t.argv).ok).toBe(true);
    }
  });
});

describe("resolveStrategy (Python)", () => {
  it("installs requirements and runs pytest", () => {
    const s = resolveStrategy({
      ecosystem: "Python",
      lockfile: "requirements.txt",
      manifestText: "pytest==8.0.0\nrequests==2.32.0",
      testFiles: 3,
      workspaceManifests: 0,
    });
    expect(s?.install).toEqual([
      "python3",
      "-m",
      "pip",
      "install",
      "-r",
      "requirements.txt",
    ]);
    expect(s?.tests[0].argv).toEqual(["python3", "-m", "pytest", "-q"]);
  });

  it("installs a packaged project itself so its tests can import it", () => {
    const s = resolveStrategy({
      ecosystem: "Python",
      manifestText: "[project]\nname = \"demo\"\n[tool.pytest.ini_options]",
      testFiles: 2,
      workspaceManifests: 0,
      rootFiles: ["pyproject.toml", "requirements.txt"],
    });
    expect(s?.install).toEqual(["python3", "-m", "pip", "install", "-e", "."]);
    expect(s?.source).toBe("pyproject.toml");
  });

  it("returns null for ecosystems the sandbox does not execute", () => {
    expect(
      resolveStrategy({
        ecosystem: "Java",
        lockfile: "pom.xml",
        testFiles: 5,
        workspaceManifests: 0,
      }),
    ).toBeNull();
  });
});

describe("resolveStrategy (Go and Rust)", () => {
  it("downloads modules and tests every Go package", () => {
    const s = resolveStrategy({ ecosystem: "Go", testFiles: 4, workspaceManifests: 0 });
    expect(s?.install).toEqual(["go", "mod", "download"]);
    expect(s?.tests[0].argv).toEqual(["go", "test", "./..."]);
  });

  it("does not claim a Go test run when there are no _test.go files", () => {
    expect(resolveStrategy({ ecosystem: "Go", testFiles: 0, workspaceManifests: 0 })).toBeNull();
  });

  it("fetches crates and runs cargo test", () => {
    const s = resolveStrategy({ ecosystem: "Rust", lockfile: "Cargo.lock", testFiles: 0, workspaceManifests: 0 });
    expect(s?.install).toEqual(["cargo", "fetch"]);
    expect(s?.tests[0].argv).toEqual(["cargo", "test"]);
  });
});
