import { cn } from "@/lib/utils";

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "grid h-9 w-9 place-items-center rounded-[10px] bg-primary font-display text-[19px] font-bold leading-none text-primary-foreground",
          compact && "h-8 w-8 text-[17px]",
        )}
      >
        <span className="-mt-0.5">u</span>
      </div>
      {!compact && (
        <div className="leading-none">
          <span className="font-display text-[15px] font-bold tracking-tight text-foreground">
            UCBH
          </span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Agent platform
          </span>
        </div>
      )}
    </div>
  );
}
