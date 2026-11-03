import { cn } from "@/lib/utils";

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "relative grid h-9 w-9 place-items-center overflow-hidden rounded-[12px] bg-gradient-to-br from-primary to-[#8b7cf6] font-display text-[19px] font-bold leading-none text-white shadow-[0_8px_20px_-10px_rgba(91,91,214,0.8)]",
          compact && "h-8 w-8 rounded-[10px] text-[17px]",
        )}
      >
        <span className="-mt-0.5">u</span>
        <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-sun" />
      </div>
      {!compact && (
        <div className="leading-none">
          <span className="font-display text-[15px] font-bold tracking-tight">
            UCBH
          </span>
          <span className="mt-1 block font-mono text-[8.5px] uppercase tracking-[0.18em] text-muted-foreground">
            Agent platform
          </span>
        </div>
      )}
    </div>
  );
}
