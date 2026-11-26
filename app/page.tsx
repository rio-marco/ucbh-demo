import Link from "next/link";
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import AgentCard from "@/components/agent-card";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { AGENTS } from "@/data/agents";

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Isolated by default",
    description:
      "Each task runs in a temporary workspace that is removed afterwards.",
  },
  {
    icon: FileSpreadsheet,
    title: "Bring your own data",
    description: "Give the agent a clear brief for the outcome you need.",
  },
  {
    icon: LockKeyhole,
    title: "Connections stay with you",
    description:
      "Claude and QuickBooks connections are scoped to this browser session.",
  },
];

const STEPS = [
  {
    title: "Connect your accounts",
    description:
      "Link Claude CoWork and the QuickBooks connection, then choose what the agent may access.",
  },
  {
    title: "Prepare your task",
    description:
      "Describe the outcome you need, and select where the run should take place.",
  },
  {
    title: "Review the result",
    description:
      "Follow the run, inspect the response and generated files, then accept, reject, or request an update.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="page-container border-b border-border py-14 md:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
            <div>
              <p className="label">AI agent workspace</p>
              <h1 className="mt-5 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
                Run AI agents on your data. Review every result.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
                Choose an agent and confirm the estimate before anything runs.
                Each task executes in a temporary, isolated workspace.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="#agents">
                    Explore agents
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="line">
                  <Link href="#how-it-works">How it works</Link>
                </Button>
              </div>
            </div>

            <div className="bai-card p-6 md:p-7">
              <p className="label">How a run works</p>
              <ol className="mt-6 space-y-5">
                {[
                  {
                    icon: FileSpreadsheet,
                    title: "Prepare",
                    detail: "Files, permissions, and a clear task brief.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Execute",
                    detail: "The agent works inside an isolated workspace.",
                  },
                  {
                    icon: Download,
                    title: "Review",
                    detail: "Read the result and download generated files.",
                  },
                ].map((item, index) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/[0.07] text-primary">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold">
                        {index + 1}. {item.title}
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          className="page-container py-12 md:py-14"
          aria-label="Platform highlights"
        >
          <div className="grid gap-8 md:grid-cols-3 md:gap-10">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="text-[14px] font-semibold">{item.title}</h2>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="agents"
          className="scroll-mt-24 border-y border-border bg-card py-14 md:py-16"
        >
          <div className="page-container">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="label">Agent profiles</p>
                <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Choose the right agent for your task
                </h2>
                <p className="mt-3 max-w-2xl text-[14px] leading-7 text-muted-foreground">
                  Each profile focuses on a specific type of work. Open an agent
                  to see what it does and start a run.
                </p>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {AGENTS.filter((agent) => !agent.comingSoon).length} available ·{" "}
                {AGENTS.filter((agent) => agent.comingSoon).length} coming soon
              </p>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {AGENTS.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="page-container scroll-mt-24 py-14 md:py-20"
        >
          <div className="max-w-2xl">
            <p className="label">How it works</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
              A clear path from brief to decision
            </h2>
            <p className="mt-3 text-[14px] leading-7 text-muted-foreground">
              The workspace keeps each step visible, so you always know what the
              agent is doing and what happens next.
            </p>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="border-t-2 border-primary/30 pt-5"
              >
                <p className="font-mono text-[11px] font-medium text-primary">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-[15px] font-semibold">{step.title}</h3>
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
