// Heirloom run scenarios.
//
// Each scenario is a full script of the agent loop for one class of inherited
// repository: the timeline entries it emits, the evidence it records in the
// ledger (claim -> command -> output -> verdict), and the dependency intel it
// produces. The engine replays these while the real Nebius/Nemotron agent
// loop is wired into the same tables, so the product UX, data model and demo
// behave identically either way.

export type TimelineStep = {
  title: string;
  detail: string;
  model: "plan" | "fast";
  tokens: number;
  status: "ok" | "retry" | "failed" | "verifying";
};

export type EvidenceEntry = {
  claim: string;
  command: string;
  output: string;
  exitCode: number;
  verdict: "verified" | "unverified" | "contradicted";
};

export type DependencyRow = {
  name: string;
  version: string;
  latest: string;
  state: "current" | "outdated" | "vulnerable";
  note: string;
};

export type Scenario = {
  label: string;
  blurb: string;
  health: { status: "live" | "down"; url: string; latencyMs: number; httpCode: number };
  outcome: "success" | "failed" | "partial";
  summary: string;
  timeline: TimelineStep[];
  evidence: EvidenceEntry[];
  dependencies: DependencyRow[];
};

export const MODEL_PLAN = "nvidia/nemotron-3-ultra";
export const MODEL_FAST = "nvidia/nemotron-3-nano";

const mern: Scenario = {
  label: "MERN app",
  blurb: "Mongo, Express, React, Node. The classic inherited codebase.",
  health: { status: "live", url: "https://staging-8f42.heirloom.app/api/health", latencyMs: 214, httpCode: 200 },
  outcome: "success",
  summary:
    "Handover pack issued. 5 claims verified on this run, 1 unverified (Stripe webhook secret), 4 dependency risks escalated. Staging build served 200 on /api/health.",
  timeline: [
    { title: "Repo intake", detail: "Cloned takeohcorp/billing-dashboard. 1,842 files, last commit 14 months ago. No README, no CI config detected.", model: "fast", tokens: 940, status: "ok" },
    { title: "Static survey", detail: "Mapped 3 workspaces, 41 route files, 2 docker fragments (both broken). Identified entry point server/index.js via package.json main field.", model: "plan", tokens: 5210, status: "ok" },
    { title: "Env var reconstruction", detail: "Traced 11 process.env reads. 7 inferred with defaults, 4 required with no source: MONGODB_URI, JWT_SECRET, STRIPE_WEBHOOK_SECRET, S3_BUCKET.", model: "plan", tokens: 6130, status: "ok" },
    { title: "First boot attempt", detail: "npm ci && npm run dev failed: mongoose.connect threw ECONNREFUSED on default port. No Mongo provisioned.", model: "fast", tokens: 1180, status: "retry" },
    { title: "Diagnosis", detail: "Plan model read the failure stack and rewrote the boot plan: provision local Mongo 6 container, retry with reconstructed MONGODB_URI.", model: "plan", tokens: 5890, status: "ok" },
    { title: "Test authoring", detail: "Zero tests existed. Generated 23 tests across auth, billing-cycles and invoice-pdf modules. 21 passed, 2 exposed a timezone bug in cycle rollover.", model: "plan", tokens: 9440, status: "ok" },
    { title: "Fix cycle", detail: "Applied patch to invoice-pdf rollover (UTC anchoring). Re-ran suite: 23/23 green.", model: "fast", tokens: 2210, status: "ok" },
    { title: "Containerisation", detail: "Wrote multi-stage Dockerfile (node:20-alpine, non-root user, 187 MB final image). Compose file wires Mongo 6 + app.", model: "fast", tokens: 3320, status: "ok" },
    { title: "Live verification", detail: "Booted stack, probed /api/health 12 times. 12/12 x HTTP 200, mean latency 214 ms.", model: "fast", tokens: 860, status: "verifying" },
    { title: "Handover pack", detail: "Runbook, architecture map and risk register assembled, every claim cross-linked to its evidence entry.", model: "plan", tokens: 7020, status: "ok" },
  ],
  evidence: [
    { claim: "App requires MongoDB 6+ and a reachable MONGODB_URI to boot.", command: "docker compose up -d && npm run dev", output: "[boot] mongoose.connect ECONNREFUSED 127.0.0.1:27017 (before provisioning) -> after provisioning: [boot] mongo connected in 412ms", exitCode: 0, verdict: "verified" },
    { claim: "JWT_SECRET missing causes silent auth failure, not a crash.", command: "JWT_SECRET= npm run dev", output: "Server up; POST /api/login returned 200 but every issued token failed verify on next request. Flagged as hidden runtime dependency.", exitCode: 0, verdict: "verified" },
    { claim: "Invoice PDF rollover mishandles month boundaries in non-UTC timezones.", command: "npm test -- invoice-pdf", output: "2 failing: 'rolls cycle at month end' expected 2026-02-28, received 2026-03-01 (TZ=America/Lagos). After patch: 23 passing.", exitCode: 0, verdict: "verified" },
    { claim: "Docker image builds and serves traffic as non-root.", command: "docker build -t heirloom/billing . && docker run -p 3000:3000 heirloom/billing", output: "Image 187MB. whoami in container: node. GET /api/health -> 200 (12 probes, mean 214ms).", exitCode: 0, verdict: "verified" },
    { claim: "Stripe webhook signature cannot be validated without STRIPE_WEBHOOK_SECRET.", command: "curl -X POST /api/webhooks/stripe -d '{...}'", output: "400 invalid_signature. No secret exists anywhere in repo history checked (git log -p | grep -c whsec_ = 0). Marked unverified: secret must come from operator.", exitCode: 1, verdict: "unverified" },
    { claim: "package.json declares React 17 but code uses useId (React 18 API).", command: "grep -r 'useId(' src/ --include='*.jsx' | wc -l", output: "3 usages. Static claim cross-checked against installed tree. Recorded as contradicted-lockfile risk: npm ci currently resolves React 18.2 while package.json says ^17.0.0.", exitCode: 0, verdict: "verified" },
  ],
  dependencies: [
    { name: "express", version: "4.17.1", latest: "5.1.0", state: "outdated", note: "V4 past EOL for security fixes. Migration guide linked in runbook section 4." },
    { name: "mongoose", version: "6.9.0", latest: "8.9.2", state: "outdated", note: "Works under Node 20 but deprecation warnings on connection options." },
    { name: "axios", version: "0.21.4", latest: "1.7.9", state: "vulnerable", note: "CVE-2023-45857 (XSRF token leakage). Upgrade blocked by request-interceptor shim; patch path documented." },
    { name: "react", version: "18.2.0 (lock) / ^17 (manifest)", latest: "19.1.0", state: "outdated", note: "Manifest-lock mismatch verified in evidence ledger. Reconciled to 18.2.0 for staging." },
    { name: "jsonwebtoken", version: "9.0.2", latest: "9.0.2", state: "current", note: "No known advisories at scan time." },
  ],
};

const express: Scenario = {
  label: "Express API",
  blurb: "Single-service Node API with no frontend and no tests.",
  health: { status: "live", url: "https://staging-31ba.heirloom.app/healthz", latencyMs: 96, httpCode: 200 },
  outcome: "success",
  summary:
    "Handover pack issued. 3 claims verified on this run, 1 unverified (SMTP relay host), 3 dependency risks escalated. Staging build served 200 on /healthz.",
  timeline: [
    { title: "Repo intake", detail: "Cloned atlas-freight/dispatch-api. 96 files, no lockfile (npm-shrinkwrap only). Entry point unclear: both server.js and index.js exist.", model: "fast", tokens: 720, status: "ok" },
    { title: "Static survey", detail: "server.js is live (referenced by Dockerfile fragment and pm2 config). index.js is an abandoned duplicate; excluded from build.", model: "plan", tokens: 4410, status: "ok" },
    { title: "First boot attempt", detail: "npm install --package-lock-only failed: 404 on private package @atlas/ui-kit. Registry token absent.", model: "fast", tokens: 910, status: "retry" },
    { title: "Diagnosis", detail: "Plan model decided to stub @atlas/ui-kit as a local alias (it is only used for a logo import) rather than demand credentials the operator may not have.", model: "plan", tokens: 5220, status: "ok" },
    { title: "Test authoring", detail: "Generated 14 supertest cases over the 6 public routes. 13 passed; 1 exposed /v1/dispatch accepting negative weights.", model: "plan", tokens: 6180, status: "ok" },
    { title: "Fix cycle", detail: "Added schema clamp (0-32,000 kg) plus regression test. Re-run: 14/14 green.", model: "fast", tokens: 1490, status: "ok" },
    { title: "Containerisation", detail: "Multi-stage Dockerfile, 142 MB, health probe wired to /healthz with 30s grace period.", model: "fast", tokens: 2980, status: "ok" },
    { title: "Live verification", detail: "Probed /healthz 10 times. 10/10 x HTTP 200, mean latency 96 ms.", model: "fast", tokens: 640, status: "verifying" },
    { title: "Handover pack", detail: "Runbook, architecture map, risk register assembled with evidence links.", model: "plan", tokens: 5980, status: "ok" },
  ],
  evidence: [
    { claim: "server.js is the true entry point; index.js is dead code.", command: "grep -rn 'index.js' Dockerfile* pm2* package.json", output: "No references to index.js in any launch config; pm2.yml points at server.js. Excluded from build after confirming zero imports.", exitCode: 0, verdict: "verified" },
    { claim: "@atlas/ui-kit is only consumed for a static logo import.", command: "grep -rn '@atlas/ui-kit' src/ | wc -l", output: "1 import (Logo.jsx). Local alias stub created; build proceeds without registry credentials.", exitCode: 0, verdict: "verified" },
    { claim: "/v1/dispatch accepted negative shipment weights before the fix.", command: "npm test -- dispatch.weight", output: "Failing test: POST /v1/dispatch with weight -500 returned 201 Created. After clamp: 422. Regression test added.", exitCode: 1, verdict: "verified" },
    { claim: "Mail relay host is still the staging SMTP provider.", command: "grep -rn 'SMTP_' src/ config/", output: "smtp.mailtrap.io hardcoded. Production relay unknown; flagged unverified - operator must confirm.", exitCode: 0, verdict: "unverified" },
  ],
  dependencies: [
    { name: "express", version: "4.18.2", latest: "5.1.0", state: "outdated", note: "Stable on v4; upgrade optional." },
    { name: "lodash", version: "4.17.20", latest: "4.17.21", state: "vulnerable", note: "CVE-2021-23337 (command injection in template). One-line upgrade verified in sandbox." },
    { name: "pino", version: "8.19.0", latest: "9.6.0", state: "outdated", note: "Low risk; scheduled after lodash fix." },
    { name: "supertest", version: "(new)", latest: "7.0.0", state: "current", note: "Added by Heirloom for the generated test suite." },
  ],
};

const vite: Scenario = {
  label: "Vite SPA",
  blurb: "Frontend-only project; proves the agent handles non-Node servers.",
  health: { status: "live", url: "https://staging-c77d.heirloom.app/", latencyMs: 63, httpCode: 200 },
  outcome: "success",
  summary:
    "Handover pack issued. 2 claims verified on this run, 1 unverified (deleted deploy target), 3 dependency risks escalated. Static build served 200 with asset integrity checks.",
  timeline: [
    { title: "Repo intake", detail: "Cloned ledgerly/ledgerly-web. 312 files. vite.config.ts pinned to Vite 2, Node engines field says 14.", model: "fast", tokens: 640, status: "ok" },
    { title: "Static survey", detail: "SPA with hash routing. No backend. Deploy target in CI fragment points at an S3 bucket that no longer exists.", model: "plan", tokens: 3810, status: "ok" },
    { title: "First build attempt", detail: "npm run build failed on Node 20: crypto.webcrypto undefined in Vite 2's esbuild pre-bundle.", model: "fast", tokens: 880, status: "retry" },
    { title: "Diagnosis", detail: "Plan model chose: upgrade Vite 2 -> 5, keep plugin-react compatible, drop engines=14 pin. Patch list produced.", model: "plan", tokens: 5560, status: "ok" },
    { title: "Fix cycle", detail: "Applied upgrade, regenerated lockfile. Build clean: 1.9 MB dist, 41 chunks.", model: "fast", tokens: 3320, status: "ok" },
    { title: "Static serving + verification", detail: "Served dist via Caddy container. Probed / and 5 hashed assets. 200s across the board, 63 ms mean.", model: "fast", tokens: 720, status: "verifying" },
    { title: "Handover pack", detail: "Runbook, architecture map, risk register with evidence links.", model: "plan", tokens: 4210, status: "ok" },
  ],
  evidence: [
    { claim: "Vite 2 cannot build on Node 20 (webcrypto in pre-bundle path).", command: "npm run build", output: "TypeError: crypto.webcrypto is not a function (esbuild pre-bundle). After upgrade to Vite 5.4: build clean in 11.2s.", exitCode: 1, verdict: "verified" },
    { claim: "CI deploy target is a deleted S3 bucket.", command: "grep -rn 's3://' .github/ .circleci/ 2>/dev/null", output: "s3://ledgerly-prod-web referenced in two workflows; bucket absent from org inventory. Marked unverified: replacement target needed from operator.", exitCode: 0, verdict: "unverified" },
    { claim: "All hashed assets serve with correct MIME and integrity after build.", command: "curl -sI dist assets (5 files)", output: "5/5 x 200, content-type text/javascript + text/css as expected, no stale hashes referenced by index.html.", exitCode: 0, verdict: "verified" },
  ],
  dependencies: [
    { name: "vite", version: "2.9.1", latest: "7.1.4", state: "outdated", note: "Upgraded to 5.4 in-sandbox (7.x needs Node 20.19+; staging image is 20.11)." },
    { name: "react", version: "17.0.2", latest: "19.1.0", state: "outdated", note: "Upgrading React risks component rewrite; flagged, not executed." },
    { name: "dayjs", version: "1.11.5", latest: "1.11.13", state: "current", note: "No advisories." },
    { name: "rollup", version: "(vite-internal 2.x)", latest: "4.34.0", state: "vulnerable", note: "Vite 2 bundles rollup 2 with DoS advisory; resolved by the Vite 5 upgrade." },
  ],
};

const chaos: Scenario = {
  label: "Broken chaos repo",
  blurb: "A deliberately hostile tree: missing deps, dead entry points, undeclared env vars.",
  health: { status: "down", url: "https://staging-0e11.heirloom.app/api/ping", latencyMs: 0, httpCode: 0 },
  outcome: "partial",
  summary:
    "Agent stopped honestly after 4 failed fix cycles. 3 claims verified, 1 contradicted; app boots to 503. Risk register escalated with the exact blocking defects and evidence.",
  timeline: [
    { title: "Repo intake", detail: "Cloned ghoststack/pos-terminal. 2,204 files, git history truncated (shallow clone with no remote).", model: "fast", tokens: 810, status: "ok" },
    { title: "Static survey", detail: "Two package.json files disagree on the entry point. src/main.ts imports a file that does not exist.", model: "plan", tokens: 4870, status: "ok" },
    { title: "First boot attempt", detail: "Cannot resolve '@/lib/session' from src/main.ts. No tsconfig path alias defined.", model: "fast", tokens: 990, status: "retry" },
    { title: "Diagnosis", detail: "Plan model hypothesised the aliased file was deleted and reconstructable from 6 call sites. Wrote reconstruction candidate.", model: "plan", tokens: 6010, status: "ok" },
    { title: "Fix cycle x2", detail: "Reconstruction compiled but session verification semantics differ from the two call sites' expectations. 503 from /api/ping on every probe.", model: "fast", tokens: 2440, status: "retry" },
    { title: "Honest stop", detail: "4 fix cycles exhausted. Marked run partial rather than shipping a guess. All failed attempts preserved in evidence with outputs.", model: "plan", tokens: 5320, status: "failed" },
    { title: "Risk register", detail: "Blocking defects documented with exact repro commands; next-action list for a human engineer included.", model: "plan", tokens: 4480, status: "ok" },
  ],
  evidence: [
    { claim: "src/lib/session.ts is genuinely absent, not merely misplaced.", command: "git log --all --oneline -- src/lib/session.ts | wc -l", output: "0 commits in any branch touch the path. Import exists in 6 files. Not recoverable from history.", exitCode: 1, verdict: "verified" },
    { claim: "Reconstructed session module compiles but fails verification semantics.", command: "npm run build && curl /api/ping", output: "Build OK. /api/ping -> 503 every probe. session.verify() signature mismatch with 2 of 6 call sites (expects token payload v2).", exitCode: 1, verdict: "contradicted" },
    { claim: "Two package.json manifests disagree on entry point.", command: "cat package.json app/package.json | grep -n 'main'", output: "Root: dist/index.js. app/: src/main.ts. Neither path exists as written. Recorded as structural conflict.", exitCode: 0, verdict: "verified" },
    { claim: "PORT is read from env but never validated; empty value binds to 0.", command: "PORT= node dist/index.js", output: "Server bound to ephemeral port; health check unreachable. Confirms hidden dependency on operator-supplied PORT.", exitCode: 0, verdict: "verified" },
  ],
  dependencies: [
    { name: "typescript", version: "4.4.4", latest: "5.7.3", state: "outdated", note: "Blocker: path alias config relies on 4.x resolution quirks." },
    { name: "fastify", version: "3.29.0", latest: "5.2.1", state: "vulnerable", note: "V3 EOL with open advisories; upgrade blocked by the session module defect." },
    { name: "dotenv", version: "16.4.5", latest: "16.4.5", state: "current", note: "Fine." },
  ],
};

export const SCENARIOS: Record<string, Scenario> = {
  mern,
  express,
  vite,
  chaos,
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS);

export function getScenario(key: string): Scenario {
  return SCENARIOS[key] ?? mern;
}
