import { useCallback, useEffect, useRef, useState } from "react";
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

// The repository as a living object: folders and files as a slowly turning
// 3D tree. Probes travel from the root to each file in turn; a file lights
// green when its claim is verified and stays dim when it cannot be proven.
// The tally feeds the status chip, so the chip reports what the drawing does.
type Node3 = { x: number; y: number; z: number; parent: number; kind: 0 | 1 | 2; label?: string; state: 0 | 1 | 2; glow: number };

function buildTree(): Node3[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const nodes: Node3[] = [{ x: 0, y: 0, z: 0, parent: -1, kind: 0, label: "repo", state: 1, glow: 0 }];
  const dirs = ["src", "test", "lib", ".github", "docs", "scripts", "bin", "config"];
  const files = ["index.js", "package.json", "README.md", "LICENSE", "utils.js", "cli.js", "parse.js", "test.js"];
  dirs.forEach((name, d) => {
    const phi = Math.acos(1 - (2 * (d + 0.5)) / dirs.length);
    const th = Math.PI * (1 + Math.sqrt(5)) * d;
    const r = 1.55;
    const dx = r * Math.sin(phi) * Math.cos(th);
    const dy = r * Math.cos(phi) * 0.8;
    const dz = r * Math.sin(phi) * Math.sin(th);
    const di = nodes.push({ x: dx, y: dy, z: dz, parent: 0, kind: 1, label: name, state: 1, glow: 0 }) - 1;
    const n = 6 + Math.floor(rnd() * 9);
    for (let f = 0; f < n; f++) {
      const a = rnd() * Math.PI * 2;
      const b = Math.acos(2 * rnd() - 1);
      const rr = 0.35 + rnd() * 0.5;
      nodes.push({
        x: dx + rr * Math.sin(b) * Math.cos(a),
        y: dy + rr * Math.cos(b),
        z: dz + rr * Math.sin(b) * Math.sin(a),
        parent: di,
        kind: 2,
        label: f === 0 ? files[d % files.length] : undefined,
        state: 0,
        glow: 0,
      });
    }
  });
  return nodes;
}

function RepoField({ onTally }: { onTally: (verified: number, unproven: number, total: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tally = useRef(onTally);
  useEffect(() => {
    tally.current = onTally;
  }, [onTally]);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const nodes = buildTree();
    const files = nodes.map((n, i) => (n.kind === 2 ? i : -1)).filter((i) => i >= 0);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let order: number[] = [];
    let next = 0;
    let lastLaunch = 0;
    let resetAt = 0;
    const pulses: { file: number; t0: number }[] = [];
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;

    const shuffle = () => {
      order = [...files].sort(() => Math.random() - 0.5);
      next = 0;
    };
    const report = () => {
      let v = 0;
      let u = 0;
      for (const i of files) {
        if (nodes[i].state === 1) v++;
        else if (nodes[i].state === 2) u++;
      }
      tally.current(v, u, files.length);
    };
    shuffle();
    if (still) files.forEach((i, k) => (nodes[i].state = k % 5 === 4 ? 2 : 1));
    report();

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
    };
    size();
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const project = (n: Node3, ry: number, rx: number) => {
      const cy = Math.cos(ry);
      const sy = Math.sin(ry);
      const cx = Math.cos(rx);
      const sx = Math.sin(rx);
      const x1 = n.x * cy - n.z * sy;
      const z1 = n.x * sy + n.z * cy;
      const y2 = n.y * cx - z1 * sx;
      const z2 = n.y * sx + z1 * cx;
      const scale = (w > 900 ? Math.min(w * 0.42, h * 0.95) : w * 0.85) * 0.3;
      const p = 6 / (6 + z2);
      const ox = w > 900 ? w * 0.7 : w * 0.5;
      const oy = w > 900 ? h * 0.48 : h * 0.3;
      return { x: ox + x1 * scale * p, y: oy + y2 * scale * p, p, z: z2 };
    };

    const frame = (t: number) => {
      raf = 0;
      if (!visible) return;
      if (!still) {
        if (resetAt && t > resetAt) {
          files.forEach((i) => (nodes[i].state = 0));
          shuffle();
          resetAt = 0;
          report();
        }
        if (!resetAt && next < order.length && t - lastLaunch > 240) {
          pulses.push({ file: order[next++], t0: t });
          lastLaunch = t;
        }
        for (let k = pulses.length - 1; k >= 0; k--) {
          if (t - pulses[k].t0 > 900) {
            const n = nodes[pulses[k].file];
            n.state = Math.random() < 0.8 ? 1 : 2;
            n.glow = 1;
            pulses.splice(k, 1);
            report();
            if (next >= order.length && pulses.length === 0) resetAt = t + 2600;
          }
        }
      }

      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      const ry = t * 0.00012 + window.scrollY * 0.0025 + mouse.x * 0.35;
      const rx = 0.32 + mouse.y * 0.18;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const P = nodes.map((n) => project(n, ry, rx));
      const depthOf = (p: number, k: number) => Math.max(0.15, Math.min(1, (p - 0.6) * k));

      ctx.lineWidth = 1;
      nodes.forEach((n, i) => {
        if (n.parent < 0) return;
        const a = P[i];
        const b = P[n.parent];
        ctx.strokeStyle = `rgba(190, 204, 235, ${0.28 * depthOf(a.p, 1.6)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      // probes travel root → folder → file
      for (const pl of pulses) {
        const k = Math.min(1, (t - pl.t0) / 900);
        const f = nodes[pl.file];
        const A = P[0];
        const B = P[f.parent];
        const C = P[pl.file];
        const [S, E, u] = k < 0.5 ? [A, B, k * 2] : [B, C, (k - 0.5) * 2];
        const x = S.x + (E.x - S.x) * u;
        const y = S.y + (E.y - S.y) * u;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
        g.addColorStop(0, "rgba(247,148,29,0.95)");
        g.addColorStop(1, "rgba(247,148,29,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      const idx = nodes.map((_, i) => i).sort((a, b) => P[b].z - P[a].z);
      ctx.font = "500 12px Inter, system-ui, sans-serif";
      for (const i of idx) {
        const n = nodes[i];
        const q = P[i];
        const depth = depthOf(q.p, 1.7);
        n.glow *= 0.96;
        if (n.kind === 0) {
          ctx.fillStyle = "#f7941d";
          ctx.beginPath();
          ctx.arc(q.x, q.y, 7 * q.p, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(247,148,29,0.35)";
          ctx.beginPath();
          ctx.arc(q.x, q.y, (14 + Math.sin(t / 400) * 3) * q.p, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        if (n.kind === 1) {
          ctx.strokeStyle = `rgba(230, 236, 250, ${0.75 * depth})`;
          ctx.fillStyle = "#0d1424";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 5.5 * q.p, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.lineWidth = 1;
        } else {
          const r = (n.state === 1 ? 3.2 : 2.6) * q.p;
          if (n.glow > 0.05 && n.state === 1) {
            ctx.fillStyle = `rgba(60,207,122,${0.35 * n.glow})`;
            ctx.beginPath();
            ctx.arc(q.x, q.y, r + 10 * n.glow, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle =
            n.state === 1
              ? `rgba(60,207,122,${0.95 * depth})`
              : n.state === 2
                ? `rgba(120,130,155,${0.7 * depth})`
                : `rgba(170,182,210,${0.5 * depth})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (n.label && q.p > 0.92 && w > 640) {
          ctx.fillStyle = `rgba(214,222,240,${0.75 * depth})`;
          ctx.fillText(n.label, q.x + 10, q.y + 4);
        }
      }
      if (!still) raf = requestAnimationFrame(frame);
    };

    window.addEventListener("resize", size);
    window.addEventListener("pointermove", onMove, { passive: true });
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(cv);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="lp-field3d" aria-hidden="true" />;
}

function LiveChip({ verified, unproven, total }: { verified: number; unproven: number; total: number }) {
  const done = total > 0 && verified + unproven === total;
  return (
    <div className="lp-chip" aria-hidden="true">
      <span className={`dot${done ? " ok" : ""}`} />
      <span>
        <strong>{done ? "Takeover complete" : "Probing the repository"}</strong>
        <br />
        {verified} verified · {unproven} unproven · {total - verified - unproven} to go
      </span>
    </div>
  );
}

function Hero() {
  const [t, setT] = useState({ verified: 0, unproven: 0, total: 0 });
  const onTally = useCallback(
    (verified: number, unproven: number, total: number) => setT({ verified, unproven, total }),
    [],
  );
  return (
    <>
      <RepoField onTally={onTally} />
      <LiveChip {...t} />
    </>
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
          <Hero />
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
