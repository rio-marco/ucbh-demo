import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  FileText,
  Layers,
  Sparkles,
  Timer,
} from "lucide-react";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { AGENTS } from "@/data/agents";
import { getAgentStats } from "@/lib/sessions";

export const dynamic = "force-dynamic";

const number = (value: number) => value.toLocaleString("en-US");

function timeAgo(value: string | null) {
  if (!value) return "No runs yet";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function AgentDetails({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const agent = AGENTS.find((item) => item.id === agentId);
  if (!agent) notFound();

  const stats = await getAgentStats(agent.id);
  const totalTokens = Math.max(stats.totalTokens, 0);
  const inputShare = totalTokens
    ? Math.round((stats.inputTokens / totalTokens) * 100)
    : 0;
  const outputShare = totalTokens ? 100 - inputShare : 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink/8 bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
          <Link href="/">
            <Logo compact />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:py-11">
        <nav className="flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          <Link href="/" className="hover:text-ink">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-ink">{agent.name}</span>
        </nav>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="bai-card relative overflow-hidden p-6 md:p-8">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-40 blur-2xl"
              style={{ background: agent.accent }}
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-ink/10 font-display text-3xl font-bold shadow-sm"
                  style={{ background: `${agent.accent}66` }}
                >
                  {agent.name[0]}
                </span>
                <div>
                  <p className="label">Agent details</p>
                  <h1 className="mt-2 font-display text-4xl font-bold leading-none">
                    {agent.name}
                  </h1>
                  <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                    {agent.role}
                  </p>
                </div>
              </div>
            </div>
            <p className="relative mt-5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              {agent.tagline}
            </p>
            <div className="relative mt-6 flex flex-wrap gap-2">
              {agent.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-paper/80 px-2.5 py-1.5 text-[11px] text-ink/70"
                >
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  {capability}
                </span>
              ))}
            </div>
            <div className="relative mt-7 flex flex-wrap items-center gap-3 border-t border-ink/8 pt-5">
              <Button asChild>
                <Link href={`/agent/${agent.id}`}>
                  Open the workspace
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <p className="text-[10.5px] text-muted-foreground">
                Runs in an isolated workspace · prepare your task next
              </p>
            </div>
          </div>

          <div className="bai-card p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="label">Tokens used</p>
                <p className="mt-2 font-display text-4xl font-bold leading-none">
                  {number(totalTokens)}
                </p>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  across {number(stats.totalRuns)} agent session
                  {stats.totalRuns === 1 ? "" : "s"}
                </p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Coins className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-ink/8">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${inputShare}%` }}
              />
              <div
                className="h-full bg-amber-400"
                style={{ width: `${outputShare}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
              <div className="rounded-lg bg-paper/70 px-2.5 py-2">
                <p className="text-muted-foreground">Input</p>
                <p className="mt-0.5 font-semibold">
                  {number(stats.inputTokens)}
                </p>
              </div>
              <div className="rounded-lg bg-paper/70 px-2.5 py-2">
                <p className="text-muted-foreground">Output</p>
                <p className="mt-0.5 font-semibold">
                  {number(stats.outputTokens)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Layers,
              label: "Sessions",
              value: number(stats.totalRuns),
              note: `${number(stats.acceptedRuns)} accepted`,
            },
            {
              icon: FileText,
              label: "Files generated",
              value: number(stats.filesGenerated),
              note: "ready to download",
            },
            {
              icon: Timer,
              label: "Last activity",
              value: timeAgo(stats.lastRunAt),
              note: "Agent runtime",
            },
          ].map((item) => (
            <div key={item.label} className="bai-card-flat p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {item.label}
                </p>
                <item.icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-3 font-display text-xl font-bold leading-none">
                {item.value}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {item.note}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-4 bai-card p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="label">What happens next</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                Open the workspace to prepare your task, upload CSV files, and
                review the estimate. The workspace shows the live agent process,
                a step-by-step progress bar, and the session history at the
                bottom. Dashboard and agent details stay history-free.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
