import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Clock3, Coins, FileText, GitBranch, Shield } from "lucide-react";
import SiteHeader from "@/components/site-header";
import RunDetailsActions from "@/components/run-details-actions";
import { getSession } from "@/lib/sessions";
import type { SessionStatus } from "@/lib/types";

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
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default async function RunDetailsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getSession(decodeURIComponent(sessionId));
  if (!session) notFound();
  const { sourceFiles, ...publicSession } = session;

  return (
    <div className="min-h-screen">
      <SiteHeader actions={<Link href={`/agent/${session.agentId}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Workspace</Link>} />
      <main className="mx-auto max-w-6xl space-y-5 px-5 py-8 md:py-11">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={`/agent/${session.agentId}`} className="text-[11px] text-muted-foreground hover:text-ink">Workspace / Run history</Link>
            <h1 className="mt-3 font-display text-3xl font-bold">Run details</h1>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">Run-{session.id} · {session.agentName}</p>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${session.status === "review" ? "border-amber-200 bg-amber-50 text-amber-800" : session.status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : session.status === "rejected" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-ink/10 bg-white text-ink/70"}`}>{statusLabel[session.status]}</span>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Environment", value: session.environment === "private" ? "Private workspace" : "Shared server", icon: Shield },
            { label: "Total tokens", value: number(session.totalTokens), icon: Coins },
            { label: "Fee · preview", value: `${money(session.fee)} · Charge collected`, icon: Coins },
            { label: "Submitted", value: new Date(session.createdAt).toLocaleString(), icon: Clock3 },
          ].map((item) => <div key={item.label} className="bai-card p-4"><div className="flex items-center justify-between"><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{item.label}</p><item.icon className="h-4 w-4 text-primary" /></div><p className="mt-3 text-sm font-semibold">{item.value}</p></div>)}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="space-y-5">
            <div className="bai-card p-5 md:p-6">
              <p className="label">Agent result</p>
              <h2 className="mt-3 font-display text-xl font-bold">{session.title}</h2>
              <div className="mt-4 space-y-3 rounded-xl border border-ink/8 bg-white p-4 text-xs leading-relaxed text-ink/80">
                {session.result ? session.result.split("\n").filter(Boolean).map((line, index) => {
                  const heading = line.match(/^#{1,3}\s+(.+)$/);
                  const bullet = line.match(/^[-*•]\s+(.+)$/);
                  return heading ? <h3 key={index} className="pt-1 font-display text-sm font-bold text-ink">{heading[1]}</h3> : bullet ? <p key={index} className="pl-3">• {bullet[1]}</p> : <p key={index}>{line}</p>;
                }) : <p className="text-muted-foreground">No text result was recorded for this run.</p>}
              </div>
              <div className="mt-4 rounded-xl bg-paper/70 p-4">
                <p className="label">Brief</p>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink/75">{session.prompt}</p>
              </div>
              {session.reviewNote && <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-4"><p className="label">Review note</p><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{session.reviewNote}</p></div>}
            </div>
            <RunDetailsActions session={publicSession} canUpdate={Boolean(sourceFiles?.length)} />
          </div>
          <aside className="space-y-5">
            <div className="bai-card p-5">
              <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Run trace</h2></div>
              <ol className="mt-4 space-y-0">
                {(session.trace.length ? session.trace : ["Workspace provisioned", "Task files loaded", "Agent run recorded"]).map((entry, index, list) => <li key={`${entry}-${index}`} className="relative flex gap-3 pb-4 last:pb-0"><span className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ${index < list.length - 1 || session.status !== "running" ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"}`}><Check className="h-3 w-3" /></span><span className="pt-1 text-[11px] leading-relaxed">{entry}</span><span className="absolute left-3 top-6 h-[calc(100%-1.5rem)] w-px bg-ink/10 last:hidden" /></li>)}
              </ol>
            </div>
            <div className="bai-card p-5">
              <p className="label">Task files · {session.files.length}</p>
              {session.sourceFiles?.length ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-900">Uploaded file contents are kept on this application server while this run awaits approval so Update Result can rerun the task. Accepting or rejecting removes the saved copies.</p> : null}
              {session.files.length ? <ul className="mt-3 space-y-2">{session.files.map((file) => <li key={file.name} className="flex items-center gap-2 rounded-lg border border-ink/8 px-3 py-2 text-[11px]"><FileText className="h-3.5 w-3.5 text-primary" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-[9px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No files recorded.</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-paper/70 p-3">Input tokens <b className="mt-1 block text-xs">{number(session.inputTokens)}</b></div><div className="rounded-lg bg-paper/70 p-3">Output tokens <b className="mt-1 block text-xs">{number(session.outputTokens)}</b></div></div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
