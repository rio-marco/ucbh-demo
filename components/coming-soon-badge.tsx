import { Clock3 } from "lucide-react";

export default function ComingSoonBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          : "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground shadow-sm"
      }
    >
      <Clock3 className={compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
      Coming soon
    </span>
  );
}
