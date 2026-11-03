import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Clock3,
  Coins,
  DatabaseZap,
  FileText,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import AgentResult from "@/components/agent-result";
import RunDetailsActions from "@/components/run-details-actions";
import SiteHeader from "@/components/site-header";
import { getSession } from "@/lib/sessions";
import type { SessionRecord, SessionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<SessionStatus, string> = {
  running: "Running",
  review: "Awaiting approval",
  accepted: "Accepted",
  rejected: "Rejected",
  failed: "Failed",
  cancelled: "Cancelled",
};
const number = (value: number) => value.toLocaleString("en-US");
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

function RunTrace({ session }: { session: SessionRecord }) {
  const decided =
    session.status === "accepted" || session.status === "rejected";
  const complete = session.status === "review" || decided;
  const failed = session.status === "failed" || session.status === "cancelled";
  const steps = [
    {
      title: "Brief submitted",
      detail:
        "Your task prompt and selected execution environment were recorded.",
      done: true,
    },
    {
      title: "Data secured",
      detail: `${session.files.length} uploaded file${session.files.length === 1 ? "" : "s"} staged for this run.`,
      done: session.files.length > 0,
    },
    {
      title: "Agent processed",
      detail: failed
        ? "The run stopped before a review result was issued."
        : complete
          ? `${number(session.totalTokens)} tokens reported by the agent.`
          : "Agent execution is in progress.",
      done: complete,
      failed,
    },
    {
      title: "Approval pack issued",
      detail: complete
        ? "The agent response is ready for client review."
        : failed
          ? "No approval result was issued."
          : "The result will appear here when processing completes.",
      done: complete,
      failed,
    },
    {
      title: "Client decision",
      detail:
        session.status === "accepted"
          ? "Result accepted."
          : session.status === "rejected"
            ? `Result rejected${session.reviewNote ? `: ${session.reviewNote}` : "."}`
            : session.status === "review"
              ? "Awaiting your decision."
              : "No client decision yet.",
      done: decided,
      current: session.status === "review",
    },
    {
      title: "Data cleanup",
      detail: decided
        ? "Agent runtime history and saved source copies were removed."
        : session.status === "review"
          ? "Temporary run data is retained until you accept or reject."
          : failed
            ? "The temporary execution workspace was removed after the run stopped."
            : "Cleanup follows the client decision.",
      done: decided || failed,
      current: session.status === "review",
    },
  ];
  return (
    <section className="bai-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">Run trace</p>
          <h2 className="mt-2 font-display text-xl font-bold">
            Six steps from brief to cleanup
          </h2>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">
          Run-{session.id}
        </span>
      </div>
      <ol className="mt-6">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 && (
              <span
                className={`absolute left-[15px] top-8 h-[calc(100%-1.2rem)] w-px ${step.done ? "bg-emerald-300" : "bg-ink/10"}`}
              />
            )}
            <span
              className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border ${step.failed ? "border-red-300 bg-red-50 text-red-600" : step.done ? "border-emerald-500 bg-emerald-500 text-white" : step.current ? "border-primary bg-primary/10 text-primary" : "border-ink/15 bg-white text-muted-foreground"}`}
            >
              {step.done ? (
                <Check className="h-3.5 w-3.5" />
              ) : step.failed ? (
                "!"
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            <div className="pt-0.5">
              <p className="text-xs font-semibold">{step.title}</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DataCleanupCard({ session }: { session: SessionRecord }) {
  const decided =
    session.status === "accepted" || session.status === "rejected";
  const contentAvailable = Boolean(session.sourceFiles?.length);
  return (
    <section className="bai-card p-5">
      <div className="flex items-center gap-2">
        <DatabaseZap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Data & cleanup</h2>
        <span
          className={`ml-auto rounded-full border px-2 py-1 text-[9px] ${decided ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
        >
          {decided ? "Cleaned" : "Retained for review"}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-start gap-3">
          <Layers3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="min-w-0 flex-1 flex justify-between gap-2 text-[11px] font-medium">
            <span className="truncate">Environment</span>
            <span className="shrink-0">
              {session.environment === "private"
                ? "Private workspace"
                : "Shared server"}
            </span>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium">
              Uploaded files · {session.files.length}
            </p>
            {session.files.length ? (
              <ul className="mt-2 space-y-1">
                {session.files.map((file) => (
                  <li
                    key={file.name}
                    className="flex justify-between gap-2 text-[10px] text-muted-foreground"
                  >
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[10px] text-muted-foreground">
                No uploaded files recorded.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettlementCard({ session }: { session: SessionRecord }) {
  return (
    <section className="bai-card p-5">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Settlement</h2>
      </div>
      <div className="mt-4 rounded-xl bg-paper/70 p-4">
        <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          Estimate
        </p>
        <p className="mt-2 font-display text-2xl font-bold">
          {money(session.fee)}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-ink/8 p-2.5">
          <p className="font-mono text-[8px] uppercase text-muted-foreground">
            Input
          </p>
          <p className="mt-1 text-xs font-semibold">
            {number(session.inputTokens)}
          </p>
          <p className="text-[8px] text-muted-foreground">actual tokens</p>
        </div>
        <div className="rounded-lg border border-ink/8 p-2.5">
          <p className="font-mono text-[8px] uppercase text-muted-foreground">
            Output
          </p>
          <p className="mt-1 text-xs font-semibold">
            {number(session.outputTokens)}
          </p>
          <p className="text-[8px] text-muted-foreground">actual tokens</p>
        </div>
        <div className="rounded-lg border border-ink/8 p-2.5">
          <p className="font-mono text-[8px] uppercase text-muted-foreground">
            Total
          </p>
          <p className="mt-1 text-xs font-semibold">
            {number(session.totalTokens)}
          </p>
          <p className="text-[8px] text-muted-foreground">actual tokens</p>
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        A provider charge is not available in this run record.
      </p>
    </section>
  );
}

function RunSummaryCard({ session }: { session: SessionRecord }) {
  const rows = [
    ["Agent", `${session.agentName} · ${session.agentId}`],
    [
      "Environment",
      session.environment === "private" ? "Private workspace" : "Shared server",
    ],
    ["Uploaded files", String(session.files.length)],
    ["Generated outputs", String(session.outputs)],
    ["Decision", statusLabel[session.status]],
  ];
  return (
    <section className="bai-card p-5">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Run summary</h2>
      </div>
      <dl className="mt-4 divide-y divide-ink/8">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-3 py-2.5 text-[11px]"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function RunDetailsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await getSession(decodeURIComponent(sessionId));
  if (!session) notFound();
  const { sourceFiles, ...publicSession } = session;
  const statusStyle =
    session.status === "review"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : session.status === "accepted"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : session.status === "rejected"
          ? "border-orange-200 bg-orange-50 text-orange-800"
          : "border-ink/10 bg-white text-ink/70";

  return (
    <div className="min-h-screen">
      <SiteHeader
        actions={
          <Link
            href={`/agent/${session.agentId}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Workspace
          </Link>
        }
      />
      <main className="mx-auto max-w-6xl space-y-5 px-5 py-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href={`/agent/${session.agentId}`}
              className="text-[11px] text-muted-foreground hover:text-ink"
            >
              Workspace / Run history / Details
            </Link>
            <p className="label mt-4">
              {session.agentName} ·{" "}
              {session.environment === "private"
                ? "Private workspace"
                : "Shared server"}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold">
              Run details
            </h1>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Run-{session.id} · Submitted{" "}
              {new Date(session.createdAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${statusStyle}`}
          >
            {statusLabel[session.status]}
          </span>
        </div>

        <section className="grid items-start gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <RunDetailsActions
              session={publicSession}
              canUpdate={Boolean(sourceFiles?.length)}
            />
            <section className="bai-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="label">Agent result</p>
                  <h2 className="mt-2 font-display text-xl font-bold">
                    {session.title}
                  </h2>
                </div>
                {session.outputs > 0 && (
                  <span className="chip">
                    {session.outputs} output file
                    {session.outputs === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="mt-4 rounded-xl border border-ink/8 bg-white p-4 md:p-5">
                <AgentResult
                  content={session.result}
                  emptyText="The agent has not returned a result yet."
                />
              </div>
            </section>
            <RunSummaryCard session={session} />
          </div>
          <div className="space-y-5">
            <section className="bai-card p-5 md:p-6">
              <p className="label">Brief submitted</p>
              <h2 className="mt-2 font-display text-lg font-bold">
                Task instructions
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-ink/75">
                {session.prompt || "No prompt was recorded."}
              </p>
              {session.reviewNote && (
                <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <p className="label">Client revision note</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
                    {session.reviewNote}
                  </p>
                </div>
              )}
            </section>
            <SettlementCard session={session} />
            <DataCleanupCard session={session} />
            <RunTrace session={session} />
          </div>
        </section>
      </main>
    </div>
  );
}
