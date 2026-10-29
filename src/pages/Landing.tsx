import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  FileCheck2,
  Gauge,
  GitBranch,
  Map as MapIcon,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-[0.14em]"
      style={{ color: "var(--heirloom-accent-strong)" }}
    >
      {children}
    </p>
  );
}

// Every row below is copied from the seeded sample run
// (jonschlinkert/is-number), so the hero feed can be checked against /sample.
const feedRows: { tag: string; text: string; state: "ok" | "retry" | "fail" | "run" }[] = [
  { tag: "intake", text: "15 files · last commit 1,504 days ago", state: "ok" },
  { tag: "survey", text: "4 JS · 0 TS · 1 package.json · 3 docs", state: "ok" },
  { tag: "manifest", text: "is-number v7.0.0 · scripts: test", state: "ok" },
  {
    tag: "strategy",
    text: "npm install --no-audit --no-fund → npm run test · from npm default + scripts",
    state: "ok",
  },
  { tag: "plan", text: "7-step takeover plan · 691 tok", state: "ok" },
  { tag: "probes", text: "8/11 deployability claims verified · 3 honestly unverified", state: "ok" },
  { tag: "tests", text: "npm run test passed on a clean clone · 2,486 ms", state: "ok" },
  { tag: "analysis", text: "risk: no CI, no container assets, no env template", state: "ok" },
];

function FeedStateDot({ state }: { state: "ok" | "retry" | "fail" | "run" }) {
  const color =
    state === "ok"
      ? "var(--heirloom-accent)"
      : state === "retry"
        ? "var(--heirloom-amber)"
        : state === "fail"
          ? "var(--heirloom-red)"
          : "var(--muted-foreground)";
  return <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="hl-grid-strong absolute inset-0" />
          <div className="hl-hero-fade absolute inset-0" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-24">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-wrap items-center gap-2"
              >
                <p
                  className="mr-1 text-xs font-semibold uppercase tracking-[0.14em]"
                  style={{ color: "var(--heirloom-accent-strong)" }}
                >
                  Heirloom Handover Agent
                </p>
                <Badge
                  variant="outline"
                  className="gap-1.5 border-border bg-card/70 px-2.5 py-1 text-xs font-medium backdrop-blur"
                >
                  <span
                    className="hl-blink inline-block size-1.5 rounded-full"
                    style={{ background: "var(--heirloom-accent)" }}
                  />
                  Nebius × NVIDIA Global AI Hackathon
                </Badge>
                <Badge
                  variant="outline"
                  className="border-border bg-card/70 px-2.5 py-1 text-xs font-medium backdrop-blur"
                >
                  Coding &amp; Agentic Engineering track
                </Badge>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.06 }}
                className="mt-6 text-balance text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]"
              >
                Nobody hands you the manual.
                <br />
                <span className="text-primary">Heirloom writes it</span>, and
                proves it.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.12 }}
                className="mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8"
              >
                Point Heirloom at a codebase nobody understands. It clones
                and surveys the repo, plans the takeover with Nemotron, runs
                the real test suite in a capped sandbox, then ships a
                handover pack where
                <span className="text-foreground font-medium">
                  {" "}
                  every claim links to a command the agent actually ran
                </span>
                , with its output and exit code.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.18 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Button size="lg" className="gap-2 px-5" asChild>
                  <a href="/dashboard">
                    Start a takeover
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="gap-2 px-5" asChild>
                  <a href="#proof">
                    <ShieldCheck className="size-4" />
                    See how it proves things
                  </a>
                </Button>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.26 }}
                className="mt-5 text-xs text-muted-foreground"
              >
                Runs on Nebius Token Factory · NVIDIA Nemotron planning &amp;
                fast loop ·{" "}
                <a href="/sample" className="font-medium underline underline-offset-2" style={{ color: "var(--heirloom-accent-strong)" }}>
                  Open a completed sample run
                </a>
              </motion.p>
            </div>

            {/* Agent feed mock */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="relative"
            >
              <div className="hl-card relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="size-4 text-muted-foreground" />
                    heirloom take over jonschlinkert/is-number
                  </div>
                  <Badge
                    variant="outline"
                    className="gap-1.5 px-2 py-0.5 text-[11px]"
                    style={{
                      color: "var(--heirloom-accent-strong)",
                      borderColor: "var(--heirloom-accent)",
                      background: "var(--heirloom-accent-soft)",
                    }}
                  >
                    real run
                  </Badge>
                </div>
                <div className="hl-terminal space-y-2.5 px-4 py-4 text-[12.5px] leading-5">
                  {feedRows.map((row) => (
                    <div key={row.tag} className="flex items-start gap-2.5">
                      <FeedStateDot state={row.state} />
                      <span className="w-20 shrink-0 text-muted-foreground">{row.tag}</span>
                      <span className="min-w-0 flex-1 text-foreground/90">{row.text}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2.5 border-t border-border/60 pt-3 text-muted-foreground">
                    <span className="w-20 shrink-0">evidence</span>
                    <span>
                      claim #6 verified · cmd{" "}
                      <span className="text-foreground/80">npm pkg get scripts engines workspaces packageManager</span> · exit 0
                    </span>
                    <span className="hl-blink" style={{ color: "var(--heirloom-accent)" }}>
                      ▍
                    </span>
                  </div>
                </div>
                <div className="border-t border-border/70 px-4 py-3">
                  <a
                    href="/sample"
                    className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
                    style={{ color: "var(--heirloom-accent-strong)" }}
                  >
                    Open this completed run (no sign-in needed) →
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Strip ──────────────────────────────────────────────────────── */}
        <section className="border-y border-border/70 bg-muted/40">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-4 text-center text-xs font-medium tracking-wide text-muted-foreground sm:px-6">
            <span>Nebius Token Factory: OpenAI-compatible inference</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span>NVIDIA Nemotron for planning &amp; fast loop calls</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span>Tavily dependency research: EOL &amp; advisories</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <a
              href="/catalog"
              className="font-semibold transition-colors"
              style={{ color: "var(--heirloom-accent-strong)" }}
            >
              Browse the playbook catalog →
            </a>
          </div>
        </section>

        {/* ── How it works ───────────────────────────────────────────────── */}
        <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <motion.div {...fadeUp} className="max-w-2xl">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              One takeover, four movements
            </h2>
            <p className="mt-4 text-muted-foreground">
              The agent loop plans with a large reasoning model and executes
              with a fast one. It reads the repo before it touches it, and it
              never ships a claim without the command, output and exit code
              behind it.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ScanSearch,
                step: "01",
                title: "Take over the repo",
                body: "Clone and index the tree: file census, entry points, scripts, lockfile, workspaces. The manifest and every test file are read, trusted by nothing.",
              },
              {
                icon: Boxes,
                step: "02",
                title: "Reconstruct the environment",
                body: "Parse dependencies, scripts and the env contract. Flag what only an operator can supply: a missing .env.example is recorded as a risk, not guessed at.",
              },
              {
                icon: Gauge,
                step: "03",
                title: "Run it for real",
                body: "Install and run the repo's own test suite in a capped, non-root sandbox. If it fails, Nemotron diagnoses and runs allowlisted corrective cycles on the same clone; if it still cannot go green, the run stops at a wall it names. The failure output stays in the ledger.",
              },
              {
                icon: FileCheck2,
                step: "04",
                title: "Verify & hand over",
                body: "Probe the repository, license and deployability surface, then assemble the runbook, architecture map and risk register, each claim cross-linked to proof.",
              },
            ].map((item) => (
              <motion.div key={item.step} {...fadeUp} className="hl-card hl-card-hover p-6">
                <div className="flex items-center justify-between">
                  <div
                    className="flex size-10 items-center justify-center rounded-lg"
                    style={{ background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }}
                  >
                    <item.icon className="size-5" />
                  </div>
                  <span className="hl-terminal text-xs text-muted-foreground">{item.step}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Proof, not promises ────────────────────────────────────────── */}
        <section id="proof" className="border-y border-border/70 hl-canvas">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <motion.div {...fadeUp}>
              <SectionLabel>The evidence ledger</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Proof, not promises
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Any agent can generate a confident README. Heirloom&apos;s
                handover pack is different by construction: a claim only enters
                the pack if a command ran and produced output. The command, its
                output and its exit code ship alongside the claim.
              </p>
              <ul className="mt-6 space-y-3 text-sm leading-6">
                {[
                  "Verified: the agent ran the proof itself, and it holds.",
                  "Unverified: the pack says so out loud instead of guessing.",
                  "Contradicted: a hypothesis the sandbox disproved, kept on the record.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <Check
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: "var(--heirloom-accent-strong)" }}
                    />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">
                When the one fix cycle does not land, the agent stops and says
                so instead of hiding the attempt. The risk register tells the
                next engineer exactly where to pick up.
              </p>
            </motion.div>

            <motion.div {...fadeUp} className="hl-card overflow-hidden">
              <div className="border-b border-border/70 px-5 py-3.5">
                <p className="text-sm font-medium">Sample ledger · billing-dashboard</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Example entries · 6 total · 4 verified · 1 unverified · 1 contradicted
                </p>
              </div>
              <div className="divide-y divide-border/60">
                {[
                  {
                    claim: "App requires Mongo 6 and a reachable MONGODB_URI to boot.",
                    cmd: "docker compose up -d && npm run dev",
                    exit: 0,
                    verdict: "verified" as const,
                  },
                  {
                    claim: "JWT_SECRET missing causes silent auth failure, not a crash.",
                    cmd: "JWT_SECRET= npm run dev",
                    exit: 0,
                    verdict: "verified" as const,
                  },
                  {
                    claim: "Stripe webhook secret cannot be recovered from repo history.",
                    cmd: "git log -p | grep -c whsec_",
                    exit: 1,
                    verdict: "unverified" as const,
                  },
                  {
                    claim: "Lockfile resolves React 18 while the manifest says ^17.",
                    cmd: "npm ls react",
                    exit: 0,
                    verdict: "contradicted" as const,
                  },
                ].map((row) => (
                  <div key={row.claim} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6">{row.claim}</p>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={
                          row.verdict === "verified"
                            ? { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }
                            : row.verdict === "unverified"
                              ? { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber)" }
                              : { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" }
                        }
                      >
                        {row.verdict === "verified" ? (
                          <Check className="size-3" />
                        ) : (
                          <TriangleAlert className="size-3" />
                        )}
                        {row.verdict}
                      </span>
                    </div>
                    <p className="hl-terminal mt-2 truncate text-[11.5px] text-muted-foreground">
                      $ {row.cmd}
                      <span className="ml-2 text-foreground/60">exit {row.exit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── The handover pack ──────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <motion.div {...fadeUp} className="max-w-2xl">
            <SectionLabel>The deliverable</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              What lands in your inbox
            </h2>
            <p className="mt-4 text-muted-foreground">
              Not a chat log. A pack the next engineer can act on the same
              afternoon.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: BookOpen,
                title: "Runbook",
                body: "Boot, seed, migrate, roll back. Eight procedures written against the live run, not the docs.",
              },
              {
                icon: MapIcon,
                title: "Architecture map",
                body: "Workspaces, routes, services and the hidden dependencies between them, drawn from the surveyed tree.",
              },
              {
                icon: TriangleAlert,
                title: "Risk register",
                body: "Ranked defects and unknowns, each with the repro command and the exact failed output that proved it.",
              },
              {
                icon: ShieldCheck,
                title: "Evidence ledger",
                body: "The receipt book. Every claim, its command, output and exit code, with a verdict the agent stands behind.",
              },
            ].map((item) => (
              <motion.div key={item.title} {...fadeUp} className="hl-card hl-card-hover p-6">
                <div
                  className="flex size-10 items-center justify-center rounded-lg"
                  style={{ background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }}
                >
                  <item.icon className="size-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Benchmark ──────────────────────────────────────────────────── */}
        <section id="benchmarks" className="border-y border-border/70 hl-canvas">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <motion.div {...fadeUp} className="max-w-2xl">
              <SectionLabel>Measured, not vibes</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                The benchmark we publish against ourselves
              </h2>
            </motion.div>
            <motion.div {...fadeUp} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { value: "8 / 11", label: "deployability claims verified on the sample run (jonschlinkert/is-number); the three misses stay unverified" },
                { value: "76 s", label: "intake to handover pack on that run" },
                { value: "1,541", label: "Nemotron tokens for the whole live run" },
                { value: "0", label: "claims shipped without a command and exit code" },
              ].map((stat) => (
                <div key={stat.label} className="hl-card p-6">
                  <p className="hl-terminal text-3xl font-semibold tracking-tight">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </motion.div>
            <motion.p {...fadeUp} className="mt-6 text-xs leading-6 text-muted-foreground">
              Measured on one real run of jonschlinkert/is-number, executed
              against the live GitHub API and Nebius Token Factory, and seeded
              into the app as the sample run anyone can open. The set grows as we publish more runs, failed ones
              included, with the evidence that explains why they failed.
            </motion.p>
          </div>
        </section>

        {/* ── Built with ─────────────────────────────────────────────────── */}
        <section id="built-with" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <motion.div {...fadeUp} className="max-w-2xl">
            <SectionLabel>Built with</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              The stack doing the work
            </h2>
          </motion.div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {[
              {
                name: "Nebius Token Factory",
                role: "The brain",
                body: "All planning, diagnosis and pack assembly run through the OpenAI-compatible endpoint at api.tokenfactory.nebius.com. Sandboxed executions are capped and every call is logged to the run's usage ledger.",
              },
              {
                name: "NVIDIA Nemotron",
                role: "Ultra plans, Nano executes",
                body: "nvidia/Nemotron-3-Ultra-550b-a55b handles the takeover plan, failure diagnosis and the handover narrative. nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B drives the fast loop: manifest forensics, probes and feed updates.",
              },
              {
                name: "Tavily",
                role: "Dependency research",
                body: "The Dependency intel tab checks the npm registry for the real latest version, then has Tavily research end-of-life status, advisories and known issues, so the pack explains not just what is old but what it is safe to move.",
              },
              {
                name: "Convex",
                role: "State and scheduling",
                body: "The pipeline is a scheduled Convex action: every phase writes through internal mutations, so the feed, ledger, usage meter and pack stay live for anyone watching. Auth, per-account caps and the run store live here too.",
              },
              {
                name: "Docker",
                role: "Sandboxed execution",
                body: "The runner clones, installs and tests inside a capped non-root container: read-only root filesystem, CPU, memory and pid limits, per-phase hard timeouts, and no secrets passed in. Failures and their exit codes stay in the ledger.",
              },
            ].map((item) => (
              <motion.div key={item.name} {...fadeUp} className="hl-card hl-card-hover p-6">
                <Badge
                  variant="outline"
                  className="px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    color: "var(--heirloom-accent-strong)",
                    borderColor: "var(--heirloom-accent)",
                    background: "var(--heirloom-accent-soft)",
                  }}
                >
                  {item.role}
                </Badge>
                <h3 className="mt-4 text-lg font-semibold">{item.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Judging alignment ──────────────────────────────────────────── */}
        <section className="border-t border-border/70">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <motion.div {...fadeUp} className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <SectionLabel>Built to be judged</SectionLabel>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Four equally weighted scores. Four honest answers.
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    title: "Technological implementation",
                    body: "Two-tier Nemotron loop, sandboxed execution, scheduled state machine, not a prompt wrapper.",
                  },
                  {
                    title: "Design",
                    body: "A workspace that makes the agent's reasoning legible: feed, ledger, pack.",
                  },
                  {
                    title: "Potential impact",
                    body: "Most teams inherit a codebase eventually. Heirloom gives them their week of archaeology back.",
                  },
                  {
                    title: "Quality of the idea",
                    body: "Checkable handover packs instead of plausible documents. Nobody else ships receipts.",
                  },
                ].map((item) => (
                  <div key={item.title} className="hl-card p-5">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Final CTA ──────────────────────────────────────────────────── */}
        <section className="px-4 pb-20 sm:px-6">
          <motion.div
            {...fadeUp}
            className="hl-grid relative mx-auto w-full max-w-6xl overflow-hidden rounded-[calc(var(--radius)+10px)] border border-border bg-card px-6 py-16 text-center sm:px-12"
          >
            <div className="relative">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Hand over the mess. Get back the manual, with receipts.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Pick a playbook from the catalog, hand over the repo, and watch
                the loop work: intake, survey, plan, probes, the sandboxed test
                run and the pack.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" className="gap-2 px-5" asChild>
                  <a href="/dashboard">
                    Start a takeover
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="/catalog">Browse the playbooks</a>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
