import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[var(--brand-night)] p-6 text-white">
      <div className="max-w-lg">
        <p className="text-[13px] font-medium text-[var(--brand-action)]">404 · unverified</p>
        <h1 className="mt-3 text-5xl font-semibold leading-none tracking-[-0.045em] sm:text-6xl">This page has no receipt.</h1>
        <p className="mt-5 text-[17px] text-white/70">
          We looked for it and found nothing, so we are saying so instead of guessing.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild className="bg-[var(--brand-action)] text-[var(--brand-action-ink)] hover:bg-[var(--brand-action)]/90">
            <Link to="/">Back to Heirloom</Link>
          </Button>
          <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
            <Link to="/sample">See a real run</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
