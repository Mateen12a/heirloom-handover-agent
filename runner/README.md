# Heirloom sandbox runner

The execution half of the Heirloom Handover Agent. A tiny HTTP service that
takes a public GitHub repository, clones it, installs its dependencies and
runs its declared test script inside a capped, non-root container, then
returns the real stdout, stderr, exit code and duration for every phase. The
Convex pipeline calls it, records the output as evidence, and on failure asks
Nemotron for a diagnosis plus one corrective command and runs it again.

## Security model

- Runs as a **non-root** user (`USER node`); the server refuses to start as uid 0.
- **Public repos only**: URL allowlist (`https://github.com/owner/repo`) and
  `git clone` fails for anything private.
- **Bearer token required** (`RUNNER_TOKEN`); no token, no execution.
- **CPU / memory / pid caps** enforced by Docker run flags (below).
- **Hard timeouts** per phase (clone, install, fix, test) with process-group
  SIGKILL, plus an overall deadline per request.
- **One execution at a time** (in-process lock), so a burst cannot fork-bomb
  the box.
- **Read-only root filesystem**; work happens in a `/tmp` tmpfs that is wiped
  after every run.
- No secrets are passed into the container. The runner has no credentials to
  leak.

## Build and run

```bash
docker build -t heirloom-runner ./runner

RUNNER_TOKEN="$(openssl rand -hex 24)"
echo "RUNNER_TOKEN=$RUNNER_TOKEN"   # you will paste this into the Keys tab

docker run -d \
  --name heirloom-runner \
  --restart unless-stopped \
  --memory=1500m --cpus=1.0 --pids-limit=256 \
  --read-only --tmpfs /tmp:size=512m \
  -e RUNNER_TOKEN="$RUNNER_TOKEN" \
  -p 8790:8790 \
  heirloom-runner
```

Then open port 8790 in the VM firewall (or put it behind a TLS reverse proxy)
and set two Convex env vars from the project root:

```bash
bun convex env set RUNNER_URL "http://<YOUR_VM_IP>:8790"
bun convex env set RUNNER_TOKEN "$RUNNER_TOKEN"
```

With both set, every live run gains the execution phase: clean clone, real
install, real test run, evidence rows with exit codes, and on failure a
Nemotron diagnosis plus exactly one corrective retry. Without them the
pipeline stays static-analysis only and says so in the run summary.

## Verify

Without any server (tests the clone/install/fix/test core directly, no
background process needed):

```bash
node runner/selftest.mjs                       # runs against lukeed/clsx
node runner/selftest.mjs https://github.com/OWNER/REPO
```

Against a deployed instance:

```bash
curl http://<YOUR_VM_IP>:8790/health
curl -X POST http://<YOUR_VM_IP>:8790/execute \
  -H "Authorization: Bearer $RUNNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/lukeed/clsx"}'
```

## Timeouts (env, milliseconds)

| Var | Default | Phase |
| --- | --- | --- |
| `CLONE_TIMEOUT` | 45000 | `git clone --depth 1` |
| `INSTALL_TIMEOUT` | 150000 | `npm ci` / `npm install` |
| `FIX_TIMEOUT` | 60000 | one corrective command |
| `TEST_TIMEOUT` | 120000 | `npm test` |
| `HARD_DEADLINE` | 480000 | whole request |
