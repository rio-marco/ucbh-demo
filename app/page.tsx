import AgentCard from "@/components/agent-card";
import SiteHeader from "@/components/site-header";
import { AGENTS } from "@/data/agents";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5">
        <section className="py-14 md:py-10">
          <p className="label">Agent AI · server-side execution</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight md:text-6xl">
            Give Agent a task and review the files it creates.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Choose an agent profile, upload CSV files, and confirm the estimate
            before execution. Runs use a temporary isolated workspace.
          </p>
        </section>
        <section id="agents" className="border-t border-ink/10 py-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label">Agent profiles</p>
              <h2 className="mt-2 font-display text-2xl font-bold">
                Select an agent to view details
              </h2>
            </div>
            <p className="max-w-sm text-right text-[11px] leading-relaxed text-muted-foreground">
              Dashboard → agent details → open workspace. Run history is
              available inside the workspace only.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {AGENTS.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
        <p
          id="data-handling"
          className="scroll-mt-24 border-t border-ink/10 py-6 text-xs leading-relaxed text-muted-foreground"
        >
          Run history belongs to the agent runtime, not a user account.
          There is no user sign-in, private cloud execution, or provider billing
          data. Open an agent workspace to view or clean up run history. The
          execution flow reports Agent usage where available; provider costs are
          not available from the SDK.
        </p>
      </main>
    </div>
  );
}
