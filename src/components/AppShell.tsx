import { BookOpen, FileCheck2, House, LayoutDashboard, LogIn, LogOut, Plus, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { HeirloomMark } from "@/components/HeirloomLogo";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// The app frame for every dashboard page. Desktop: a floating dark sidebar
// fixed to the left. Phone: a slim top bar and a floating bottom tab bar
// within thumb reach, with "new takeover" in the middle.

type Item = { to: string; label: string; short: string; icon: typeof House };

const BASE: Item[] = [
  { to: "/dashboard", label: "Workspace", short: "Workspace", icon: LayoutDashboard },
  { to: "/sample", label: "Sample run", short: "Sample", icon: FileCheck2 },
  { to: "/catalog", label: "Playbooks", short: "Playbooks", icon: BookOpen },
];
const ADMIN: Item = { to: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck };
const HOME: Item = { to: "/", label: "Home", short: "Home", icon: House };

export function AppShell({ children, onNewTakeover }: { children: ReactNode; onNewTakeover?: () => void }) {
  const { user, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "admin";
  const items = isAdmin ? [...BASE, ADMIN] : BASE;
  const tabs = isAdmin ? [BASE[0], BASE[1], BASE[2], ADMIN] : [BASE[0], BASE[1], BASE[2], HOME];
  const who = user?.isAnonymous ? "Guest session" : user?.name || user?.email || "Signed in";

  const newTakeover = () => (onNewTakeover ? onNewTakeover() : navigate("/dashboard?new=1"));
  const leave = async () => {
    await signOut();
    navigate("/");
  };
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="hl-canvas min-h-svh">
      {/* Desktop: floating sidebar */}
      <aside className="fixed inset-y-3 left-3 z-40 hidden w-[244px] flex-col rounded-[22px] bg-[var(--brand-night)] p-3 text-white lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-2 pb-5 pt-2 font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[-0.02em]">
          <HeirloomMark className="size-7 [&>rect:first-child]:fill-white" />
          Heirloom
        </Link>

        <button
          type="button"
          onClick={newTakeover}
          className="mb-4 flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--brand-action)] text-[14px] font-semibold text-[var(--brand-action-ink)] transition-transform hover:-translate-y-px active:translate-y-px"
        >
          <Plus className="size-4" />
          New takeover
        </button>

        <nav aria-label="App" className="flex flex-col gap-1">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active(it.to) ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white",
                active(it.to) && "bg-white/10 text-white",
              )}
            >
              <it.icon className="size-[18px]" />
              {it.label}
              {active(it.to) && <span className="ml-auto size-1.5 rounded-full bg-[var(--brand-action)]" />}
            </Link>
          ))}
          <Link
            to="/"
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <House className="size-[18px]" />
            Home
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <div className="rounded-xl bg-white/[0.06] p-3 text-[12px] leading-5 text-white/60">
            <span className="mb-1 flex items-center gap-2 font-medium text-white">
              <span className="size-1.5 rounded-full bg-[#3ccf7a]" />
              Nemotron 3 Ultra
            </span>
            Planning on Nebius Token Factory; Nemotron 3 Nano runs the loop.
          </div>
          {isAuthenticated ? (
            <div className="flex items-center gap-2 rounded-xl p-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] font-semibold">
                {who.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{who}</span>
              <button
                type="button"
                onClick={leave}
                aria-label="Sign out"
                className="grid size-8 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="flex h-10 items-center justify-center gap-2 rounded-full bg-white/10 text-[14px] font-medium transition-colors hover:bg-white/15"
            >
              <LogIn className="size-4" />
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* Phone and tablet: top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-[var(--brand-page)]/95 px-4 lg:hidden">
        <Link to="/" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[17px] font-bold tracking-[-0.02em]">
          <HeirloomMark className="size-7" />
          Heirloom
        </Link>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={leave}
            className="flex h-9 items-center gap-2 rounded-full bg-white px-3 text-[13px] font-medium ring-1 ring-black/5"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        ) : (
          <Link to="/auth" className="flex h-9 items-center rounded-full bg-[var(--brand-ink)] px-4 text-[13px] font-medium text-white">
            Sign in
          </Link>
        )}
      </header>

      <div className="pb-28 lg:pb-0 lg:pl-[268px]">{children}</div>

      {/* Phone and tablet: floating bottom tabs */}
      <nav
        aria-label="App"
        className="fixed inset-x-3 bottom-3 z-40 grid h-16 grid-cols-5 items-center rounded-[22px] bg-[var(--brand-night)] px-1 text-white shadow-[0_12px_32px_rgba(13,20,36,0.28)] lg:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.slice(0, 2).map((it) => (
          <Tab key={it.to} item={it} on={active(it.to)} />
        ))}
        <button
          type="button"
          onClick={newTakeover}
          aria-label="New takeover"
          className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--brand-action)] text-[var(--brand-action-ink)] transition-transform active:scale-95"
        >
          <Plus className="size-5" />
        </button>
        {tabs.slice(2).map((it) => (
          <Tab key={it.to} item={it} on={active(it.to)} />
        ))}
      </nav>
    </div>
  );
}

function Tab({ item, on }: { item: Item; on: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-white/60 transition-colors",
        on && "text-white",
      )}
    >
      <item.icon className={cn("size-5", on && "text-[var(--brand-action)]")} />
      {item.short}
    </Link>
  );
}
