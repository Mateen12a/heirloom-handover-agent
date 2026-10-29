import { useMemo } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  CircleSlash,
  Copy,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  Map as MapIcon,
  PenLine,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildPack,
  packFileName,
  packToMarkdown,
  type PackDep,
  type PackEvidence,
  type PackRun,
  type PackStep,
  type PackRisk,
} from "@/lib/pack";

const severityStyle: Record<PackRisk["severity"], { label: string; css: React.CSSProperties }> = {
  high: {
    label: "high",
    css: { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" },
  },
  medium: {
    label: "medium",
    css: { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber)" },
  },
  low: {
    label: "low",
    css: { background: "var(--muted)", color: "var(--muted-foreground)" },
  },
};

function CardHead({
  icon: Icon,
  title,
  meta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
      </div>
      {meta}
    </div>
  );
}

export function HandoverPackView({
  run,
  steps,
  evidence,
  deps,
  executiveSlot,
  emptyHint,
}: {
  run: PackRun;
  steps: PackStep[];
  evidence: PackEvidence[];
  deps: PackDep[];
  /** Optional controls rendered beside the executive summary (draft button). */
  executiveSlot?: React.ReactNode;
  /** Shown instead of the empty-state line when there is nothing to assemble. */
  emptyHint?: string;
}) {
  const pack = useMemo(
    () => buildPack({ run, steps, evidence, deps }),
    [run, steps, evidence, deps],
  );

  const markdown = () => packToMarkdown(pack, run);

  function handleDownload() {
    try {
      const blob = new Blob([markdown()], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = packFileName(pack, run);
      document.body.appendChild(a);
      a.click();
      // Revoke on the next tick: revoking synchronously can cancel the download
      // in some webviews before it has started.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      toast.success("Handover pack downloaded.");
    } catch {
      toast.error("Could not create the download. Copy the markdown instead.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown());
      toast.success("Handover pack copied as Markdown.");
    } catch {
      toast.error("Clipboard access was blocked. Use Download instead.");
    }
  }

  if (evidence.length === 0 && steps.length === 0) {
    return (
      <div className="hl-card px-5 py-10 text-center text-sm text-muted-foreground">
        {emptyHint ??
          "The pack assembles from the run's own record. Nothing to assemble yet."}
      </div>
    );
  }

  const unresolved = pack.counts.unverified + pack.counts.contradicted;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Header */}
      <div className="hl-card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Handover pack</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {pack.counts.verified} verified · {pack.counts.unverified} unverified ·{" "}
            {pack.counts.contradicted} contradicted · {pack.ledger.length} recorded command
            {pack.ledger.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleCopy}>
            <Copy className="size-3.5" />
            Copy
          </Button>
          <Button size="sm" className="gap-2" onClick={handleDownload}>
            <Download className="size-3.5" />
            Download .md
          </Button>
        </div>
      </div>

      {/* Executive summary */}
      <div className="hl-card overflow-hidden">
        <CardHead
          icon={FileText}
          title="Executive summary"
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="px-2 py-0.5 text-[13px] font-medium"
                style={
                  pack.executive.origin === "nemotron"
                    ? {
                        background: "var(--heirloom-accent-soft)",
                        color: "var(--heirloom-accent-strong)",
                        borderColor: "var(--heirloom-accent)",
                      }
                    : { color: "var(--muted-foreground)" }
                }
              >
                {pack.executive.origin === "nemotron"
                  ? "Nemotron, from the ledger"
                  : pack.executive.origin === "pipeline"
                    ? "pipeline analysis"
                    : "not recorded"}
              </Badge>
              {executiveSlot}
            </div>
          }
        />
        <div className="px-5 py-4">
          {pack.executive.text ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
              {pack.executive.text}
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              No executive summary is recorded on this run yet.
            </p>
          )}
        </div>
      </div>

      {/* Runbook */}
      <div className="hl-card overflow-hidden">
        <CardHead
          icon={BookOpen}
          title="Runbook"
          meta={<span className="text-[13px] text-muted-foreground">{pack.runbook.length} procedures</span>}
        />
        <ol className="divide-y divide-border/60">
          {pack.runbook.map((p, i) => (
            <li key={`${p.title}-${i}`} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="hl-terminal mt-0.5 text-[13px] text-muted-foreground">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {p.detail}
                  </p>
                  {p.command && (
                    <p className="hl-code mt-2 inline-block rounded-[var(--radius)] bg-muted px-2.5 py-1.5 text-[13px]">
                      <span className="text-foreground/60">$</span> {p.command}
                    </p>
                  )}
                  {p.proof && (
                    <p className="mt-1.5 text-[13px] text-muted-foreground">Proof: {p.proof}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Architecture map */}
      <div className="hl-card overflow-hidden">
        <CardHead icon={MapIcon} title="Architecture map" />
        <dl className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
          {pack.architecture.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </dt>
              <dd className="mt-0.5 text-sm leading-6">{f.value}</dd>
            </div>
          ))}
        </dl>
        {pack.entryPoints.length > 0 && (
          <div className=" px-5 py-3.5">
            <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Entry points
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pack.entryPoints.map((e) => (
                <Badge
                  key={e}
                  variant="outline"
                  className="hl-terminal border-border/80 px-2 py-0.5 text-[13px] font-normal"
                >
                  {e}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Onboarding plan */}
      {pack.onboardingPlan && (
        <div className="hl-card overflow-hidden">
          <CardHead
            icon={FileCheck2}
            title="Onboarding plan"
            meta={<span className="text-[13px] text-muted-foreground">written by Nemotron from the survey</span>}
          />
          <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-6 text-foreground/90">
            {pack.onboardingPlan}
          </p>
        </div>
      )}

      {/* Risk register */}
      <div className="hl-card overflow-hidden">
        <CardHead
          icon={TriangleAlert}
          title="Risk register"
          meta={
            <span className="text-[13px] text-muted-foreground">
              {pack.risks.length === 0 ? "nothing unresolved" : `${pack.risks.length} open`}
            </span>
          }
        />
        {pack.risks.length === 0 ? (
          <div className="flex items-center gap-2.5 px-5 py-5 text-sm text-muted-foreground">
            <Check className="size-4" style={{ color: "var(--heirloom-accent-strong)" }} />
            Everything this run checked came back verified.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {pack.risks.map((r, i) => (
              <li key={`${r.title}-${i}`} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-6">{r.title}</p>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium"
                    style={severityStyle[r.severity].css}
                  >
                    {r.severity === "low" ? (
                      <CircleSlash className="size-3" />
                    ) : (
                      <TriangleAlert className="size-3" />
                    )}
                    {severityStyle[r.severity].label}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {r.detail}
                </p>
                {r.proof && (
                  <p className="hl-code mt-2 truncate text-[13px] text-muted-foreground">
                    $ {r.proof}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {unresolved === 0 && pack.risks.length > 0 && (
          <p className=" px-5 py-3 text-[13px] text-muted-foreground">
            Risks here come from dependency research and failed steps; every probe claim verified.
          </p>
        )}
      </div>
    </div>
  );
}

export function PackDraftButton({
  onClick,
  busy,
  hasNarrative,
  disabled,
}: {
  onClick: () => void;
  busy: boolean;
  hasNarrative: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={onClick}
      disabled={busy || disabled}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />}
      {hasNarrative ? "Redraft" : "Draft with Nemotron"}
    </Button>
  );
}
