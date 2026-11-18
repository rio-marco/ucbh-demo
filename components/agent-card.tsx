import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import type { Agent } from "@/lib/types";

export default function AgentCard({ agent }: { agent: Agent }) {
  const comingSoon = Boolean(agent.comingSoon);

  const content = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={`grid h-11 w-11 place-items-center rounded-xl border font-display text-[19px] font-bold ${
            comingSoon
              ? "border-white/25 text-white"
              : "border-ink/10 text-ink shadow-sm"
          }`}
          style={{ background: `${agent.accent}55` }}
        >
          {agent.name[0]}
        </span>
        <span
          className={
            comingSoon
              ? "rounded-full border border-white/25 bg-white/10 px-2.5 py-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-white/80"
              : "chip"
          }
        >
          Agent AI
        </span>
      </div>
      <h3 className="mt-4 font-display text-[24px] font-bold leading-none">
        {agent.name}
      </h3>
      <p
        className={`mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
          comingSoon ? "text-blue-100/80" : "text-muted-foreground"
        }`}
      >
        {agent.role}
      </p>
      <p
        className={`mt-3 flex-1 text-[12.5px] leading-relaxed ${
          comingSoon ? "text-blue-100/80" : "text-ink/60"
        }`}
      >
        {agent.tagline}
      </p>
      <ul className="mt-4 space-y-1.5">
        {agent.capabilities.map((capability) => (
          <li
            key={capability}
            className={`flex items-center gap-2 text-[12px] ${
              comingSoon ? "text-blue-50/85" : "text-ink/65"
            }`}
          >
            <span
              className={`grid h-3.5 w-3.5 place-items-center rounded-full ${
                comingSoon
                  ? "bg-emerald-300/20 text-emerald-200"
                  : "bg-emerald-500/10 text-emerald-700"
              }`}
            >
              <Check className="h-2.5 w-2.5" />
            </span>
            {capability}
          </li>
        ))}
      </ul>
      {!comingSoon && (
        <div className="mt-5 flex items-center justify-end border-t border-ink/8 pt-4">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-[11.5px] font-medium shadow-sm transition-colors group-hover:border-primary/25 group-hover:text-primary">
            View agent
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      )}
    </>
  );

  if (comingSoon) {
    return (
      <div
        aria-disabled="true"
        className="relative flex cursor-not-allowed flex-col overflow-hidden rounded-[1.45rem] border border-blue-300/30 bg-gradient-to-br from-blue-700 to-blue-950 p-5 text-white shadow-md"
      >
        <div className="flex flex-col opacity-40">{content}</div>
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-blue-950/20">
          <span className="rounded-full bg-white px-5 py-2 font-display text-[14px] font-bold uppercase tracking-[0.16em] text-blue-800 shadow-xl ring-4 ring-white/20">
            Coming Soon
          </span>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="bai-card bai-lift group flex flex-col overflow-hidden p-5"
    >
      {content}
    </Link>
  );
}
