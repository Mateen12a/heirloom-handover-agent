import { cn } from "@/lib/utils";

/** Heirloom mark: a navy tile holding one orange record. Same mark as the
 *  landing page; colours come from the brand tokens. */
export function HeirloomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" fill="var(--brand-ink)" />
      <rect x="10" y="10" width="12" height="12" rx="2.5" fill="var(--brand-action)" />
    </svg>
  );
}

export function HeirloomLogo({
  className,
  markClassName,
  compact = false,
}: {
  className?: string;
  markClassName?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <HeirloomMark className={markClassName} />
      {!compact && (
        <span className="whitespace-nowrap font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[-0.02em]">
          Heirloom{" "}
          <span className="hidden text-muted-foreground sm:inline">Handover Agent</span>
        </span>
      )}
    </span>
  );
}
