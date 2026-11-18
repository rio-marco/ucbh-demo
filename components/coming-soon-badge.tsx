import { Clock3 } from "lucide-react";

export const COMING_SOON_SURFACE =
  "border border-blue-300/30 bg-gradient-to-br from-blue-700 to-blue-950 text-white";

export default function ComingSoonBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800 shadow-sm"
          : "inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 font-display text-[14px] font-bold uppercase tracking-[0.16em] text-blue-800 shadow-xl ring-4 ring-white/20"
      }
    >
      <Clock3 className={compact ? "h-2.5 w-2.5" : "h-4 w-4"} />
      Coming Soon
    </span>
  );
}
