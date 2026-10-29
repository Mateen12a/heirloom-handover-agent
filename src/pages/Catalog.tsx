import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  Bell,
  Bomb,
  Check,
  Database,
  Layers,
  Network,
  Rocket,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLAYBOOKS, PLAYBOOK_CATEGORIES, type Playbook } from "@/lib/playbooks";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  layers: Layers,
  server: Server,
  rocket: Rocket,
  bomb: Bomb,
  network: Network,
  triangle: TriangleAlert,
  database: Database,
  terminal: Terminal,
};

const RISK_META: Record<
  Playbook["risk"],
  { icon: React.ComponentType<{ className?: string }>; style: React.CSSProperties; label: string }
> = {
  Low: {
    icon: ShieldCheck,
    label: "Low risk",
    style: { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" },
  },
  Moderate: {
    icon: ShieldAlert,
    label: "Moderate risk",
    style: { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber-strong)" },
  },
  High: {
    icon: ShieldQuestion,
    label: "High risk",
    style: { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" },
  },
};

function PlaybookCard({ pb }: { pb: Playbook }) {
  const Icon = ICONS[pb.icon] ?? Layers;
  const RiskIcon = RISK_META[pb.risk].icon;

  return (
    <article className="hl-card hl-card-hover flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: pb.status === "playable" ? "var(--heirloom-accent-soft)" : "var(--heirloom-violet-soft)",
            color: pb.status === "playable" ? "var(--heirloom-accent-strong)" : "var(--heirloom-violet)",
          }}
        >
          <Icon className="size-5" />
          </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium"
          style={RISK_META[pb.risk].style}
        >
          <RiskIcon className="size-3" />
          {RISK_META[pb.risk].label}
        </span>
      </div>

      <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {pb.category}
      </p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">{pb.name}</h3>
      <p className="mt-2.5 flex-1 text-sm leading-6 text-muted-foreground">{pb.summary}</p>

      {pb.highlights.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {pb.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--heirloom-accent-strong)" }} />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {pb.tags.map((t) => (
          <Badge
            key={t}
            variant="outline"
            className="border-border/80 px-2 py-0.5 text-[13px] font-normal text-muted-foreground"
          >
            {t}
          </Badge>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between pt-4">
        {pb.status === "playable" ? (
          <Button size="sm" className="gap-1.5" asChild>
            <a href={`/dashboard?shape=${pb.shape}`}>
              Start a takeover
              <ArrowRight className="size-3.5" />
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={`/catalog?notify=${pb.key}`}>
              <Bell className="size-3.5" />
              Join waitlist
            </a>
          </Button>
        )}
        <span
          className="text-[13px] font-medium"
          style={{
            color: pb.status === "playable" ? "var(--heirloom-accent-strong)" : "var(--heirloom-violet)",
          }}
        >
          {pb.status === "playable" ? "Runs end-to-end today" : "On the roadmap"}
        </span>
      </div>
    </article>
  );
}

export default function Catalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [playableOnly, setPlayableOnly] = useState(false);
  const [searchParams] = useSearchParams();

  // Waitlist acknowledgment when arriving from a playbook card.
  useEffect(() => {
    const key = searchParams.get("notify");
    if (!key) return;
    const pb = PLAYBOOKS.find((p) => p.key === key);
    if (pb) {
      toast.info(`Noted. We'll tune the loop for “${pb.name}” and email you when it launches.`);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLAYBOOKS.filter((pb) => {
      if (category !== "all" && pb.category !== category) return false;
      if (playableOnly && pb.status !== "playable") return false;
      if (!q) return true;
      return (
        pb.name.toLowerCase().includes(q) ||
        pb.summary.toLowerCase().includes(q) ||
        pb.category.toLowerCase().includes(q) ||
        pb.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, category, playableOnly]);

  return (
    <AppShell>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-14 sm:px-6 lg:pt-16">
            <p
              className="text-[13px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--heirloom-accent-strong)" }}
            >
              Playbook catalog
            </p>
            <h1 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Pick the shape of your inheritance
            </h1>
            <p className="mt-4 max-w-2xl text-pretty leading-7 text-muted-foreground">
              Every playbook tunes the agent loop for one class of inherited
              codebase: what a boot failure looks like, which fixes are on the
              table, and when to stop honestly. Four run end-to-end today; the
              rest are on the roadmap.
            </p>

            {/* Controls */}
            <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search playbooks, stacks, tags…"
                  className="pl-9"
                  aria-label="Search playbooks"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FilterChip
                  label="All"
                  active={category === "all"}
                  onClick={() => setCategory("all")}
                />
                {PLAYBOOK_CATEGORIES.map((c) => (
                  <FilterChip
                    key={c}
                    label={c}
                    active={category === c}
                    onClick={() => setCategory(c)}
                  />
                ))}
                <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
                <FilterChip
                  label="Playable now"
                  active={playableOnly}
                  onClick={() => setPlayableOnly((v) => !v)}
                />
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground" aria-live="polite">
              {filtered.length} of {PLAYBOOKS.length} playbooks
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          {filtered.length === 0 ? (
            <div className="hl-card mx-auto max-w-md p-10 text-center">
              <Search className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Nothing matches that search</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a stack name like “Vite”, or clear the filters.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                  setPlayableOnly(false);
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((pb) => (
                <PlaybookCard key={pb.key} pb={pb} />
              ))}
            </div>
          )}
        </section>

        {/* Roadmap note */}
        <section className=" hl-canvas">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <div className="hl-card flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Inheriting something that isn&apos;t here yet?
                </h2>
                <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
                  The four playable shapes cover the most common handover
                  cases. Join the waitlist for a shape and we&apos;ll tune
                  the loop for it. Bring the repo; the loop learns the rest.
                </p>
              </div>
              <Button variant="outline" className="shrink-0" asChild>
                <a href="/dashboard">Open the workspace</a>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors"
      style={
        active
          ? {
              background: "var(--heirloom-accent-soft)",
              color: "var(--heirloom-accent-strong)",
              borderColor: "var(--heirloom-accent)",
            }
          : {
              background: "transparent",
              color: "var(--muted-foreground)",
              borderColor: "var(--border)",
            }
      }
    >
      {label}
    </button>
  );
}
