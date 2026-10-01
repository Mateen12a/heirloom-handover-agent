import { useAuth } from "@/hooks/use-auth";
import { HeirloomLogo } from "@/components/HeirloomLogo";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router";

export function SiteFooter() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <HeirloomLogo />
            <p className="max-w-sm text-sm text-muted-foreground">
              Proof-backed handover for inherited codebases. Every claim links
              to a command the agent actually ran.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <Link
              to="/catalog"
              className="transition-colors hover:text-foreground"
            >
              Playbook catalog
            </Link>
            <a
              href="https://github.com/nebius/token-factory-cookbook"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Nebius cookbook
            </a>
            <a
              href="https://build.nvidia.com/nvidia"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              NVIDIA open models
            </a>
            <a
              href="https://tavily.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Tavily
            </a>
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
                Open workspace
              </Button>
            ) : (
              <Link to="/auth?returnTo=%2Fdashboard">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
        <p className="mt-8 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Built for the Nebius × NVIDIA Global AI Hackathon · Running on Nebius
          Token Factory with NVIDIA Nemotron models · OSS under MIT
        </p>
      </div>
    </footer>
  );
}
