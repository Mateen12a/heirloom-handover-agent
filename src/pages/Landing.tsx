import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import "./landing.css";

// Every figure, claim and command on this page is copied from the seeded
// sample run (jonschlinkert/is-number), so the page can be checked against
// /sample. Stage timings come from that run's step timestamps.

const stages = [
  { name: "Read", ms: 465, time: "Half a second", clause: "First, it reads the tree, the manifest and the lockfile." },
  { name: "Plan", ms: 1713, time: "Under two seconds", clause: "Then Nemotron Ultra on Nebius plans the takeover." },
  { name: "Probe", ms: 7961, time: "Eight seconds", clause: "Next, eleven claims are checked on a clean clone." },
  { name: "Run", ms: 49789, time: "Fifty seconds", clause: "Then the repo's own tests run in a capped sandbox." },
  { name: "Report", ms: 1617, time: "Under two seconds", clause: "Last, Ultra writes the risk register from the evidence." },
];
const stageFills = ["#ffffff", "#e3e1dc", "#f4f4f2", "#c9c5bc", "#ffffff"];

type Claim = { text: string; cmd: string; ok: boolean };
const claims: Claim[] = [
  { text: "the repository answers on branch master", cmd: "GET https://api.github.com/repos/jonschlinkert/is-number", ok: true },
  { text: "a clean clone succeeds", cmd: "git clone --depth 1 --quiet https://github.com/jonschlinkert/is-number repo", ok: true },
  { text: "the tree matches the head commit", cmd: "git rev-parse HEAD  ·  git log -1 --format=%cI", ok: true },
  { text: "a test suite ships with it", cmd: "git ls-files '*test*' '*spec*'", ok: true },
  { text: "the manifest declares runnable scripts", cmd: "npm pkg get scripts engines workspaces packageManager", ok: true },
  { text: "an MIT license is on file", cmd: "git ls-files '*LICENSE*' '*License*' '*license*'", ok: true },
  { text: "the sandbox has the toolchain it needs", cmd: "node --version  ·  npm --version", ok: true },
  { text: "dependencies install from scratch", cmd: "npm install --no-audit --no-fund", ok: true },
  { text: "the tests pass", cmd: "npm run test", ok: true },
];
const misses: Claim[] = [
  { text: "CI workflows", cmd: "git ls-files .github/workflows", ok: false },
  { text: "container assets", cmd: "git ls-files '*Dockerfile*' '*docker-compose*' '*.devcontainer*'", ok: false },
  { text: "an environment template", cmd: "git ls-files '*env.example' '*env.sample' '*env.template'", ok: false },
];
const allClaims = [...claims, ...misses];

const figures = [
  { whole: "61", dec: ".6", cap: "seconds from repository intake to the finished risk register" },
  { whole: "2", dec: ".5", cap: "seconds for the repo's own test suite to pass on a clean clone" },
  { whole: "8", dec: "", cap: "of 11 deployability claims verified; 3 left unverified" },
  { whole: "0", dec: ".07", cap: "dollars of Nemotron inference for the whole run" },
  { whole: "0", dec: "", cap: "claims shipped without a command and an exit code" },
];

const deliverables = [
  {
    phrase: "The runbook",
    body: "Install, test and boot, written from the commands that actually ran on a clean clone, not from a README that stopped being true years ago.",
    bg: "#05070a",
    ink: "#ffffff",
  },
  {
    phrase: "The map",
    body: "Entry points, workspaces, scripts and the dependencies between them, drawn from the surveyed tree of the repository you handed over.",
    bg: "#e3e1dc",
    ink: "#1f2b4d",
  },
  {
    phrase: "The risks",
    body: "What will bite the next engineer, ranked: no CI, no container, no env template, idle for 1,504 days. Each with the output that proved it.",
    bg: "#2a3a63",
    ink: "#ffffff",
  },
  {
    phrase: "The ledger",
    body: "Every claim, its command, its output and its exit code. Unproven claims say so. Claims a clean clone contradicts stay on the record.",
    bg: "#f4f4f2",
    ink: "#1f2b4d",
  },
];

const examples = ["jonschlinkert/kind-of", "tj/commander.js", "expressjs/morgan"];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".lp-in, .lp-bar");
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
      { rootMargin: "0px 0px -12% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
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
  | {
      state: "ok";
      name: string;
      branch: string;
      language: string;
      license: string;
      idleDays: number;
      sizeKb: number;
    };

function IntakePreview() {
  const [value, setValue] = useState("jonschlinkert/is-number");
  // Each answer is stored with the slug it belongs to; anything else is
  // still loading, so no state is set synchronously inside the effect.
  const [answer, setAnswer] = useState<{ slug: string; intake: Intake } | null>(null);
  const slug = slugOf(value);
  const intake: Intake = !slug
    ? { state: "idle" }
    : answer?.slug === slug
      ? answer.intake
      : { state: "loading" };

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
    <section id="try" className="lp-type" aria-labelledby="try-label">
      <form action="/dashboard" method="get" onSubmit={(e) => !slug && e.preventDefault()}>
        <label id="try-label" htmlFor="repo" className="lp-in">
          Type any public GitHub repository.
        </label>
        <div className="lp-type-row" data-ui>
          <input
            id="repo"
            name="repo"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
          />
        </div>
        <div className="lp-answer lp-in" style={{ "--i": 1 } as React.CSSProperties} data-ui aria-live="polite">
          {intake.state === "ok" ? (
            <>
              <dl>
                <dt>Repository</dt>
                <dd>{intake.name}</dd>
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
              <button type="submit" className="lp-btn go">
                Take over {intake.name}
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
      <div className="lp-examples lp-in" style={{ "--i": 2 } as React.CSSProperties}>
        <span>Or try</span>
        {examples.map((ex) => (
          <button key={ex} type="button" onClick={() => setValue(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </section>
  );
}

function ClaimSentence() {
  const [lit, setLit] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!paused.current) setLit((i) => (i + 1) % allClaims.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const current = allClaims[lit];
  const pick = (i: number) => {
    paused.current = true;
    setLit(i);
  };
  // Inline spans (not <button>) so a comma never wraps away from its claim.
  const claimProps = (i: number) => ({
    role: "button",
    tabIndex: 0,
    "aria-pressed": lit === i,
    onClick: () => pick(i),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(i);
      }
    },
  });

  return (
    <section id="ledger" className="lp-proof" aria-label="The evidence ledger of the sample run">
      <p className="lp-runon lp-in">
        <span className="lead">On is-number, Heirloom proved that </span>
        {claims.map((c, i) => (
          <span key={c.text}>
            <span {...claimProps(i)} className="lp-claim">
              {c.text}
            </span>
            {i < claims.length - 2 ? ", " : i === claims.length - 2 ? " and " : ". "}
          </span>
        ))}
        <span className="lead">It found no </span>
        {misses.map((c, j) => {
          const i = claims.length + j;
          return (
            <span key={c.text}>
              <span {...claimProps(i)} className="lp-claim miss">
                {c.text}
              </span>
              {j < misses.length - 2 ? ", " : j === misses.length - 2 ? " or " : ""}
            </span>
          );
        })}
        <span className="lead">, and says so.</span>
      </p>
      <div className="lp-receipt lp-in" style={{ "--i": 1 } as React.CSSProperties} data-ui aria-live="polite">
        <span>Command</span>
        <code>$ {current.cmd}</code>
        <span className={`verdict ${current.ok ? "ok" : "miss"}`}>
          exit 0 · {current.ok ? "verified" : "unverified"}
        </span>
      </div>
    </section>
  );
}

export default function Landing() {
  useReveal();
  const total = stages.reduce((s, x) => s + x.ms, 0);

  const sentence = (
    <>
      <span className="lp-line">
        <span>Every claim</span>
      </span>
      <span className="lp-line">
        <span>
          <span className="lp-slot">
            <img src="/img/ledger-1870.jpg" alt="" width={1920} height={1440} />
          </span>
          on record.
        </span>
      </span>
    </>
  );

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="lp-word">
          Heirloom
        </Link>
        <nav className="lp-nav-links" aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#ledger">The ledger</a>
          <a href="#try">Try a repo</a>
          <Link to="/sample">Sample run</Link>
          <Link to="/dashboard" className="lp-btn">
            Start a takeover
          </Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="lp-h1">
            <span className="copy over">{sentence}</span>
            <span className="copy under" aria-hidden="true">
              {sentence}
            </span>
          </h1>
          <p className="lp-hero-sub">
            Heirloom takes over an inherited codebase, runs it in a sandbox, and
            hands back a manual where every fact carries the command that proved
            it.
          </p>
        </section>

        <section id="how" className="lp-stages" aria-labelledby="how-title">
          <h2 id="how-title" className="lp-h2 lp-in">
            About one minute
          </h2>
          <ol className="lp-bar" data-ui aria-label={`Five stages of the sample run, ${(total / 1000).toFixed(1)} seconds in all`}>
            {stages.map((s, i) => (
              <li
                key={s.name}
                className="lp-seg"
                style={{ flexGrow: s.ms, flexBasis: 0, background: stageFills[i], "--i": i } as React.CSSProperties}
              >
                {s.time}
                <span className="clause" hidden>
                  {s.clause}
                </span>
              </li>
            ))}
          </ol>
          <div className="lp-clauses" aria-hidden="true">
            {stages.map((s) => (
              <p key={s.name} style={{ flexGrow: s.ms, flexBasis: 0 }}>
                <span>{s.clause}</span>
              </p>
            ))}
          </div>
          <p className="lp-note lp-in">
            Widths are the real stage timings of the{" "}
            <Link to="/sample" className="lp-link" style={{ color: "#fff" }}>
              sample run of jonschlinkert/is-number
            </Link>
            , planned by NVIDIA Nemotron 3 Ultra and run by Nemotron 3 Nano on Nebius Token Factory.
          </p>
        </section>

        <figure className="lp-photo" style={{ margin: 0 }}>
          <img
            src="/img/ledger-1870.jpg"
            alt="An open account book from 1870, handwritten entries in ink with two of them struck through"
            width={1920}
            height={1440}
            loading="lazy"
          />
          <figcaption>
            Denis Nealon's account book, 1870. Inherited records have always
            needed someone to check the entries. Deseronto Archives, no known
            copyright restrictions.
          </figcaption>
        </figure>

        <ClaimSentence />

        <IntakePreview />

        <section className="lp-stats" aria-labelledby="stats-title">
          <h2 id="stats-title" className="lp-stats-head lp-in">
            <span className="soft">Measured on</span>
            one real run
          </h2>
          <ul className="lp-figs">
            {figures.map((f, i) => (
              <li key={f.cap} className="lp-fig lp-in" style={{ "--i": i } as React.CSSProperties}>
                <span className="num">
                  <span className="whole">{f.whole}</span>
                  <span className="dec">{f.dec}</span>
                </span>
                <span className="cap">{f.cap}</span>
              </li>
            ))}
          </ul>
        </section>

        {deliverables.map((d, i) => (
          <section
            key={d.phrase}
            className={`lp-field${i % 2 ? " mirror" : ""}`}
            style={{ background: d.bg, color: d.ink }}
            aria-label={d.phrase}
          >
            <p className="lp-in">{d.body}</p>
            <h3 className="lp-in" style={{ "--i": 1 } as React.CSSProperties}>
              {d.phrase}
            </h3>
          </section>
        ))}

        <section className="lp-cta" aria-labelledby="cta-title">
          <h2 id="cta-title" className="lp-in">
            Hand it over.
            <br />
            Keep the receipts.
          </h2>
          <div className="lp-cta-row">
            <p className="lp-in">
              Sign in as a guest and point Heirloom at the repository nobody
              wants to touch. The pack is ready in about a minute.
            </p>
            <Link to="/dashboard" className="lp-btn lp-in" style={{ "--i": 1 } as React.CSSProperties}>
              Start a takeover
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-top">
          <div className="notes">
            <p>
              <strong>Heirloom Handover Agent.</strong> Proof-backed handover
              for inherited codebases.
            </p>
            <p>
              Runs on Nebius Token Factory. NVIDIA Nemotron 3 Ultra plans,
              Nemotron 3 Nano executes. Tavily researches dependencies.
            </p>
            <p>Built for the Nebius × NVIDIA Global AI Hackathon, Coding and Agentic Engineering track.</p>
          </div>
          <a href="#hero-title" className="lp-link">
            Back to top
          </a>
        </div>
        <a className="lp-foot-big" href="https://github.com/Mateen12a/heirloom-handover-agent">
          github.com/Mateen12a/
          <br />
          heirloom-handover-agent
        </a>
        <div className="lp-foot-meta">
          <span>
            <Link to="/sample">Sample run</Link>
            <Link to="/catalog">Playbooks</Link>
            <Link to="/dashboard">Workspace</Link>
          </span>
          <span>Ledger photograph: Deseronto Archives, via Wikimedia Commons</span>
          <span>MIT licence · 2026</span>
        </div>
      </footer>
    </div>
  );
}
