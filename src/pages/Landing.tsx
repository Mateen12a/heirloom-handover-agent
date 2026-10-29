import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import "./landing.css";

// Every figure, claim and command on this page is copied from the seeded
// sample run (jonschlinkert/is-number), so the page can be checked against
// /sample. Stage timings come from that run's step timestamps.

type Row = [string, string];
const stages: { name: string; time: string; title: string; body: string; card: { label: string; rows: Row[]; note: string } }[] = [
  {
    name: "Read",
    time: "0.5 s",
    title: "It reads the repository",
    body: "The GitHub API, the tree, the manifest and the lockfile. Nothing is assumed from the README.",
    card: {
      label: "Intake · jonschlinkert/is-number",
      rows: [["Branch", "master"], ["Language", "JavaScript"], ["Files", "11 tracked"], ["Idle for", "1,504 days"]],
      note: "Read from the GitHub API",
    },
  },
  {
    name: "Plan",
    time: "1.7 s",
    title: "Nemotron plans the takeover",
    body: "NVIDIA Nemotron 3 Ultra on Nebius Token Factory writes the first-day plan. It is screened for unsafe instructions before anyone sees it.",
    card: {
      label: "Plan · Nemotron 3 Ultra",
      rows: [["1", "Clone and list entry points"], ["2", "Install with the lockfile's manager"], ["3", "Run the repo's own tests"], ["4", "Record what cannot be proven"]],
      note: "Screened · no unsafe steps",
    },
  },
  {
    name: "Probe",
    time: "8.0 s",
    title: "Claims are checked on a clean clone",
    body: "Eleven deployability claims, each re-checked with a real command. A clone that contradicts the survey is recorded as contradicted.",
    card: {
      label: "Probes · 11 claims",
      rows: [["git clone --depth 1", "exit 0"], ["git ls-files '*test*'", "exit 0"], ["node --version", "exit 0"], ["git ls-files .github/workflows", "none"]],
      note: "8 verified · 3 unverified",
    },
  },
  {
    name: "Run",
    time: "49.8 s",
    title: "The code runs in a sandbox",
    body: "Install and test on a capped sandbox. When tests fail, Nemotron proposes fixes that are tokenized and allowlisted. No shell, ever.",
    card: {
      label: "Sandbox · capped",
      rows: [["npm install --no-audit --no-fund", "exit 0"], ["npm run test", "exit 0"], ["Fix cycles", "0 needed"], ["Tests", "passed in 2.5 s"]],
      note: "Green on a clean clone",
    },
  },
  {
    name: "Report",
    time: "1.6 s",
    title: "You get the handover pack",
    body: "A runbook, an architecture map and a risk register, where every line links to the command and exit code that proved it.",
    card: {
      label: "Risk register",
      rows: [["High", "No CI workflows"], ["Medium", "No container assets"], ["Medium", "No environment template"], ["Low", "Idle for 1,504 days"]],
      note: "Each risk carries its evidence",
    },
  },
];

type Claim = { text: string; cmd: string; ok: boolean };
const claims: Claim[] = [
  { text: "The repository answers on branch master", cmd: "GET api.github.com/repos/jonschlinkert/is-number", ok: true },
  { text: "A clean clone succeeds", cmd: "git clone --depth 1 --quiet …/is-number repo", ok: true },
  { text: "The tree matches the head commit", cmd: "git rev-parse HEAD · git log -1 --format=%cI", ok: true },
  { text: "A test suite ships with it", cmd: "git ls-files '*test*' '*spec*'", ok: true },
  { text: "Dependencies install from scratch", cmd: "npm install --no-audit --no-fund", ok: true },
  { text: "The tests pass", cmd: "npm run test", ok: true },
  { text: "CI workflows exist", cmd: "git ls-files .github/workflows", ok: false },
  { text: "Container assets exist", cmd: "git ls-files '*Dockerfile*' '*docker-compose*'", ok: false },
  { text: "An environment template exists", cmd: "git ls-files '*env.example' '*env.sample'", ok: false },
];

const statement =
  "Every inherited repository comes with a README that stopped being true. Heirloom takes it over on the record: it reads the code, runs it in a sandbox, and hands back a manual where every claim carries the command that proved it, and says so when it can't.";

const deliverables = [
  { title: "Runbook", body: "Install, test and boot, written from commands that actually ran on a clean clone." },
  { title: "Architecture map", body: "Entry points, workspaces, scripts and dependencies from the surveyed tree." },
  { title: "Risk register", body: "What will bite the next engineer, ranked, each with the output that proved it." },
  { title: "Evidence ledger", body: "Every claim, its command, its output and its exit code. Unproven claims say so." },
];

const examples = ["jonschlinkert/kind-of", "tj/commander.js", "expressjs/morgan"];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".lp-in");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Isometric stack of file blocks, the repository as an object: drawn in
// outline, with the run's orbit traced around it.
function RepoDrawing() {
  const blocks: [number, number, number][] = [];
  for (let z = 0; z < 3; z++)
    for (let x = 0; x < 4 - z; x++)
      for (let y = 0; y < 3 - z; y++) blocks.push([x, y, z]);
  const iso = (x: number, y: number, z: number) => [380 + (x - y) * 52, 250 + (x + y) * 30 - z * 58];
  const pts = (a: number[][]) => a.map((p) => p.join(",")).join(" ");
  return (
    <svg className="lp-draw" viewBox="0 0 760 520" aria-hidden="true">
      <ellipse className="orbit" cx="380" cy="330" rx="330" ry="120" />
      {blocks.map(([x, y, z], i) => {
        const t = [iso(x, y, z + 1), iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x, y + 1, z + 1)];
        const l = [iso(x, y + 1, z + 1), iso(x + 1, y + 1, z + 1), iso(x + 1, y + 1, z), iso(x, y + 1, z)];
        const r = [iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x + 1, y + 1, z), iso(x + 1, y, z)];
        return (
          <g key={i} className="blk" style={{ "--i": i } as React.CSSProperties}>
            <polygon points={pts(l)} className="l" />
            <polygon points={pts(r)} className="r" />
            <polygon points={pts(t)} className="t" />
          </g>
        );
      })}
    </svg>
  );
}

function LiveChip() {
  const steps = ["Reading the tree…", "Planning with Nemotron…", "Probing 11 claims…", "Running the tests…", "8 of 11 claims verified"];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % steps.length), 1800);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="lp-chip" aria-hidden="true">
      <span className={`dot${i === steps.length - 1 ? " ok" : ""}`} />
      <span>
        <strong>Live takeover</strong>
        <br />
        {steps[i]}
      </span>
    </div>
  );
}

function Statement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = statement.split(" ");
  const [lit, setLit] = useState(words.length);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const on = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      setLit(Math.round(p * words.length));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [words.length]);
  return (
    <p ref={ref} className="lp-statement">
      {words.map((w, i) => (
        <span key={i} className={i < lit ? "on" : undefined}>
          {w}{" "}
        </span>
      ))}
    </p>
  );
}

function HowItWorks() {
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => setTab((t) => (t + 1) % stages.length), 5200);
    return () => clearTimeout(id);
  }, [tab, playing]);
  const s = stages[tab];
  return (
    <section id="how" className="lp-wrap lp-how" aria-labelledby="how-title">
      <h2 id="how-title" className="lp-h2 lp-in">How it works</h2>
      <div className="lp-tabs lp-in" role="tablist" aria-label="Stages of a takeover">
        {stages.map((st, i) => (
          <button
            key={st.name}
            role="tab"
            aria-selected={tab === i}
            className={tab === i ? "on" : undefined}
            onClick={() => {
              setTab(i);
              setPlaying(false);
            }}
          >
            {st.name}
          </button>
        ))}
        <button className="pp" aria-label={playing ? "Pause the tour" : "Play the tour"} onClick={() => setPlaying((p) => !p)}>
          {playing ? "❚❚" : "▶"}
        </button>
      </div>
      <div className="lp-panel" role="tabpanel" key={tab}>
        <div className="txt">
          <span className="time">Stage {tab + 1} of 5 · {s.time} on the sample run</span>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
        </div>
        <div className="ui">
          <span className="lbl">{s.card.label}</span>
          {s.card.rows.map(([a, b]) => (
            <div key={a} className="row">
              <code>{a}</code>
              <span className={/exit 0|passed|0 needed|master|JavaScript/.test(b) ? "ok" : undefined}>{b}</span>
            </div>
          ))}
          <span className="pill">{s.card.note}</span>
        </div>
      </div>
      {playing && <div className="lp-progress" key={`p${tab}`} aria-hidden="true" />}
    </section>
  );
}

function Ledger() {
  const [sel, setSel] = useState(0);
  const c = claims[sel];
  return (
    <section id="ledger" className="lp-wrap lp-ledger" aria-labelledby="ledger-title">
      <div className="head">
        <h2 id="ledger-title" className="lp-h2 lp-in">Proof, not promises</h2>
        <p className="lp-lead lp-in">
          The real ledger of the sample run. Pick any claim to see the command behind it.
        </p>
      </div>
      <div className="lp-ledger-card lp-in">
        <ul>
          {claims.map((cl, i) => (
            <li key={cl.text}>
              <button className={sel === i ? "on" : undefined} aria-pressed={sel === i} onClick={() => setSel(i)}>
                <span className={`mark ${cl.ok ? "ok" : "miss"}`}>{cl.ok ? "✓" : "–"}</span>
                <span className={cl.ok ? undefined : "struck"}>{cl.text}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="receipt" aria-live="polite">
          <span className="lbl">Command</span>
          <code>$ {c.cmd}</code>
          <span className="lbl">Exit code</span>
          <span className="big">0</span>
          <span className={`verdict ${c.ok ? "ok" : "miss"}`}>{c.ok ? "Verified" : "Unverified: nothing found"}</span>
          <p>
            {c.ok
              ? "The command ran on a clean clone and its output supports the claim."
              : "The command ran and found nothing, so the claim stays unverified in the pack instead of being guessed."}
          </p>
        </div>
      </div>
    </section>
  );
}

function slugOf(input: string): string | null {
  const m = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/\.git$|\/$/g, "")
    .match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

type Intake =
  | { state: "idle" | "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; name: string; branch: string; language: string; license: string; idleDays: number; sizeKb: number };

function IntakePreview() {
  const [value, setValue] = useState("jonschlinkert/is-number");
  // Each answer is stored with the slug it belongs to; anything else is
  // still loading, so no state is set synchronously inside the effect.
  const [answer, setAnswer] = useState<{ slug: string; intake: Intake } | null>(null);
  const slug = slugOf(value);
  const intake: Intake = !slug ? { state: "idle" } : answer?.slug === slug ? answer.intake : { state: "loading" };

  useEffect(() => {
    if (!slug) return;
    const ctrl = new AbortController();
    const settle = (i: Intake) => setAnswer({ slug, intake: i });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${slug}`, { signal: ctrl.signal });
        if (res.status === 404) {
          settle({ state: "error", message: "GitHub has no public repository by that name." });
          return;
        }
        if (!res.ok) {
          settle({ state: "error", message: `GitHub answered ${res.status}. Try again in a minute.` });
          return;
        }
        const r = await res.json();
        settle({
          state: "ok",
          name: r.full_name,
          branch: r.default_branch,
          language: r.language ?? "not detected",
          license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : "none on file",
          idleDays: Math.max(0, Math.floor((Date.now() - Date.parse(r.pushed_at)) / 86_400_000)),
          sizeKb: r.size,
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          settle({ state: "error", message: "Could not reach GitHub from this browser." });
        }
      }
    }, 450);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [slug]);

  return (
    <section id="try" className="lp-wrap" aria-labelledby="try-title">
      <div className="lp-try">
        <div className="txt">
          <h2 id="try-title" className="lp-h2 lp-in">Try it on a real repository</h2>
          <p className="lp-in">
            Type any public GitHub repository. The intake reads it live from the GitHub API, then
            one click takes it over in the workspace.
          </p>
          <div className="lp-examples lp-in">
            {examples.map((ex) => (
              <button key={ex} type="button" onClick={() => setValue(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
        <form className="lp-intake lp-in" action="/dashboard" method="get" onSubmit={(e) => !slug && e.preventDefault()}>
          <label htmlFor="repo">Repository</label>
          <input
            id="repo"
            name="repo"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
          />
          <div aria-live="polite">
            {intake.state === "ok" ? (
              <>
                <dl>
                  <dt>Branch</dt>
                  <dd>{intake.branch}</dd>
                  <dt>Language</dt>
                  <dd>{intake.language}</dd>
                  <dt>License</dt>
                  <dd>{intake.license}</dd>
                  <dt>Idle for</dt>
                  <dd>
                    {intake.idleDays.toLocaleString()} {intake.idleDays === 1 ? "day" : "days"}
                  </dd>
                  <dt>Size</dt>
                  <dd>{intake.sizeKb.toLocaleString()} KB</dd>
                </dl>
                <button type="submit" className="lp-btn wide">
                  Take over {intake.name} →
                </button>
              </>
            ) : (
              <p className="state">
                {intake.state === "loading"
                  ? "Reading the repository from the GitHub API…"
                  : intake.state === "error"
                    ? intake.message
                    : "Write it as owner/name, for example jonschlinkert/is-number."}
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

export default function Landing() {
  useReveal();
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-in">
          <Link to="/" className="lp-word">
            <span className="mark" aria-hidden="true" />
            Heirloom
          </Link>
          <nav className="lp-nav-links" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#ledger">The ledger</a>
            <a href="#try">Try a repo</a>
            <Link to="/sample">Sample run</Link>
          </nav>
          <Link to="/dashboard" className="lp-btn">
            Start a takeover
          </Link>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="hero-title">
          <RepoDrawing />
          <LiveChip />
          <div className="lp-hero-txt">
            <h1 id="hero-title">
              Every claim, run
              <br />
              and verified.
            </h1>
            <p>
              Proof-backed handovers for inherited codebases. Built on NVIDIA Nemotron and Nebius
              Token Factory, for the engineer who inherits the repo nobody wants to touch.
            </p>
            <div className="lp-actions">
              <Link to="/dashboard" className="lp-btn">
                Start a takeover →
              </Link>
              <Link to="/sample" className="lp-btn ghost">
                See a real run
              </Link>
            </div>
          </div>
        </section>

        <section className="lp-wrap lp-intro" aria-label="What Heirloom does">
          <Statement />
          <ul className="lp-stats">
            <li className="lp-in">
              <strong>61.6 s</strong>
              <span>From repository intake to the finished risk register on the sample run.</span>
            </li>
            <li className="lp-in" style={{ "--i": 1 } as React.CSSProperties}>
              <strong>$0.07</strong>
              <span>Of Nemotron inference on Nebius Token Factory for the whole takeover.</span>
            </li>
            <li className="lp-in" style={{ "--i": 2 } as React.CSSProperties}>
              <strong>0 claims</strong>
              <span>Shipped without a command and an exit code behind them.</span>
            </li>
          </ul>
        </section>

        <section className="lp-wrap lp-screens" aria-label="Product screens">
          <figure className="lp-in">
            <div className="shot"><img src="/img/screen-workspace.jpg" alt="The takeover workspace with a live run and its agent feed" loading="lazy" /></div>
            <figcaption><strong>Takeover workspace</strong>Start a run and watch every stage land in the agent feed as it happens.</figcaption>
          </figure>
          <figure className="lp-in" style={{ "--i": 1 } as React.CSSProperties}>
            <div className="shot"><img src="/img/screen-ledger.jpg" alt="The evidence ledger listing claims with commands and exit codes" loading="lazy" /></div>
            <figcaption><strong>Evidence ledger</strong>Each claim with its command, output and exit code, verified or not.</figcaption>
          </figure>
          <figure className="lp-in" style={{ "--i": 2 } as React.CSSProperties}>
            <div className="shot"><img src="/img/screen-pack.jpg" alt="The handover pack runbook with proof under every step" loading="lazy" /></div>
            <figcaption><strong>Handover pack</strong>Runbook, map and risks, with the proof printed under every step.</figcaption>
          </figure>
          <p className="lp-small">Actual software screens from a live run.</p>
        </section>

        <HowItWorks />
        <Ledger />
        <IntakePreview />

        <section className="lp-wrap" aria-labelledby="pack-title">
          <h2 id="pack-title" className="lp-h2 lp-in">One pack for the next engineer</h2>
          <ul className="lp-cards">
            {deliverables.map((d, i) => (
              <li key={d.title} className="lp-in" style={{ "--i": i } as React.CSSProperties}>
                <span className="dot" />
                <h3>{d.title}</h3>
                <p>{d.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-wrap" aria-labelledby="cta-title">
          <div className="lp-cta">
            <div>
              <h2 id="cta-title" className="lp-in">Hand it over. Keep the receipts.</h2>
              <p className="lp-in">Sign in as a guest and point Heirloom at a repository. The pack is ready in about a minute.</p>
            </div>
            <Link to="/dashboard" className="lp-btn lp-in">
              Start a takeover →
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-wrap lp-foot">
        <div>
          <Link to="/" className="lp-word">
            <span className="mark" aria-hidden="true" />
            Heirloom
          </Link>
          <p>Proof-backed handovers for inherited codebases. Built for the Nebius × NVIDIA Global AI Hackathon.</p>
        </div>
        <nav aria-label="Footer">
          <Link to="/sample">Sample run</Link>
          <Link to="/catalog">Playbooks</Link>
          <Link to="/dashboard">Workspace</Link>
          <a href="https://github.com/Mateen12a/heirloom-handover-agent">GitHub</a>
        </nav>
        <p className="meta">Nemotron 3 Ultra plans · Nemotron 3 Nano executes · Tavily researches dependencies · MIT licence 2026</p>
      </footer>
    </div>
  );
}
