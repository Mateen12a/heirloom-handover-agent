# Heirloom sandbox runner

The execution half of the Heirloom Handover Agent. A small HTTP service that
takes a public GitHub repository and runs real commands against a clean clone
inside a capped, non-root container, returning the real stdout, exit code and
duration for every phase. The Convex pipeline calls it, records each result as
evidence, and on a failing suite asks Nemotron for a diagnosis, applies the
allowlisted correction and retries on the same working tree.

## Request modes

One endpoint, `POST /execute`, four shapes:

| Mode | Body | What happens |
| --- | --- | --- |
| Probe | `{ repoUrl, probes: "node" \| "generic" }` | Clones and runs fixed, code-owned probe commands (`git ls-files`, `npm pkg get`, toolchain versions). Nothing is installed and the clone is deleted before the response. |
| Prepare | `{ repoUrl, install, build?, tests }` | Clones, installs, optionally builds, runs the baseline tests and keeps the working tree open as a repair session. |
| Cycle | `{ sessionId, fixCommands, tests }` | Applies allowlisted corrective commands to the open session and reruns the tests. One clone, one install, many cycles. |
| Close | `{ sessionId, close: true }` | Deletes the session working tree. |

`install` and `build` are argv arrays (`["npm","ci","--no-audit","--no-fund"]`).
`tests` is a list of `{ cwd, argv }` jobs, where `cwd` must be a relative path
inside the clone. `fixCommands` is a list of argv arrays. Sessions are swept
after an idle timeout and a hard lifetime cap, so a vanished client cannot leak
working trees.

## Security model

- Runs as a **non-root** user (`USER node`); the server refuses to start as uid 0.
- **Public repos only**: URL allowlist (`https://github.com/owner/repo`) and
  `git clone` fails for anything private.
- **Bearer token required** (`RUNNER_TOKEN`); no token, no execution.
- **argv allowlist**: only `npm`, `pnpm`, `yarn`, `bun`, `npx` (known test
  runners only), `python3` (`-m pip` / `-m pytest`) and `node --version` can
  be executed. Shell metacharacters, quotes, absolute paths, traversal,
  publish/login commands and registry overrides are all rejected, and every
  argument is screened again server-side. No command is ever run through a
  shell on Linux.
- **CPU / memory / pid caps** enforced by Docker run flags (below).
- **Hard timeouts** per phase with process-group SIGKILL, plus an overall
  deadline per request and a lifetime cap per session.
- **One operation at a time** (in-process lock), so a burst cannot fork-bomb
  the box.
- **Read-only root filesystem**; work happens in a `/tmp` tmpfs that is wiped
  when a session closes.
- No secrets are passed into the container. The runner has no credentials to
  leak.

## Toolchains

The image ships Node 22 with npm, pnpm, yarn and bun, plus Python 3 with
pytest, so Node.js (including monorepos) and Python repositories can be
installed and tested. Repositories in other ecosystems still get probe mode,
but the pipeline records that no sandbox strategy was resolved instead of
pretending to execute them.

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
  -p 127.0.0.1:8790:8790 \
  heirloom-runner
```

The Dockerfile sets `HOME=/tmp` and `npm_config_cache=/tmp/.npm` because
`--read-only` blocks npm writes to the image's home directory.

## Expose it without opening a port

Bind the container to loopback (above) and put a Cloudflare Tunnel in front of
it, so the bearer token crosses the internet over TLS and the VM needs no
inbound firewall rule:

```bash
cloudflared tunnel --url http://127.0.0.1:8790
```

The quick tunnel prints an ephemeral `https://<random>.trycloudflare.com` URL
and is fine for a demo. For a stable hostname, create a named tunnel instead
(`cloudflared tunnel login && cloudflared tunnel create heirloom-runner`, then
point its ingress at `http://127.0.0.1:8790`).

Set the two Convex env vars from the project root, using the tunnel URL:

```bash
npx convex env set RUNNER_URL "https://<tunnel-host>"
npx convex env set RUNNER_TOKEN "$RUNNER_TOKEN"
```

With both set, every live run gains the execution phase: clean clone, real
install, baseline test run, evidence rows with exit codes, and on failure up
to four diagnosed repair cycles on the same clone. If the suite still does not
pass, the run stops at a wall the model names and says so. Without them the
pipeline stays static-analysis only and no execution claim is made.

## Verify

Without any server (drives clone, probe, install, baseline test, one cycle and
close directly, no background process needed):

```bash
node runner/selftest.mjs                       # lukeed/clsx + jonschlinkert/is-number
node runner/selftest.mjs https://github.com/OWNER/REPO
```

Against a deployed instance:

```bash
curl https://<tunnel-host>/health
curl -X POST https://<tunnel-host>/execute \
  -H "Authorization: Bearer $RUNNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/lukeed/clsx","probes":"node"}'
```

## Timeouts (env, milliseconds)

| Var | Default | Phase |
| --- | --- | --- |
| `CLONE_TIMEOUT` | 60000 | `git clone --depth 1` |
| `INSTALL_TIMEOUT` | 240000 | package manager install |
| `BUILD_TIMEOUT` | 180000 | resolved build command |
| `FIX_TIMEOUT` | 90000 | one corrective command |
| `TEST_TIMEOUT` | 180000 | one test job |
| `PROBE_TIMEOUT` | 30000 | one probe command |
| `HARD_DEADLINE` | 480000 | whole request |
| `SESSION_IDLE` | 240000 | idle time before a repair session is swept |
| `SESSION_MAX` | 900000 | hard lifetime of a repair session |
| `MAX_SESSIONS` | 3 | open repair sessions kept at once |
