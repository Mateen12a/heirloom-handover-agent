import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowRight,
  Check,
  CircleSlash,
  Clock,
  FileCheck2,
  FlaskConical,
  FolderSearch,
  Github,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { findPlaybookByShape } from "@/lib/playbooks";
import { userMessage } from "@/lib/errors";

import { HeirloomLogo } from "@/components/HeirloomLogo";
import { HandoverPackView, PackDraftButton } from "@/components/HandoverPack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";

// ── shared bits ────────────────────────────────────────────────────────────

type RunStatus =
  | "queued"
  | "running"
  | "fixing"
  | "verifying"
  | "success"
  | "failed"
  | "partial";

function statusStyle(status: RunStatus): { label: string; css: React.CSSProperties } {
  switch (status) {
    case "success":
      return {
        label: "success",
        css: { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" },
      };
    case "partial":
      return {
        label: "stopped honestly",
        css: { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber)" },
      };
    case "failed":
      return {
        label: "failed",
        css: { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" },
      };
    case "fixing":
      return {
        label: "fixing",
        css: { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber)" },
      };
    case "verifying":
    case "running":
      return {
        label: status,
        css: { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" },
      };
    default:
      return {
        label: "queued",
        css: { background: "var(--muted)", color: "var(--muted-foreground)" },
      };
  }
}

function StatusBadge({ status }: { status: RunStatus }) {
  const { label, css } = statusStyle(status);
  return (
    <Badge variant="outline" className="gap-1.5 px-2 py-0.5 text-[13px] font-medium" style={css}>
      {status === "running" || status === "verifying" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : status === "fixing" ? (
        <TriangleAlert className="size-3" />
      ) : status === "success" ? (
        <Check className="size-3" />
      ) : status === "partial" || status === "failed" ? (
        <TriangleAlert className="size-3" />
      ) : (
        <Clock className="size-3" />
      )}
      {label}
      {(status === "running" || status === "fixing" || status === "verifying") && (
        <span className="hl-blink" style={{ color: "var(--heirloom-accent-strong)" }}>▍</span>
      )}
    </Badge>
  );
}

function StepDot({ status, pulse = false }: { status: string; pulse?: boolean }) {
  const color =
    status === "ok" || status === "verifying"
      ? "var(--heirloom-accent)"
      : status === "retry"
        ? "var(--heirloom-amber)"
        : status === "failed"
          ? "var(--heirloom-red)"
          : "var(--muted-foreground)";
  return (
    <span className="relative mt-1 inline-flex">
      <span
        className="inline-block size-2.5 rounded-full ring-4 ring-background"
        style={{ background: color }}
      />
      {pulse && (
        <span
          className="hl-blink absolute inset-0 rounded-full"
          style={{ background: color }}
        />
      )}
    </span>
  );
}

function healthDotColor(run: { health?: { status: "live" | "down" } | null }): string {
  if (run.health?.status === "live") return "var(--heirloom-accent)";
  return "var(--muted-foreground)";
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function tierLabel(model?: string | null): string {
  if (!model) return "Nemotron";
  if (/nano/i.test(model)) return "Nemotron 3 Nano";
  if (/ultra/i.test(model)) return "Nemotron 3 Ultra";
  return model.replace(/^nvidia\//, "");
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── page ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const runs = useQuery(api.runs.list) ?? [];
  const stats = useQuery(api.runs.stats);
  const scenarios = useQuery(api.runs.listScenarios) ?? [];
  const config = useQuery(api.runs.config);

  const [selectedId, setSelectedId] = useState<Id<"runs"> | null>(null);
  const [searchParams] = useSearchParams();
  const shapeParam = searchParams.get("shape");
  // The landing page's live intake hands the repository over as ?repo=.
  const repoParam = searchParams.get("repo")?.trim() ?? "";
  const [composerOpen, setComposerOpen] = useState(() => {
    if (repoParam) return true;
    const pb = shapeParam ? findPlaybookByShape(shapeParam) : undefined;
    return Boolean(pb && pb.status === "playable");
  });

  const activeRun = runs.find((r) => r._id === selectedId) ?? runs[0];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="hl-canvas min-h-svh">
      {/* Workspace header */}
      <header className="sticky top-0 z-40 bg-background">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <HeirloomLogo />
            <Badge
              variant="outline"
              className="hidden px-2 py-0.5 text-[13px] font-medium sm:inline-flex"
              style={{
                color: "var(--heirloom-accent-strong)",
                borderColor: "var(--heirloom-accent)",
                background: "var(--heirloom-accent-soft)",
              }}
            >
              Token Factory · {tierLabel(config?.modelPlan)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:block">
              {user?.name || user?.email || "Account"}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Takeover workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {config === undefined
                ? "Hand over an inherited repo. Watch the loop work. Read the receipts."
                :                config.liveMode
                  ? `Live mode: runs execute against the real repository with Nebius Token Factory and NVIDIA Nemotron.${
                      config.runnerMode
                        ? " Sandbox attached: clean clone, real test runs, bounded repair cycles, and a named wall when it cannot go green."
                        : " Static verification only: attach the sandbox runner to execute tests."
                    }`
                  : "Demo mode: add NEBIUS_API_KEY in the Keys tab to switch to the live pipeline."}
            </p>
          </div>
          <NewRunDialog
            open={composerOpen}
            onOpenChange={setComposerOpen}
            initialShape={
              shapeParam && findPlaybookByShape(shapeParam)?.status === "playable"
                ? shapeParam
                : ""
            }
            scenarios={scenarios.map((s) => ({ key: s.key, label: s.label, blurb: s.blurb }))}
            liveMode={Boolean(config?.liveMode)}
            initialRepo={repoParam}
            onCreated={(id) => setSelectedId(id)}
          >
            <Button className="gap-2">
              <Plus className="size-4" />
              New takeover
            </Button>
          </NewRunDialog>
        </div>

        {/* Stats bar */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={FlaskConical}
            label="Takeovers"
            value={stats ? String(stats.runs) : "…"}
          />
          <StatCard
            icon={ShieldCheck}
            label="Repos probed live"
            value={stats ? String(stats.live) : "…"}
          />
          <StatCard
            icon={FileCheck2}
            label="Claims verified"
            value={stats ? String(stats.verifiedClaims) : "…"}
          />
          <StatCard
            icon={Layers}
            label="Credits burned"
            value={stats ? `$${stats.credits.toFixed(2)}` : "…"}
            sub={stats ? `${stats.tokens.toLocaleString()} tokens` : undefined}
          />
        </div>

        {/* Mobile run picker: the desktop list column is hidden below lg */}
        {runs.length > 0 && (
          <div className="mt-6 lg:hidden">
            <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">Selected run</p>
            <Select
              value={activeRun?._id ?? ""}
              onValueChange={(value) => setSelectedId(value as Id<"runs">)}
            >
              <SelectTrigger className="w-full" aria-label="Select a run">
                <SelectValue placeholder="Choose a takeover" />
              </SelectTrigger>
              <SelectContent>
                {runs.map((run) => (
                  <SelectItem key={run._id} value={run._id}>
                    {run.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Main split */}
        <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[340px_1fr]">
          {/* Run list (desktop) */}
          <section aria-label="Runs" className="hidden flex-col gap-3 lg:flex">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Runs</h2>
              <span className="text-[13px] text-muted-foreground">
                {runs.length} total
              </span>
            </div>
            {runs.length === 0 ? (
              <div className="hl-card flex flex-col items-center gap-3 p-8 text-center">
                <div
                  className="flex size-11 items-center justify-center rounded-lg"
                  style={{ background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }}
                >
                  <Github className="size-5" />
                </div>
                <p className="text-sm font-medium">No takeovers yet</p>
                <p className="text-[13px] leading-5 text-muted-foreground">
                  Hand over your first inherited repo and watch the agent earn
                  its keep.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {runs.map((run) => (
                  <button
                    key={run._id}
                    type="button"
                    onClick={() => setSelectedId(run._id)}
                    className={`hl-card hl-card-hover w-full p-4 text-left transition-shadow ${
                      activeRun?._id === run._id ? "ring-2 ring-ring/40" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {run.name}
                      </p>
                      <StatusBadge status={run.status} />
                    </div>
                    <p className="hl-terminal mt-1.5 truncate text-[13px] text-muted-foreground">
                      {run.repoUrl}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-[13px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block size-1.5 rounded-full"
                          style={{ background: healthDotColor(run) }}
                        />
                        {run.health ? run.health.url.replace(/^https?:\/\//, "").slice(0, 28) : "no probe yet"}
                      </span>
                      <span className="ml-auto shrink-0">{run.stepsDone}/{run.stepsTotal} steps</span>
                    </div>
                    <Progress
                      value={run.stepsTotal ? (run.stepsDone / run.stepsTotal) * 100 : 0}
                      className="mt-2.5 h-1"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Run detail */}
          <section aria-label="Run detail" className="min-w-0">
            {!activeRun ? (
              <div className="hl-card flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-10 text-center">
                <div
                  className="flex size-12 items-center justify-center rounded-xl"
                  style={{ background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }}
                >
                  <FolderSearch className="size-6" />
                </div>
                <p className="text-base font-medium">Nothing under the knife</p>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  Start your first takeover with the button above. The agent
                  loop (intake, survey, plan, probes, test run, analysis)
                  unfolds here in real time.
                </p>
              </div>
            ) : (
              <RunDetail runId={activeRun._id} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

// ── stat card ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="hl-card p-4 sm:p-5" data-icon={Icon.displayName}>
      <span className="text-[15px] text-muted-foreground">{label}</span>
      <p className="hl-terminal mt-2 text-4xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── new run composer ───────────────────────────────────────────────────────

function NewRunDialog({
  open,
  onOpenChange,
  scenarios,
  onCreated,
  initialShape = "",
  initialRepo = "",
  liveMode,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarios: { key: string; label: string; blurb: string }[];
  onCreated: (id: Id<"runs">) => void;
  initialShape?: string;
  initialRepo?: string;
  liveMode: boolean;
  children: React.ReactNode;
}) {
  const create = useMutation(api.runs.create);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState(
    initialRepo && !/github\.com\//i.test(initialRepo) ? `github.com/${initialRepo}` : initialRepo,
  );
  const [shape, setShape] = useState(initialShape);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The live pipeline reads the real repository and does not branch on the
    // shape; only the scripted demo playbooks do.
    if (!liveMode && !shape) {
      toast.error("Pick the repo shape so the loop knows what to expect.");
      return;
    }
    setSubmitting(true);
    try {
      const runId = await create({
        name: name.trim() || "Untitled takeover",
        // The sandbox runner only accepts the https form, so add the scheme
        // when the user types the bare github.com/owner/repo shown in the hint.
        repoUrl: (repoUrl.trim() || "github.com/inherited/unknown").replace(
          /^(?:https?:\/\/)?(?:www\.)?github\.com\//i,
          "https://github.com/",
        ),
        shape: liveMode ? "" : shape,
      });
      toast.success("Takeover queued. The loop is starting.");
      onCreated(runId);
      onOpenChange(false);
      setName("");
      setRepoUrl("");
      setShape("");
    } catch (err) {
      toast.error(userMessage(err, "Could not start the takeover"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New takeover</DialogTitle>
          <DialogDescription>
            The agent clones the repo into a capped sandbox and reconstructs
            everything it needs to boot.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="run-name">Run name</Label>
            <Input
              id="run-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Billing dashboard handover"
              maxLength={80}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="run-repo">Repository</Label>
            <Input
              id="run-repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="github.com/owner/messy-mern-app"
              required
            />
          </div>
          {!liveMode && (
            <div className="grid gap-2">
              <Label>Repo shape</Label>
              <Select value={shape} onValueChange={setShape}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="What kind of codebase is it?" />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="font-medium">{s.label}</span>
                      <span className="ml-2 text-[13px] text-muted-foreground">{s.blurb}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[13px] leading-5 text-muted-foreground">
                The shape tunes the loop&apos;s expectations: what a boot failure
                looks like, which fixes are on the table, and when to stop
                honestly.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Start the loop
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── run detail ─────────────────────────────────────────────────────────────

function RunDetail({ runId }: { runId: Id<"runs"> }) {
  const run = useQuery(api.runs.get, { runId });
  const steps = useQuery(api.runs.listSteps, { runId }) ?? [];
  const evidence = useQuery(api.runs.listEvidence, { runId }) ?? [];
  const deps = useQuery(api.runs.listDependencies, { runId }) ?? [];
  const removeRun = useMutation(api.runs.remove);
  const draftSummary = useAction(api.ai.draftSummary);
  const researchDeps = useAction(api.deps.research);

  const [researched, setResearched] = useState(false);
  const [researching, setResearching] = useState(false);

  async function handleResearch() {
    if (!run || researched || researching) return;
    if (!deps.some((d) => d.state === "pending" || !d.latest)) return;
    setResearching(true);
    try {
      const res = await researchDeps({ runId });
      setResearched(true);
      if (res.researched > 0) {
        toast.success(
          `Researched ${res.researched} dependenc${res.researched === 1 ? "y" : "ies"}${
            res.tavily ? " with Tavily" : " from the npm registry"
          }.`,
        );
      }
    } catch (err) {
      toast.error(userMessage(err, "Dependency research failed"));
    } finally {
      setResearching(false);
    }
  }

  const isLive =
    run?.status === "running" || run?.status === "fixing" || run?.status === "verifying";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  async function handleDraft() {
    if (!run) return;
    setDrafting(true);
    setDraftNote(null);
    try {
      const res = await draftSummary({
        runId,
        runName: run.name,
        repoUrl: run.repoUrl,
        shape: run.shape,
        status: run.status,
        evidence: evidence.map((e) => ({
          claim: e.claim,
          command: e.command,
          exitCode: e.exitCode,
          verdict: e.verdict,
        })),
      });
      if (res.ok) {
        toast.success(
          `Executive summary drafted by ${res.model.replace("nvidia/", "")} and saved to the pack.`,
        );
      } else if (res.reason === "missing_key") {
        setDraftNote(
          "Add NEBIUS_API_KEY in the project's Keys tab to draft with Nemotron live. The evidence ledger stays the source of truth either way.",
        );
      } else {
        setDraftNote(
          `Nemotron call failed (${res.reason})${
            "detail" in res && res.detail ? `: ${res.detail}` : ""
          }`,
        );
      }
    } finally {
      setDrafting(false);
    }
  }

  async function handleDelete() {
    if (!run) return;
    setConfirmOpen(false);
    await removeRun({ runId });
    toast.success("Run and its evidence deleted.");
  }

  if (run === undefined) {
    return (
      <div className="hl-card flex h-full min-h-[420px] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (run === null) {
    return (
      <div className="hl-card flex h-full min-h-[420px] items-center justify-center p-8 text-sm text-muted-foreground">
        Run not found.
      </div>
    );
  }

  const sortedSteps = [...steps].sort((a, b) => a.seq - b.seq);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Run header */}
      <div className="hl-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight">{run.name}</h2>
              <StatusBadge status={run.status} />
            </div>
            <p className="hl-terminal mt-1.5 text-[13px] text-muted-foreground">{run.repoUrl}</p>
          </div>
          <div className="flex items-center gap-2">
            {run.health && (
              <a
                href={run.health.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Badge
                  variant="outline"
                  className="gap-1.5 px-2.5 py-1 text-[13px] font-medium transition-opacity hover:opacity-80"
                  style={{
                    color: run.health.status === "live" ? "var(--heirloom-accent-strong)" : "var(--muted-foreground)",
                    borderColor: run.health.status === "live" ? "var(--heirloom-accent)" : "var(--border)",
                    background: run.health.status === "live" ? "var(--heirloom-accent-soft)" : "transparent",
                  }}
                >
                  <span
                    className={`inline-block size-1.5 rounded-full ${run.health.status === "live" ? "hl-blink" : ""}`}
                    style={{
                      background:
                        run.health.status === "live" ? "var(--heirloom-accent)" : "var(--muted-foreground)",
                    }}
                  />
                  {run.health.status === "live" ? "probe live" : "probe down"}
                </Badge>
              </a>
            )}
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
                Delete
              </Button>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Delete this takeover?</DialogTitle>
                  <DialogDescription>
                    The run, its timeline, its evidence ledger and its handover
                    pack are removed. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                    Keep it
                  </Button>
                  <Button variant="destructive" onClick={handleDelete}>
                    Delete run
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* run meta grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RunMeta label="Plan model" value={run.modelPlan.replace("nvidia/", "")} mono />
          <RunMeta label="Fast model" value={run.modelFast.replace("nvidia/", "")} mono />
          <RunMeta label="Fix cycles" value={String(run.fixAttempts)} />
          <RunMeta
            label="Spend"
            value={`$${run.creditsUsed.toFixed(2)}`}
            sub={`${run.tokensUsed.toLocaleString()} tokens`}
          />
        </div>

        <Progress
          value={run.stepsTotal ? (run.stepsDone / run.stepsTotal) * 100 : 0}
          className="mt-5 h-1.5"
        />

        {run.summary && (
          <p className="mt-4 rounded-lg border border-border/70 bg-muted/50 px-4 py-3 text-sm leading-6 text-foreground/90">
            {run.summary}
          </p>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="feed"
        className="gap-0"
        onValueChange={(value) => {
          if (value === "deps") void handleResearch();
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="feed">Agent feed</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ledger</TabsTrigger>
          <TabsTrigger value="deps">Dependency intel</TabsTrigger>
          <TabsTrigger value="pack">Handover pack</TabsTrigger>
        </TabsList>

        {/* Feed */}
        <TabsContent value="feed" className="mt-4">
          <div className="hl-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5">
              <p className="text-sm font-medium">Agent loop</p>
              {isLive && (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span
                    className="hl-blink inline-block size-1.5 rounded-full"
                    style={{ background: "var(--heirloom-accent)" }}
                  />
                  working
                </span>
              )}
            </div>
            {sortedSteps.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Queued. The first clone command lands any moment.
              </div>
            ) : (
              <ol className="relative space-y-0 px-5 py-2">
                {sortedSteps.map((step, idx) => (
                  <li key={step._id} className="relative flex gap-4 pb-5 last:pb-2">
                    {/* rail */}
                    <div className="relative flex flex-col items-center">
                      <StepDot status={step.status} pulse={isLive && idx === sortedSteps.length - 1} />
                      {idx < sortedSteps.length - 1 && (
                        <div className="mt-1 w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{step.title}</p>
                        <span
                          className="rounded px-1.5 py-0.5 text-[13px] font-medium"
                          style={
                            /nano/i.test(step.model)
                              ? { background: "var(--muted)", color: "var(--muted-foreground)" }
                              : { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }
                          }
                        >
                          {/nano/i.test(step.model) ? "nano" : /ultra/i.test(step.model) ? "ultra" : "model"}
                        </span>
                        <span className="hl-terminal ml-auto text-[13px] text-muted-foreground">
                          {step.tokens.toLocaleString()} tok · {fmtTime(step.at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </TabsContent>

        {/* Evidence */}
        <TabsContent value="evidence" className="mt-4">
          <div className="hl-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5">
              <p className="text-sm font-medium">Evidence ledger</p>
              <p className="text-[13px] text-muted-foreground">
                {evidence.filter((e) => e.verdict === "verified").length} verified ·{" "}
                {evidence.filter((e) => e.verdict === "unverified").length} unverified ·{" "}
                {evidence.filter((e) => e.verdict === "contradicted").length} contradicted
              </p>
            </div>
            {evidence.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No receipts yet. The ledger fills as the loop verifies claims.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {[...evidence]
                  .sort((a, b) => a.seq - b.seq)
                  .map((e) => (
                    <div key={e._id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm leading-6">{e.claim}</p>
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium"
                          style={
                            e.verdict === "verified"
                              ? { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }
                              : e.verdict === "unverified"
                                ? { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber)" }
                                : { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" }
                          }
                        >
                          {e.verdict === "verified" ? (
                            <Check className="size-3" />
                          ) : e.verdict === "unverified" ? (
                            <CircleSlash className="size-3" />
                          ) : (
                            <X className="size-3" />
                          )}
                          {e.verdict}
                        </span>
                      </div>
                      <div className="hl-code mt-2 rounded-[var(--radius)] bg-muted px-3 py-2 leading-5">
                        <p className="text-muted-foreground">
                          <span className="text-foreground/60">$</span> {e.command}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-foreground/85">{e.output}</p>
                        <p className="mt-1 text-muted-foreground">
                          exit {e.exitCode} ·{" "}
                          <span className="text-foreground/60">{fmtDateTime(e.at)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Dependency intel */}
        <TabsContent value="deps" className="mt-4">
          <div className="hl-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5">
              <p className="text-sm font-medium">Dependency intel</p>
              <p className="text-[13px] text-muted-foreground">
                {researching
                  ? "researching with Tavily…"
                  : deps.some((d) => d.state === "pending" || !d.latest)
                    ? "npm registry + Tavily research"
                    : deps.some((d) => /tavily research not configured/i.test(d.note))
                      ? "npm registry only · Tavily not configured"
                      : "researched live via Tavily"}
              </p>
            </div>
            {deps.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No runtime dependencies declared in the manifest, or the run
                has not reached manifest forensics yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className=" text-left text-[13px] text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">Package</th>
                      <th className="px-3 py-2.5 font-medium">Installed</th>
                      <th className="px-3 py-2.5 font-medium">Latest</th>
                      <th className="px-3 py-2.5 font-medium">State</th>
                      <th className="px-5 py-2.5 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {deps.map((d) => (
                      <tr key={d._id}>
                        <td className="hl-terminal px-5 py-3 font-medium">{d.name}</td>
                        <td className="hl-terminal px-3 py-3 text-muted-foreground">{d.version}</td>
                        <td className="hl-terminal px-3 py-3 text-muted-foreground">{d.latest}</td>
                        <td className="px-3 py-3">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium"
                            style={
                              d.state === "pending"
                                ? { background: "var(--muted)", color: "var(--muted-foreground)" }
                                : d.state === "current"
                                  ? { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }
                                  : d.state === "outdated"
                                    ? { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber)" }
                                    : { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" }
                            }
                          >
                            {d.state}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[13px] leading-5 text-muted-foreground">{d.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Handover pack */}
        <TabsContent value="pack" className="mt-4">
          <div className="flex min-w-0 flex-col gap-4">
            <HandoverPackView
              run={run}
              steps={sortedSteps}
              evidence={evidence}
              deps={deps}
              executiveSlot={
                <PackDraftButton
                  onClick={handleDraft}
                  busy={drafting}
                  hasNarrative={Boolean(run.packNarrative)}
                  disabled={evidence.length === 0}
                />
              }
              emptyHint="The pack assembles from the run's own record: procedures from the survey, risks from the ledger. Start a takeover to fill it."
            />
            {draftNote && (
              <p className="text-[13px] leading-5" style={{ color: "var(--heirloom-amber)" }}>
                {draftNote}
              </p>
            )}
            {run.health?.status === "live" && (
              <div className="hl-card p-5 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-10 items-center justify-center rounded-lg"
                      style={{ background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }}
                    >
                      <ArrowRight className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Health probe live</p>
                      <p className="hl-terminal mt-0.5 text-[13px] text-muted-foreground">
                        {run.health.url} · {run.health.httpCode} · {run.health.latencyMs} ms
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={run.health.url} target="_blank" rel="noopener noreferrer">
                      Open target
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RunMeta({
  label,
  value,
  sub,
  mono = false,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3.5 py-3">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${mono ? "hl-terminal" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

