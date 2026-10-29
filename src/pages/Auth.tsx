import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { HeirloomMark } from "@/components/HeirloomLogo";
import { Loader2, Lock, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

// Convex Auth reports failures as terse server errors; turn the ones a person
// can act on into plain sentences and never show a raw stack.
function readable(error: unknown, flow: "signIn" | "signUp"): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/SITE_URL|JWT_PRIVATE_KEY|JWKS/i.test(msg)) {
    return "Account sign-in isn't configured on the server yet. Continue as a guest for now.";
  }
  if (/InvalidSecret|InvalidAccountId|Invalid credentials/i.test(msg)) {
    return flow === "signIn"
      ? "That email and password don't match. New here? Switch to Create account."
      : "Could not create the account. Try signing in instead.";
  }
  if (/already exists/i.test(msg)) return "An account with that email already exists. Sign in instead.";
  if (/Invalid password/i.test(msg)) return "Use a password of at least 8 characters.";
  if (/TooManyFailedAttempts|rate/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  return flow === "signIn" ? "Sign-in failed. Check your details and try again." : "Could not create the account. Try again.";
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState<"password" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect);
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handlePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("password");
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      form.set("flow", flow);
      await signIn("password", form);
      navigate(redirect);
    } catch (err) {
      console.error("Password sign-in error:", err);
      setError(readable(err, flow));
      setBusy(null);
    }
  };

  const handleGuest = async () => {
    setBusy("guest");
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (err) {
      console.error("Guest sign-in error:", err);
      setError("Guest sign-in failed. Try again in a moment.");
      setBusy(null);
    }
  };

  const isNew = flow === "signUp";

  return (
    <div className="hl-canvas relative flex min-h-svh">
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-[var(--brand-night)] p-10 text-white lg:flex">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex w-fit items-center gap-2.5 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight"
        >
          <HeirloomMark className="size-7 [&>rect:first-child]:fill-white" />
          Heirloom
        </button>
        <div>
          <h2 className="max-w-md text-5xl font-semibold leading-[0.98] tracking-[-0.045em]">Every claim, run and verified.</h2>
          <ul className="mt-8 flex max-w-sm flex-col gap-3 text-[15px] text-white/75">
            <li className="flex gap-3"><span className="mt-2 size-2 shrink-0 rounded-full bg-[var(--brand-action)]" />Point it at any public GitHub repository.</li>
            <li className="flex gap-3"><span className="mt-2 size-2 shrink-0 rounded-full bg-[var(--brand-action)]" />Nemotron plans; a sandbox runs the real tests.</li>
            <li className="flex gap-3"><span className="mt-2 size-2 shrink-0 rounded-full bg-[var(--brand-action)]" />Get a handover pack where every line has a receipt.</li>
          </ul>
        </div>
        <p className="text-[13px] text-white/50">Built on NVIDIA Nemotron and Nebius Token Factory.</p>
      </aside>

      <div className="relative flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-[400px] rounded-[22px] bg-card p-7 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-8">
          <button type="button" aria-label="Back to home" onClick={() => navigate("/")} className="transition-opacity hover:opacity-80">
            <HeirloomMark className="size-10" />
          </button>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">{isNew ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
            {isNew
              ? "Keep your takeovers, evidence ledgers and handover packs under one login."
              : "Sign in to see your takeovers, evidence ledgers and handover packs."}
          </p>

          <div role="tablist" aria-label="Account" className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            {(["signIn", "signUp"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={flow === f}
                onClick={() => {
                  setFlow(f);
                  setError(null);
                }}
                className={`h-9 rounded-full text-[13px] font-medium transition-colors ${flow === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f === "signIn" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={handlePassword} className="mt-5 flex flex-col gap-3">
            <label className="relative block">
              <span className="sr-only">Email</span>
              <Mail className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input name="email" type="email" autoComplete="email" placeholder="name@example.com" className="pl-9" disabled={busy !== null} required />
            </label>
            <label className="relative block">
              <span className="sr-only">Password</span>
              <Lock className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input
                name="password"
                type="password"
                autoComplete={isNew ? "new-password" : "current-password"}
                placeholder={isNew ? "Password, 8 characters or more" : "Password"}
                minLength={8}
                className="pl-9"
                disabled={busy !== null}
                required
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-[var(--brand-bad-soft)] px-3 py-2.5 text-[13px] leading-5 text-[var(--brand-bad)]">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy !== null}>
              {busy === "password" && <Loader2 className="size-4 animate-spin" />}
              {isNew ? "Create account" : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleGuest} disabled={busy !== null}>
            {busy === "guest" ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
            Continue as guest
          </Button>
          <p className="mt-3 text-center text-[12px] leading-5 text-muted-foreground">
            Guests can run takeovers straight away. Runs stay with this browser.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
