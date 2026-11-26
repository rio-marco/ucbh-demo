import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import ComingSoonBadge from "@/components/coming-soon-badge";
import type { Agent } from "@/lib/types";

export default function AgentCard({ agent }: { agent: Agent }) {
  const comingSoon = Boolean(agent.comingSoon);

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border font-display text-lg font-bold text-foreground"
          style={{ background: `${agent.accent}1A` }}
        >
          {agent.name[0]}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
            comingSoon
              ? "bg-muted text-muted-foreground"
              : "bg-primary/5 text-primary"
          }`}
        >
          {comingSoon ? "Coming soon" : "Available"}
        </span>
      </div>

      <h3 className="mt-5 font-display text-lg font-semibold">{agent.name}</h3>
      <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {agent.role}
      </p>
      <p className="mt-3 flex-1 text-[13px] leading-6 text-muted-foreground">
        {agent.tagline}
      </p>

      <ul className="mt-4 space-y-2">
        {agent.capabilities.map((capability) => (
          <li
            key={capability}
            className="flex items-center gap-2 text-[12.5px] text-foreground/75"
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-700">
              <Check className="h-2.5 w-2.5" />
            </span>
            {capability}
          </li>
        ))}
      </ul>

      {!comingSoon && (
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[13px] font-semibold text-primary">
          View agent
          <ArrowUpRight className="h-4 w-4" />
        </div>
      )}
    </>
  );

  if (comingSoon) {
    return (
      <div
        aria-disabled="true"
        className="relative flex cursor-not-allowed flex-col rounded-xl border border-dashed border-border bg-muted/30 p-5"
      >
        <div className="flex flex-col opacity-55">{content}</div>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <ComingSoonBadge />
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="bai-card bai-lift group flex flex-col p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}
