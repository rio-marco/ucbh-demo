import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  FileText,
  Layers,
  Timer,
} from "lucide-react";
import SiteHeader from "@/components/site-header";
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
  if (!agent || agent.comingSoon) notFound();

  const stats = await getAgentStats(agent.id);
  const totalTokens = Math.max(stats.totalTokens, 0);
  const inputShare = totalTokens
    ? Math.round((stats.inputTokens / totalTokens) * 100)
    : 0;
  const outputShare = totalTokens ? 100 - inputShare : 0;

  return (
    <div className="min-h-screen">
      <SiteHeader
        actions={
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Overview
          </Link>
        }
      />

      <main className="page-container py-8 md:py-12">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <Link href="/" className="hover:text-foreground">
            Overview
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-foreground">{agent.name}</span>
        </nav>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="bai-card p-6 md:p-8">
            <div className="flex flex-wrap items-start gap-4">
              <span
                className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border font-display text-2xl font-bold text-foreground"
                style={{ background: `${agent.accent}1A` }}
              >
                {agent.name[0]}
              </span>
              <div>
                <p className="label">Agent profile</p>
                <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                  {agent.name}
                </h1>
                <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {agent.role}
                </p>
              </div>
            </div>

            <p className="mt-6 max-w-xl text-[14px] leading-7 text-muted-foreground">
              {agent.tagline}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {agent.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[12px] text-foreground/75"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {capability}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-border pt-6">
              <Button asChild>
                <Link href={`/agent/${agent.id}`}>
                  Open workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <p className="text-[12px] text-muted-foreground">
                Each run uses an isolated workspace.
              </p>
            </div>
          </div>

          <div className="bai-card p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label">Token usage</p>
                <p className="mt-3 font-display text-3xl font-semibold tracking-tight">
                  {number(totalTokens)}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  across {number(stats.totalRuns)} run
                  {stats.totalRuns === 1 ? "" : "s"}
                </p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/[0.07] text-primary">
                <Coins className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${inputShare}%` }}
              />
              <div
                className="h-full bg-accent"
                style={{ width: `${outputShare}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="surface-muted px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Input</p>
                <p className="mt-1 text-[13px] font-semibold tabular-nums">
                  {number(stats.inputTokens)}
                </p>
              </div>
              <div className="surface-muted px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Output</p>
                <p className="mt-1 text-[13px] font-semibold tabular-nums">
                  {number(stats.outputTokens)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Layers,
              label: "Runs",
              value: number(stats.totalRuns),
              note: `${number(stats.acceptedRuns)} accepted`,
            },
            {
              icon: FileText,
              label: "Files generated",
              value: number(stats.filesGenerated),
              note: "Available to download",
            },
            {
              icon: Timer,
              label: "Last activity",
              value: timeAgo(stats.lastRunAt),
              note: "Most recent run",
            },
          ].map((item) => (
            <div key={item.label} className="bai-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {item.label}
                </p>
                <item.icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-4 font-display text-xl font-semibold tracking-tight">
                {item.value}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {item.note}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            What happens next
          </h2>
          <div className="mt-5 grid gap-8 md:grid-cols-3 md:gap-10">
            {[
              {
                title: "Connect your accounts",
                description:
                  "Link Claude CoWork and the QuickBooks connection for this browser.",
              },
              {
                title: "Set up the task",
                description:
                  "Choose permissions, and describe the result you need.",
              },
              {
                title: "Review and decide",
                description:
                  "Follow the run, inspect the result, and accept, reject, or request an update.",
              },
            ].map((step, index) => (
              <div
                key={step.title}
                className="border-t-2 border-primary/30 pt-4"
              >
                <p className="font-mono text-[11px] font-medium text-primary">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-[14px] font-semibold">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
