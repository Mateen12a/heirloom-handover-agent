import { cn } from "@/lib/utils";

/** Heirloom mark: an angular gable (roofline over a hearth) cut from a square. */
export function HeirloomMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-current" />
      <path
        d="M8 23.5V14.4L16 8l8 6.4v9.1h-5.1v-6.1h-5.8v6.1H8Z"
        className="fill-background"
      />
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
        <span className="whitespace-nowrap text-[17px] font-semibold tracking-tight">
          Heirloom{" "}
          <span className="text-muted-foreground">Handover Agent</span>
        </span>
      )}
    </span>
  );
}
