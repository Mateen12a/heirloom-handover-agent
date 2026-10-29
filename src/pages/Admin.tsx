import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Loader2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { HeirloomLogo } from "@/components/HeirloomLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Admin() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const overview = useQuery(api.admin.overview);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div className="hl-card max-w-md p-8 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">Admin access required</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sign in to continue to the admin console.
          </p>
          <Button className="mt-5 w-full" onClick={() => navigate("/auth?returnTo=%2Fadmin")}>
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  if (overview === undefined) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!overview.isAdmin && !overview.canBootstrap) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div className="hl-card max-w-md p-8 text-center">
          <TriangleAlert className="mx-auto size-8" style={{ color: "var(--heirloom-amber)" }} />
          <h1 className="mt-4 text-lg font-semibold">Not authorized</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This account is not an admin. Sign in with an email listed in
            ADMIN_EMAILS, or ask an existing admin to grant you the role.
          </p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => navigate("/dashboard")}>
            Back to workspace
          </Button>
        </div>
      </div>
    );
  }

  if (overview.canBootstrap) {
    return <BootstrapGate />;
  }

  return <AdminConsole />;
}

function BootstrapGate() {
  const bootstrap = useMutation(api.admin.bootstrapAdmin);
  const [busy, setBusy] = useState(false);

  async function handleBootstrap() {
    setBusy(true);
    try {
      await bootstrap({});
      toast.success("You are now the platform admin.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bootstrap failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center hl-canvas p-6">
      <div className="hl-card w-full max-w-md p-8 text-center">
        <div
          className="mx-auto flex size-12 items-center justify-center rounded-xl"
          style={{ background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }}
        >
          <UserPlus className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Claim the admin console</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No admin exists yet. The first person to claim this becomes the
          platform administrator, responsible for roles and run moderation.
        </p>
        <Button className="mt-6 w-full gap-2" onClick={handleBootstrap} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Claim admin role
        </Button>
        <Link
          to="/dashboard"
          className="mt-3 block text-[13px] text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}

function AdminConsole() {
  return (
    <div className="hl-canvas min-h-svh">
      <header className="sticky top-3 z-40 px-3 sm:px-4">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between rounded-full bg-white pl-5 pr-2 shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-black/5">
          <div className="flex items-center gap-3">
            <Link to="/">
              <HeirloomLogo />
            </Link>
            <Badge className="hidden bg-[var(--brand-night)] px-2.5 text-white sm:inline-flex">Admin</Badge>
          </div>
          <nav className="flex items-center gap-1">
            <Link to="/sample" className="hidden rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex">
              Sample run
            </Link>
            <Button asChild size="sm">
              <Link to="/dashboard">Workspace</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Who is using Heirloom</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          People, activity, takeovers and spend, live from the database. The seeded sample run is not counted.
        </p>
        <Analytics />
        <Tabs defaultValue="users" className="mt-10 gap-0">
          <TabsList>
            <TabsTrigger value="users">People</TabsTrigger>
            <TabsTrigger value="runs">Takeovers</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <UsersTable />
          </TabsContent>
          <TabsContent value="runs" className="mt-4">
            <RunsTable />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Analytics() {
  const a = useQuery(api.admin.analytics);
  if (a === undefined) {
    return (
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hl-card h-[132px]" />
        ))}
      </div>
    );
  }
  const tiles = [
    {
      label: "People who used it",
      value: a.people.total.toLocaleString(),
      sub: `${a.people.guests} guests · ${a.people.withEmail} with email · ${a.people.new7d} new this week`,
    },
    {
      label: "Active this week",
      value: a.active.week.toLocaleString(),
      sub: `${a.active.day} today · ${a.active.month} in 30 days`,
    },
    {
      label: "Takeovers",
      value: a.takeovers.total.toLocaleString(),
      sub: `${a.takeovers.week} this week · ${a.people.ranTakeover} people ran one`,
    },
    {
      label: "Inference spend",
      value: `$${a.spend.credits.toFixed(2)}`,
      sub: `${a.spend.tokens.toLocaleString()} Nemotron tokens`,
    },
  ];
  const statuses = ["success", "partial", "failed", "verifying", "running", "fixing", "queued"] as const;
  const statusTone: Record<string, string> = {
    success: "var(--brand-ok)",
    partial: "var(--brand-warn)",
    failed: "var(--brand-bad)",
  };
  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="hl-card p-5">
            <p className="text-[13px] font-medium text-muted-foreground">{t.label}</p>
            <p className="hl-terminal mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">{t.value}</p>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <DailyBars title="People active per day" unit="people" days={a.days} pick={(d) => d.people} />
        <DailyBars title="Takeovers started per day" unit="takeovers" days={a.days} pick={(d) => d.takeovers} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="hl-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Outcomes</h2>
            <span className="text-[13px] text-muted-foreground">
              {a.takeovers.successRate === null ? "No finished takeovers yet" : `${a.takeovers.successRate}% green`}
              {a.takeovers.avgSeconds !== null && ` · ${a.takeovers.avgSeconds}s average`}
            </span>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {statuses
              .filter((s) => a.takeovers.byStatus[s])
              .map((s) => {
                const n = a.takeovers.byStatus[s];
                const pct = Math.round((n / Math.max(1, a.takeovers.total)) * 100);
                return (
                  <li key={s} className="grid grid-cols-[88px_1fr_56px] items-center gap-3 text-sm">
                    <span className="capitalize">{s}</span>
                    <span className="h-2 rounded-full bg-muted">
                      <span
                        className="block h-2 rounded-full"
                        style={{ width: `${pct}%`, background: statusTone[s] ?? "var(--brand-soft-ink)" }}
                      />
                    </span>
                    <span className="hl-terminal text-right text-muted-foreground">{n}</span>
                  </li>
                );
              })}
            {a.takeovers.total === 0 && <li className="text-sm text-muted-foreground">Nothing has run yet.</li>}
          </ul>
        </div>
        <div className="hl-card p-5">
          <h2 className="text-base font-semibold">Most taken-over repositories</h2>
          <ol className="mt-4 flex flex-col">
            {a.topRepos.map((r, i) => (
              <li key={r.repoUrl} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm odd:bg-muted/60">
                <span className="truncate">
                  <span className="hl-terminal mr-2 text-muted-foreground">{i + 1}.</span>
                  <a href={r.repoUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                    {r.repoUrl.replace("https://github.com/", "")}
                  </a>
                </span>
                <span className="hl-terminal shrink-0 text-muted-foreground">{r.count}×</span>
              </li>
            ))}
            {a.topRepos.length === 0 && <li className="text-sm text-muted-foreground">No repositories yet.</li>}
          </ol>
        </div>
      </div>
    </>
  );
}

type Day = { day: number; people: number; newPeople: number; takeovers: number };

// One series per chart, so no legend: the title names it. Bars rise from a
// shared baseline with 4px rounded tops; hovering a day shows its value.
function DailyBars({ title, unit, days, pick }: { title: string; unit: string; days: Day[]; pick: (d: Day) => number }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const label = (ts: number) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
  const shown = hover ?? days.length - 1;
  return (
    <figure className="hl-card m-0 p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold">{title}</span>
        <span className="text-[13px] text-muted-foreground">
          {label(days[shown].day)}: <strong className="hl-terminal font-semibold text-foreground">{values[shown]}</strong> {unit}
        </span>
      </figcaption>
      <div className="relative mt-5 h-40" onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden="true" />
        <span className="hl-terminal absolute -top-2.5 right-0 bg-card pl-1 text-[12px] text-muted-foreground" aria-hidden="true">
          {max}
        </span>
        <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden="true">
          {values.map((v, i) => (
            <div
              key={days[i].day}
              className="flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
            >
              <div
                className="w-full rounded-t-[4px] transition-opacity"
                style={{
                  height: `${v === 0 ? 0 : Math.max(3, (v / max) * 100)}%`,
                  background: "var(--brand-chart)",
                  opacity: hover === null || hover === i ? 1 : 0.45,
                }}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 border-t border-border" aria-hidden="true" />
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-muted-foreground" aria-hidden="true">
        <span>{label(days[0].day)}</span>
        <span>{total} in 14 days</span>
        <span>{label(days[days.length - 1].day)}</span>
      </div>
      <table className="sr-only">
        <caption>{title}, last 14 days</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.day}>
              <td>{label(d.day)}</td>
              <td>{values[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function RunsTable() {
  const runs = useQuery(api.admin.listAllRuns) ?? [];
  const removeRun = useMutation(api.admin.removeRun);
  const [confirmId, setConfirmId] = useState<Id<"runs"> | null>(null);

  async function handleRemove() {
    if (!confirmId) return;
    try {
      await removeRun({ runId: confirmId });
      toast.success("Run removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Removal failed");
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <div className="hl-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="hidden md:table-cell">Shape</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Spend</TableHead>
            <TableHead className="hidden lg:table-cell">Started</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                No takeovers have been run yet.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="max-w-[220px]">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="hl-terminal truncate text-[13px] text-muted-foreground">{r.repoUrl}</p>
                </TableCell>
                <TableCell className="text-sm">{r.owner}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline" className="px-2 py-0.5 text-[13px] font-normal capitalize">
                    {r.shape}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium capitalize"
                    style={
                      r.status === "success"
                        ? { background: "var(--heirloom-accent-soft)", color: "var(--heirloom-accent-strong)" }
                        : r.status === "failed" || r.status === "partial"
                          ? { background: "var(--heirloom-red-soft)", color: "var(--heirloom-red)" }
                          : r.status === "fixing"
                            ? { background: "var(--heirloom-amber-soft)", color: "var(--heirloom-amber-strong)" }
                            : { background: "var(--muted)", color: "var(--muted-foreground)" }
                    }
                  >
                    {r.status}
                  </span>
                </TableCell>
                <TableCell className="hl-terminal hidden text-sm sm:table-cell">
                  ${r.creditsUsed.toFixed(2)}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {fmtDateTime(r.startedAt)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Delete run ${r.name}`}
                    onClick={() => setConfirmId(r._id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={Boolean(confirmId)} onOpenChange={(open) => !open && setConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this run?</DialogTitle>
            <DialogDescription>
              The run, its timeline and its evidence are deleted for the owner
              too. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove}>
              Remove run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ROLE_OPTIONS = ["admin", "member", "user"] as const;

function UsersTable() {
  const users = useQuery(api.admin.listUsers) ?? [];
  const setRole = useMutation(api.admin.setRole);
  const deleteUser = useMutation(api.admin.deleteUser);
  const [roleTarget, setRoleTarget] = useState<{ id: Id<"users">; role: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: Id<"users">; label: string } | null>(null);

  async function handleRoleChange() {
    if (!roleTarget) return;
    try {
      await setRole({ userId: roleTarget.id, role: roleTarget.role as "admin" | "member" | "user" });
      toast.success("Role updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Role change failed");
    } finally {
      setRoleTarget(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser({ userId: deleteTarget.id });
      toast.success("User and all of their runs removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="hl-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="hidden sm:table-cell">Runs</TableHead>
            <TableHead className="hidden md:table-cell">Spend</TableHead>
            <TableHead className="hidden lg:table-cell">Joined</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u._id}>
              <TableCell className="max-w-[240px]">
                <p className="truncate text-sm font-medium">
                  {u.isAnonymous ? "Guest session" : u.name || u.email || "Unknown"}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {u.email ?? (u.isAnonymous ? "anonymous" : "no email on file")}
                </p>
              </TableCell>
              <TableCell>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium capitalize"
                  style={
                    u.role === "admin"
                      ? { background: "var(--heirloom-violet-soft)", color: "var(--heirloom-violet)" }
                      : { background: "var(--muted)", color: "var(--muted-foreground)" }
                  }
                >
                  {u.role}
                </span>
              </TableCell>
              <TableCell className="hidden text-sm sm:table-cell">{u.runs}</TableCell>
              <TableCell className="hl-terminal hidden text-sm md:table-cell">
                ${u.creditsUsed.toFixed(2)}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                {fmtDateTime(u.joinedAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-[13px]"
                    onClick={() => setRoleTarget({ id: u._id, role: u.role })}
                  >
                    Change role
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Delete user ${u.email ?? u.name ?? "unknown"}`}
                    onClick={() =>
                      setDeleteTarget({ id: u._id, label: u.name || u.email || "this user" })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Change role dialog */}
      <Dialog open={Boolean(roleTarget)} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Admins manage this console. Members and users work in the
              takeover workspace.
            </DialogDescription>
          </DialogHeader>
          {roleTarget && (
            <div className="grid gap-2 py-1">
              <Select
                value={roleTarget.role}
                onValueChange={(value) => setRoleTarget({ ...roleTarget, role: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange}>Save role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.label}?</DialogTitle>
            <DialogDescription>
              Every takeover, evidence entry and usage record they own is
              deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
