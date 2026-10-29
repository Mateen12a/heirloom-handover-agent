import { useAuth } from "@/hooks/use-auth";
import { HeirloomLogo } from "@/components/HeirloomLogo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogOut, ChevronDown, LayoutDashboard, Menu, ShieldCheck } from "lucide-react";
import { useNavigate, Link } from "react-router";
import { useState } from "react";

const NAV_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Proof, not promises", href: "/#proof" },
  { label: "Playbooks", href: "/catalog" },
  { label: "Built with", href: "/#built-with" },
];

export function SiteHeader() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeAnd = (go: () => void) => () => {
    setMenuOpen(false);
    go();
  };

  return (
    <header className="sticky top-0 z-40 bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-1">
          <Link to="/" className="transition-opacity hover:opacity-80">
            <HeirloomLogo />
          </Link>
        </div>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) =>
            l.href.startsWith("/#") ? (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                to={l.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="h-9 w-20 rounded-md bg-muted" />
          ) : isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <span className="max-w-[140px] truncate">
                    {user?.name || user?.email || "Account"}
                  </span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[13px] font-normal text-muted-foreground">
                  Signed in
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                  <LayoutDashboard className="size-4" />
                  Workspace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <ShieldCheck className="size-4" />
                  Admin console
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="ghost"
                className="hidden sm:inline-flex"
                onClick={() => navigate("/auth")}
              >
                Sign in
              </Button>
              <Button className="hidden sm:inline-flex" onClick={() => navigate("/dashboard")}>
                Open workspace
              </Button>
            </>
          )}

          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="text-left text-sm font-medium text-muted-foreground">
                  Heirloom Handover Agent
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {NAV_LINKS.map((l) =>
                  l.href.startsWith("/#") ? (
                    <a
                      key={l.href}
                      href={l.href}
                      onClick={closeAnd(() => {}) }
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.href}
                      to={l.href}
                      onClick={closeAnd(() => {})}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {l.label}
                    </Link>
                  ),
                )}
              </nav>
              <div className="mt-auto flex flex-col gap-2 p-4">
                {isAuthenticated ? (
                  <>
                    <Button variant="outline" className="w-full" onClick={closeAnd(() => navigate("/dashboard"))}>
                      <LayoutDashboard className="size-4" />
                      Workspace
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={closeAnd(async () => {
                        await signOut();
                        navigate("/");
                      })}
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button className="w-full" onClick={closeAnd(() => navigate("/auth"))}>
                      Sign in
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={closeAnd(() => navigate("/dashboard"))}
                    >
                      Open workspace
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
