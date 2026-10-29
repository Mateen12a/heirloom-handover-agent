import { useQuery } from "convex/react";
import { ArrowRight, Check, CircleSlash, FileCheck2, GitBranch, Loader2, ShieldCheck, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HandoverPackView } from "@/components/HandoverPack";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function verdictStyle(verdict: string): React.CSSProperties {
  if (verdict === "verified")
    return { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" };
  if (verdict === "unverified")
    return { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber)" };
  return { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" };
}

export default function Sample() {
  const data = useQuery(api.runs.sample);

  return (
    <div className="hl-canvas min-h-svh">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        {data === undefined ? (
          <div className="hl-card flex min-h-[320px] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : data === null ? (
          <div className="hl-card flex min-h-[320px] flex-col items-center justify-center gap-4 p-10 text-center">
            <p className="text-base font-medium">The sample run is not seeded yet.</p>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Operators seed it with one Convex command. In the meantime you can
              sign in and start your own takeover.
            </p>
            <Button className="gap-2" asChild>
              <a href="/auth">
                Sign in
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        ) : (
          <>
            {/* Header card */}
            <div className="hl-card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                      {data.run.name}
                    </h1>
                    <Badge
                      variant="outline"
                      className="gap-1.5 px-2 py-0.5 text-[13px] font-medium"
                      style={{
                        background: "var(--heirloom-accent-soft)",
                        color: "var(--heirloom-accent-strong)",
                        borderColor: "var(--heirloom-accent)",
                      }}
                    >
                      <Check className="size-3" />
                      {data.run.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="px-2 py-0.5 text-[13px] font-medium text-muted-foreground"
                    >
                      sample · open to everyone
                    </Badge>
                  </div>
                  <p className="hl-terminal mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <GitBranch className="size-3.5" />
                    {data.run.repoUrl}
                  </p>
                </div>
                <Button className="gap-2" asChild>
                  <a href="/auth?returnTo=/dashboard">
                    Run your own repo
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/40 px-3.5 py-3">
                  <p className="text-[13px] font-medium text-muted-foreground">Model</p>
                  <p className="hl-terminal mt-1 text-sm font-semibold">
                    {data.run.modelPlan.replace("nvidia/", "")}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/40 px-3.5 py-3">
                  <p className="text-[13px] font-medium text-muted-foreground">Steps</p>
                  <p className="hl-terminal mt-1 text-sm font-semibold">
                    {data.run.stepsDone}/{data.run.stepsTotal}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/40 px-3.5 py-3">
                  <p className="text-[13px] font-medium text-muted-foreground">Tokens</p>
                  <p className="hl-terminal mt-1 text-sm font-semibold">
                    {data.run.tokensUsed.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/40 px-3.5 py-3">
                  <p className="text-[13px] font-medium text-muted-foreground">Finished</p>
                  <p className="hl-terminal mt-1 text-sm font-semibold">
                    {data.run.finishedAt ? fmtDateTime(data.run.finishedAt) : "running"}
                  </p>
                </div>
              </div>

              {data.run.summary && (
                <p className="mt-4 rounded-lg border border-border/70 bg-muted/50 px-4 py-3 text-sm leading-6 text-foreground/90">
                  {data.run.summary}
                </p>
              )}
            </div>

            {/* Agent feed */}
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold">Agent loop</h2>
              <div className="hl-card overflow-hidden">
                <ol className="relative px-5 py-2">
                  {[...data.steps]
                    .sort((a, b) => a.seq - b.seq)
                    .map((step, idx, arr) => (
                      <li key={step._id} className="relative flex gap-4 pb-5 last:pb-2">
                        <div className="relative flex flex-col items-center">
                          <span
                            className="inline-block size-2.5 rounded-full ring-4 ring-background"
                            style={{
                              background:
                                step.status === "ok" || step.status === "verifying"
                                  ? "var(--heirloom-accent)"
                                  : step.status === "retry"
                                    ? "var(--heirloom-amber)"
                                    : step.status === "failed"
                                      ? "var(--heirloom-red)"
                                      : "var(--muted-foreground)",
                            }}
                          />
                          {idx < arr.length - 1 && (
                            <div className="mt-1 w-px flex-1 bg-border" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{step.title}</p>
                            <span className="hl-terminal ml-auto text-[13px] text-muted-foreground">
                              {step.tokens.toLocaleString()} tok · {fmtDateTime(step.at)}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                            {step.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                </ol>
              </div>
            </section>

            {/* Evidence ledger */}
            <section className="mt-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Evidence ledger</h2>
                <p className="text-[13px] text-muted-foreground">
                  {data.evidence.filter((e) => e.verdict === "verified").length} verified ·{" "}
                  {data.evidence.filter((e) => e.verdict !== "verified").length} not verified
                </p>
              </div>
              <div className="hl-card divide-y divide-border/60">
                {data.evidence.map((e) => (
                  <div key={e._id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6">{e.claim}</p>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium"
                        style={verdictStyle(e.verdict)}
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
                        exit {e.exitCode} · <span className="text-foreground/60">{fmtDateTime(e.at)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Handover pack */}
            <section className="mt-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <FileCheck2 className="size-4 text-muted-foreground" />
                  Handover pack
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  assembled from this run's record · downloadable
                </p>
              </div>
              <HandoverPackView
                run={data.run}
                steps={data.steps}
                evidence={data.evidence}
                deps={data.dependencies}
              />
            </section>

            {/* Dependency intel */}
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold">Dependency intel</h2>
              {data.dependencies.length === 0 ? (
                <div className="hl-card px-5 py-8 text-center text-sm text-muted-foreground">
                  This repo declares no dependencies in its manifest, so there is
                  nothing to research here. Your own runs fill this table from package.json
                  and research it live with Tavily.
                </div>
              ) : (
                <div className="hl-card overflow-x-auto">
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
                      {data.dependencies.map((d) => (
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
            </section>

            {/* CTA */}
            <div className="hl-card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 size-5 shrink-0"
                  style={{ color: "var(--heirloom-accent-strong)" }}
                />
                <div>
                  <p className="text-sm font-semibold">
                    This run cost {data.run.tokensUsed.toLocaleString()} tokens. Yours starts the same way.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Sign in, point the agent at a repo you inherited, and watch the
                    loop produce its own receipts.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href="/catalog">Browse playbooks</a>
                </Button>
                <Button className="gap-2" asChild>
                  <a href="/auth?returnTo=/dashboard">
                    Start a takeover
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
