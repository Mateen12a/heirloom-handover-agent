import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Activity,
  Coins,
  FlaskConical,
  Loader2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!overview.isAdmin && !overview.canBootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="hl-card max-w-md p-8 text-center">
          <TriangleAlert className="mx-auto size-8" style={{ color: "var(--heirloom-amber)" }} />
          <h1 className="mt-4 text-lg font-semibold">Not authorized</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your account does not have admin access. Ask an existing admin to
            grant you the admin role from this console.
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
    <div className="flex min-h-screen items-center justify-center hl-canvas p-6">
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
          className="mt-3 block text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}

function AdminConsole() {
  return (
    <div className="hl-canvas min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <HeirloomLogo />
            </Link>
            <Badge
              variant="outline"
              className="hidden px-2 py-0.5 text-[11px] font-medium sm:inline-flex"
              style={{
                color: "var(--heirloom-violet)",
                borderColor: "var(--heirloom-violet)",
                background: "var(--heirloom-violet-soft)",
              }}
            >
              Admin console
            </Badge>
          </div>
          <Link to="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Workspace
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Platform administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Users, roles, runs and spend, in one view.
        </p>
        <PlatformStats />
        <Tabs defaultValue="runs" className="mt-8 gap-0">
          <TabsList>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>
          <TabsContent value="runs" className="mt-4">
            <RunsTable />
          </TabsContent>
          <TabsContent value="users" className="mt-4">
            <UsersTable />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function PlatformStats() {
  const overview = useQuery(api.admin.overview);
  const t = overview?.totals;

  const cards = [
    { icon: Users, label: "Users", value: t ? String(t.users) : "…", sub: t ? `${t.newUsers24h} joined in 24 h` : undefined },
    { icon: FlaskConical, label: "Takeovers", value: t ? String(t.runs) : "…", sub: t ? `${t.activeRuns} active now` : undefined },
    { icon: Activity, label: "Live staging", value: t ? String(t.liveStaging) : "…" },
    { icon: Coins, label: "Platform spend", value: t ? `$${t.credits.toFixed(2)}` : "…", sub: t ? `${t.tokens.toLocaleString()} tokens` : undefined },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="hl-card p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 items-center justify-center rounded-lg"
              style={{ background: "var(--heirloom-violet-soft)", color: "var(--heirloom-violet)" }}
            >
              <c.icon className="size-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
          </div>
          <p className="hl-terminal mt-3 text-2xl font-semibold tracking-tight">{c.value}</p>
          {c.sub && <p className="mt-1 text-[11px] text-muted-foreground">{c.sub}</p>}
        </div>
      ))}
    </div>
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
                  <p className="hl-terminal truncate text-[11px] text-muted-foreground">{r.repoUrl}</p>
                </TableCell>
                <TableCell className="text-sm">{r.owner}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline" className="px-2 py-0.5 text-[11px] font-normal capitalize">
                    {r.shape}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
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
                <p className="truncate text-[11px] text-muted-foreground">
                  {u.email ?? (u.isAnonymous ? "anonymous" : "no email on file")}
                </p>
              </TableCell>
              <TableCell>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
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
                    className="h-8 px-2 text-xs"
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
