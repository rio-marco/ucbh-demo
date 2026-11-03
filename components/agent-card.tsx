import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import type { Agent } from "@/lib/types";

export default function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agent/${agent.id}`}
      className="bai-card bai-lift group flex flex-col overflow-hidden p-5"
    >
      <div className="flex items-start justify-between">
        <span
          className="grid h-11 w-11 place-items-center rounded-xl border border-ink/10 font-display text-[19px] font-bold shadow-sm"
          style={{ background: `${agent.accent}55` }}
        >
          {agent.name[0]}
        </span>
        <span className="chip">Agent AI</span>
      </div>
      <h3 className="mt-4 font-display text-[24px] font-bold leading-none">
        {agent.name}
      </h3>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {agent.role}
      </p>
      <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-ink/60">
        {agent.tagline}
      </p>
      <ul className="mt-4 space-y-1.5">
        {agent.capabilities.map((capability) => (
          <li
            key={capability}
            className="flex items-center gap-2 text-[12px] text-ink/65"
          >
            <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500/10 text-emerald-700">
              <Check className="h-2.5 w-2.5" />
            </span>
            {capability}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-end border-t border-ink/8 pt-4">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-[11.5px] font-medium shadow-sm transition-colors group-hover:border-primary/25 group-hover:text-primary">
          Start task
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
