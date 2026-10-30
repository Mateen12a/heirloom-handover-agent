# Heirloom Handover Agent

Proof-backed handover for inherited codebases. Every claim links to a command
the agent actually ran.

Point it at a public GitHub repository and it takes ownership on the record:
it surveys the tree, reconstructs the real install and test commands, runs
them in a capped sandbox, repairs what it can, and ships a handover pack where
each fact carries the command and exit code that produced it. When something
cannot be verified, it says so instead of guessing.

- **Live app:** https://heirloom-handover.netlify.app (continue as a guest, or open the [public sample run](https://heirloom-handover.netlify.app/sample) without signing in)
- **Nebius + NVIDIA:** every model call goes to **Nebius Token Factory**. **NVIDIA Nemotron 3 Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`) plans the takeover, diagnoses failing tests and writes the risk analysis; **NVIDIA Nemotron 3 Nano** (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`) runs the fast loop steps. Model output that becomes a command is tokenized and allowlisted before it runs.
- **Hosting:** frontend on Netlify, backend on Convex, sandbox runner as a Docker service on Render ([render.yaml](render.yaml)).

## What a run produces

A seven-phase pipeline writes every phase to a live workspace feed and an
evidence ledger:

1. **Intake.** Reachability, branch, size, last push, license, idle days.
2. **Static survey.** File census, entry points, lockfile, workspaces.
3. **Manifest forensics.** Scripts, dependencies and version ranges, parsed.
4. **Run strategy.** The lockfile picks the package manager, executable CI
   commands cover monorepos, and package.json scripts are the fallback. The
   resolved strategy is what the sandbox executes, so the runbook and the run
   can never disagree.
5. **Onboarding plan.** Nemotron (Nebius Token Factory) writes the first-day
   plan, screened for unsafe instructions before display.
6. **Deployability probes.** With a runner attached, claims are checked
   against a clean clone with real `git ls-files` / `npm pkg get` commands.
   Without one, the same claims come from the GitHub tree and are labelled as
   such. A clone that contradicts the static survey is recorded as
   `contradicted`, not smoothed over.
7. **Sandboxed execution and repair.** One clean clone is installed, the
   resolved tests run, and on failure the diagnosis model proposes allowlisted
   corrective commands. A bounded number of cycles runs on the same clone. The
   run ends green, at a wall the model names precisely, or honestly static.
   Unsafe model output is discarded and never displayed.

The pack (dashboard and markdown export) contains the materialized summary,
runbook, architecture map, risk register and the full evidence ledger.

## Honest states

- `stopped honestly` / `partial`: the run could not verify everything.
- `static verification only`: no sandbox runner was attached.
- `sandbox not configured`: no execution was attempted.
- `green`: tests passed in the sandbox, on a clean clone, after N cycles.

The public sample at `/sample` is seeded verbatim from a real completed run,
so it cannot drift from what the pipeline actually produced.

## Stack

- React 19, Vite, Tailwind v4, shadcn/ui, React Router 7
- Convex for the backend, database and scheduled pipeline
- Convex Auth (email OTP and anonymous users)
- Nebius Token Factory for Nemotron (planning/diagnosis plus a fast loop tier)
- GitHub REST API for repository facts
- Tavily for dependency release notes (on demand, never auto-trusted)
- A small self-hosted sandbox runner (see `runner/README.md`)

## Run it locally

Requirements: Node 20+, a Convex deployment (local or hosted), and API keys.

```bash
npm install

# backend (pushes functions and starts the dev deployment)
npx convex dev

# frontend
npm run dev
```

Set the backend environment variables with `npx convex env set KEY value`:

| Variable | Purpose |
| --- | --- |
| `NEBIUS_API_KEY` | Nemotron calls (required for live runs) |
| `NEBIUS_PLAN_MODEL` | planning/diagnosis model id (optional override) |
| `NEBIUS_FAST_MODEL` | fast-loop model id (optional override) |
| `GITHUB_TOKEN` | raises the GitHub API rate limit (optional but recommended) |
| `TAVILY_API_KEY` | dependency release notes (optional) |
| `RUNNER_URL` | sandbox runner base URL (optional; enables execution) |
| `RUNNER_TOKEN` | sandbox runner bearer token (required with `RUNNER_URL`) |
| `RESEND_API_KEY` | sends email sign-in codes (optional; guest sign-in works without it) |
| `AUTH_EMAIL_FROM` | sender for sign-in emails (optional) |

Keys live on the Convex deployment only. They are never shipped to the
browser and the client never sees them.

The sample page and the playable scenario runs work without any keys; adding
`NEBIUS_API_KEY` switches the workspace to live runs against real repositories.

## Sandbox runner

Execution happens in a separate capped container, not in the Convex runtime.
It runs the repository's own suite for **Node.js** (npm, pnpm, yarn, bun, including
workspaces and CI-defined commands), **Python** (installs packaged projects with
`pip install -e .` or a requirements file, then pytest), **Go** (`go test ./...`)
and **Rust** (`cargo test`); other ecosystems get static verification only.
Build and run it with `runner/README.md`, or deploy it to Render from
[render.yaml](render.yaml) (a Convex cron pings `/health` every 10 minutes so
a free instance stays warm); setting `RUNNER_URL` and
`RUNNER_TOKEN` on the deployment attaches it. The runner clones public repos
only, refuses to start as root, executes argv-allowlisted commands (no shell),
enforces hard per-phase timeouts, and keeps one working tree per repair
session so cycles do not reinstall between attempts.

## Tests

```bash
npm test                        # vitest: strategy resolution, command screening,
                                # pack assembly, runner/client parity
node runner/selftest.mjs        # drives the runner core against real repos
```

`runner/selftest.mjs` exercises probe mode, prepare (install plus baseline
tests), one repair cycle on the same clone, and session close. It needs no
server process and no Docker, just network access to GitHub.

## Repository layout

- `src/pages`, `src/components`: the workspace, landing page, sample and pack UI
- `src/lib/pack.ts`: handover pack assembly and markdown export
- `src/convex/live.ts`: the live pipeline
- `src/convex/strategy.ts`: run-strategy resolution (lockfile, CI, scripts)
- `src/convex/fixCommand.ts`: tokenizer and argv screening for model-authored fixes
- `src/convex/schema.ts`: runs, steps, evidence, dependencies, usage
- `runner/`: the sandbox runner (server, Dockerfile, selftest)
