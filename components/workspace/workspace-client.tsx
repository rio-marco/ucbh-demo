"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  DatabaseZap,
  Download,
  FileText,
  GitBranch,
  Loader2,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  UploadCloud,
  X,
} from "lucide-react";
import SessionHistory, { CleanupDialog } from "@/components/session-history";
import AgentResult from "@/components/agent-result";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  Agent,
  SessionFile,
  SessionRecord,
  SessionStatus,
} from "@/lib/types";

type Upload = { name: string; content: string; size: number };
type OutputFile = { name: string; content: string };
type Stage =
  | "task"
  | "runtime"
  | "estimate"
  | "running"
  | "review"
  | "complete";
type StreamEvent = { type: string; data: Record<string, any> };
const DEMO_RATES = { inputPerThousand: 0.25, outputPerThousand: 1.1 };
const DEMO_STARTING_BALANCE = 1000;

const createSessionId = () => {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return `UCBH-${webCrypto.randomUUID().toUpperCase()}`;
  }

  // Session IDs are labels for this UI/runtime history, not credentials.
  // randomUUID is unavailable in some browsers and non-secure origins.
  const fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `UCBH-${fallback.toUpperCase()}`;
};

async function readEvents(
  response: Response,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Could not start the agent.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done || signal.aborted) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const type = chunk.match(/^event: (.+)$/m)?.[1];
        const data = chunk.match(/^data: (.+)$/m)?.[1];
        if (type && data) onEvent({ type, data: JSON.parse(data) });
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const tokenCount = (
  usage: Record<string, number> | null | undefined,
  key: "input_tokens" | "output_tokens",
) => Math.max(0, Number(usage?.[key] ?? 0));

type PersistInput = {
  id: string;
  status: SessionStatus;
  prompt: string;
  files: SessionFile[];
  inputTokens?: number;
  outputTokens?: number;
  outputs?: number;
  environment?: "private" | "shared";
  fee?: number;
  result?: string;
  trace?: string[];
  sourceFiles?: Upload[];
  reviewNote?: string;
};

export default function WorkspaceClient({
  agent,
  sessionId,
  initialSessions,
  resume,
}: {
  agent: Agent;
  sessionId: string;
  initialSessions: SessionRecord[];
  resume?: {
    sessionId: string;
    prompt: string;
    files: Upload[];
    environment: "private" | "shared";
    revisionNote: string;
  };
}) {
  const [stage, setStage] = useState<Stage>("task");
  const [activeSessionId, setActiveSessionId] = useState(
    resume?.sessionId ?? sessionId,
  );
  const [sessions, setSessions] = useState<SessionRecord[]>(initialSessions);
  const [files, setFiles] = useState<Upload[]>(resume?.files ?? []);
  const [prompt, setPrompt] = useState(
    resume?.prompt ?? agent.prompts[0] ?? "",
  );
  const [runtime, setRuntime] = useState<"shared" | "private">(
    resume?.environment ?? "private",
  );
  const [messages, setMessages] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  const [demoBalance, setDemoBalance] = useState(DEMO_STARTING_BALANCE);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [codexReady, setCodexReady] = useState<boolean | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDone, setCleanupDone] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const traceRef = useRef<HTMLDivElement | null>(null);
  const inputEstimate =
    10_000 +
    Math.ceil(
      (new TextEncoder().encode(prompt).length +
        files.reduce((sum, file) => sum + file.size, 0)) /
        4,
    );
  const outputEstimate = Math.max(256, Math.ceil(prompt.length / 5));
  const estimatedCharge = Math.max(
    1,
    Math.ceil(
      ((inputEstimate / 1000) * DEMO_RATES.inputPerThousand +
        (outputEstimate / 1000) * DEMO_RATES.outputPerThousand) *
        100,
    ) / 100,
  );
  const steps = [
    "Agent & task",
    "Environment",
    "Estimate & pay",
    "Agent run",
    "Review",
  ];
  const activeStep =
    stage === "task"
      ? 0
      : stage === "runtime"
        ? 1
        : stage === "estimate"
          ? 2
          : stage === "running"
            ? 3
            : stage === "review" || stage === "complete"
              ? 4
              : 0;
  const completedSteps = stage === "complete" ? steps.length : activeStep;
  const processEventCount =
    activities.length + messages.length + outputs.length;
  const processRunning = stage === "running";
  const processDone = stage === "review" || stage === "complete";
  const processProgress = processDone
    ? 100
    : processRunning
      ? Math.max(runProgress, Math.min(92, 8 + processEventCount * 7))
      : 0;
  const pipelineSteps = [
    {
      label: "Provision workspace",
      detail: "Isolated sandbox ready",
      done: processRunning || processDone,
      active: false,
    },
    {
      label: "Load task files",
      detail: `${files.length} file${files.length === 1 ? "" : "s"} staged`,
      done: files.length > 0,
      active: false,
    },
    {
      label: "Analyze prompt",
      detail: processDone
        ? "Analysis complete"
        : messages.length
          ? "Agent response received"
          : "Waiting for agent",
      done: messages.length > 0 || processDone,
      active: processRunning && messages.length === 0,
    },
    {
      label: "Execute tools",
      detail: activities.length
        ? `${activities.length} process event${activities.length === 1 ? "" : "s"}`
        : "No commands yet",
      done: collecting || processDone,
      active: activities.length > 0 && !collecting && !processDone,
    },
    {
      label: "Collect outputs",
      detail: outputs.length
        ? `${outputs.length} file${outputs.length === 1 ? "" : "s"} generated`
        : processDone
          ? "No output files generated"
          : collecting
            ? "Collecting output files"
            : "Waiting for agent tools",
      done: processDone,
      active: collecting && processRunning,
    },
  ];
  const sessionFiles: SessionFile[] = files.map((file) => ({
    name: file.name,
    size: file.size,
  }));

  useEffect(() => {
    fetch("/api/execute", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setCodexReady(Boolean(data.ready)))
      .catch(() => setCodexReady(false));
  }, []);

  useEffect(() => {
    if (stage !== "running") return;
    const timer = window.setInterval(() => {
      setRunProgress((current) =>
        current >= 92 ? current : Math.min(92, current + 2 + Math.random() * 5),
      );
    }, 900);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    const node = traceRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [activities, messages]);

  const persistSession = async (input: PersistInput): Promise<boolean> => {
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, ...input }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { session: SessionRecord };
      if (!data.session) return false;
      setSessions((current) =>
        [
          data.session,
          ...current.filter((item) => item.id !== data.session.id),
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      return true;
    } catch {
      // Run history is best-effort; the run itself should continue.
      return false;
    }
  };

  const deleteSessionRecord = async (id: string) => {
    try {
      await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } finally {
      setSessions((current) => current.filter((item) => item.id !== id));
    }
  };

  const cleanupAgentHistory = async () => {
    setError("");
    try {
      const response = await fetch(
        `/api/runtime?sessionId=${encodeURIComponent(activeSessionId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setError("Could not clean Agent runtime data. Please try again.");
        return;
      }
      setCleanupDone(true);
    } catch {
      setError("Could not clean Agent runtime data. Please try again.");
    }
  };

  const resetTask = () => {
    setStage("task");
    setPrompt(agent.prompts[0] || "");
    setFiles([]);
    setMessages([]);
    setActivities([]);
    setCollecting(false);
    setOutputs([]);
    setUsage(null);
    setError("");
    setCleanupDone(false);
    setRunProgress(0);
    setActiveSessionId(createSessionId());
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setError("");
    const incoming = Array.from(list);
    if (
      files.length + incoming.length > 10 ||
      incoming.some(
        (file) =>
          !file.name.toLowerCase().endsWith(".csv") || file.size > 2_000_000,
      )
    ) {
      setError("Choose up to 10 CSV files, each 2 MB or smaller.");
      return;
    }
    if (
      files.reduce((sum, file) => sum + file.size, 0) +
        incoming.reduce((sum, file) => sum + file.size, 0) >
      8_000_000
    ) {
      setError("The combined upload limit is 8 MB.");
      return;
    }
    const loaded = await Promise.all(
      incoming.map(async (file) => ({
        name: file.name,
        content: await file.text(),
        size: file.size,
      })),
    );
    setFiles((current) => [...current, ...loaded]);
  };

  const startCodex = async (revisionNote = "") => {
    const runPrompt = revisionNote.trim()
      ? `${prompt}\n\nRevision note for this update:\n${revisionNote.trim()}`
      : prompt;
    if (runPrompt.length > 20_000) {
      setError(
        "The task and revision note must fit within 20,000 characters. Shorten the note and try again.",
      );
      return;
    }
    if (revisionNote.trim()) setPrompt(runPrompt);
    setPaymentOpen(false);
    setDemoBalance((balance) => Math.max(0, balance - estimatedCharge));
    const runSessionId = revisionNote.trim()
      ? activeSessionId
      : createSessionId();
    setActiveSessionId(runSessionId);
    setStage("running");
    setError("");
    setMessages([]);
    setActivities([]);
    setCollecting(false);
    setOutputs([]);
    setUsage(null);
    setCleanupDone(false);
    setRunProgress(4);
    const runFiles = files.map(({ name, size }) => ({ name, size }));
    const sourceFiles = files.map(({ name, content, size }) => ({
      name,
      content,
      size,
    }));
    const runMessages: string[] = [];
    const previousTrace = revisionNote
      ? (sessions.find((session) => session.id === activeSessionId)?.trace ??
        [])
      : [];
    const runTrace: string[] = [
      ...previousTrace,
      ...(revisionNote.trim() ? ["Revision requested"] : []),
      "Workspace provisioned",
      `${runFiles.length} task file${runFiles.length === 1 ? "" : "s"} loaded`,
      "Agent started prompt analysis",
    ];
    const saved = await persistSession({
      id: runSessionId,
      status: "running",
      prompt: runPrompt,
      files: runFiles,
      sourceFiles,
      environment: runtime,
      fee: estimatedCharge,
      inputTokens: 0,
      outputTokens: 0,
      outputs: 0,
    });
    const abort = new AbortController();
    abortRef.current = abort;
    let executionError = "";
    let runUsage: Record<string, number> | null = null;
    let runOutputs: OutputFile[] = [];
    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          sessionId: runSessionId,
          prompt: runPrompt,
          files: files.map(({ name, content }) => ({ name, content })),
          environment: runtime,
        }),
        signal: abort.signal,
      });
      await readEvents(
        response,
        (event) => {
          if (event.type === "message") {
            const message = String(event.data.text || "");
            runMessages.push(message);
            setMessages((items) => [...items, message]);
            runTrace.push("Agent returned a result message");
          }
          if (event.type === "activity") {
            const activity = `Command ${event.data.status}`;
            runTrace.push(activity);
            setActivities((items) => [...items, activity]);
          }
          if (event.type === "file_change")
            setActivities((items) => [
              ...items,
              ...(event.data.changes || []).map(
                (change: { kind: string; path: string }) => {
                  const trace = `${change.kind}: ${change.path}`;
                  runTrace.push(trace);
                  return trace;
                },
              ),
            ]);
          if (event.type === "collecting") {
            setCollecting(true);
            runTrace.push("Collecting generated outputs");
          }
          if (event.type === "complete") {
            runOutputs = event.data.files || [];
            runUsage = event.data.usage || null;
            setOutputs(runOutputs);
            setUsage(runUsage);
            runTrace.push(
              `${runOutputs.length} generated output${runOutputs.length === 1 ? "" : "s"} collected`,
            );
          }
          if (event.type === "error") {
            executionError = String(
              event.data.message || "Agent execution failed.",
            );
            setError(executionError);
          }
        },
        abort.signal,
      );
      if (abort.signal.aborted) {
        setError(
          "Execution cancelled. Adjust the task if needed, then run the agent again.",
        );
        setStage("estimate");
        await persistSession({
          id: runSessionId,
          status: "cancelled",
          prompt: runPrompt,
          files: runFiles,
          environment: runtime,
          fee: estimatedCharge,
          inputTokens: tokenCount(runUsage, "input_tokens"),
          outputTokens: tokenCount(runUsage, "output_tokens"),
          outputs: runOutputs.length,
          result: runMessages.join("\n\n"),
          trace: runTrace,
        });
      } else if (executionError) {
        setStage("estimate");
        await persistSession({
          id: runSessionId,
          status: "failed",
          prompt: runPrompt,
          files: runFiles,
          environment: runtime,
          fee: estimatedCharge,
          inputTokens: tokenCount(runUsage, "input_tokens"),
          outputTokens: tokenCount(runUsage, "output_tokens"),
          outputs: runOutputs.length,
          result: runMessages.join("\n\n"),
          trace: runTrace,
        });
      } else {
        await persistSession({
          id: runSessionId,
          status: "review",
          prompt: runPrompt,
          files: runFiles,
          sourceFiles,
          environment: runtime,
          fee: estimatedCharge,
          inputTokens: tokenCount(runUsage, "input_tokens"),
          outputTokens: tokenCount(runUsage, "output_tokens"),
          outputs: runOutputs.length,
          result: runMessages.join("\n\n"),
          trace: runTrace,
        });
        setStage("review");
      }
    } catch (reason) {
      if (abort.signal.aborted) {
        setError(
          "Execution cancelled. Adjust the task if needed, then run the agent again.",
        );
        setStage("estimate");
        await persistSession({
          id: runSessionId,
          status: "cancelled",
          prompt: runPrompt,
          files: runFiles,
          environment: runtime,
          fee: estimatedCharge,
          inputTokens: tokenCount(runUsage, "input_tokens"),
          outputTokens: tokenCount(runUsage, "output_tokens"),
          outputs: runOutputs.length,
          result: runMessages.join("\n\n"),
          trace: runTrace,
        });
      } else {
        setError(
          reason instanceof Error ? reason.message : "Agent execution failed.",
        );
        setStage("estimate");
        await persistSession({
          id: runSessionId,
          status: "failed",
          prompt: runPrompt,
          files: runFiles,
          environment: runtime,
          fee: estimatedCharge,
          inputTokens: tokenCount(runUsage, "input_tokens"),
          outputTokens: tokenCount(runUsage, "output_tokens"),
          outputs: runOutputs.length,
          result: runMessages.join("\n\n"),
          trace: runTrace,
        });
      }
    } finally {
      abortRef.current = null;
    }
  };

  const resumeStartedRef = useRef(false);
  useEffect(() => {
    if (!resume || resumeStartedRef.current) return;
    resumeStartedRef.current = true;
    setRejectNote("");
    void startCodex(resume.revisionNote);
  }, [resume]);

  const download = (file: OutputFile) => {
    const url = URL.createObjectURL(
      new Blob([file.content], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name.split("/").pop() || "agent-output.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const rejectResult = async () => {
    const note = rejectNote.trim();
    if (!note) {
      setError(
        "Add a revision note explaining why this result is being rejected.",
      );
      return;
    }
    setStage("complete");
    const saved = await persistSession({
      id: activeSessionId,
      status: "rejected",
      prompt,
      files: sessionFiles,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      outputs: outputs.length,
      environment: runtime,
      fee: estimatedCharge,
      result: messages.join("\n\n"),
      trace: [...activities, `Rejected: ${note}`],
      reviewNote: note,
    });
    if (!saved) {
      setStage("review");
      setError("Could not save the rejection status. Please retry.");
      return;
    }
    await cleanupAgentHistory();
  };

  const acceptResult = async () => {
    setStage("complete");
    const saved = await persistSession({
      id: activeSessionId,
      status: "accepted",
      prompt,
      files: sessionFiles,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      outputs: outputs.length,
      environment: runtime,
      fee: estimatedCharge,
      result: messages.join("\n\n"),
      trace: activities,
    });
    if (!saved) {
      setStage("review");
      setError("Could not save the acceptance status. Please retry.");
      return;
    }
    await cleanupAgentHistory();
  };

  const cancelExecution = () => {
    abortRef.current?.abort();
    setError(
      "Execution cancelled. Adjust the task if needed, then run the agent again.",
    );
    setStage("estimate");
  };

  return (
    <div className="min-h-screen">
      <SiteHeader
        actions={
          <>
            <Link
              href={`/agents/${agent.id}`}
              className="hidden text-xs text-muted-foreground hover:text-ink sm:inline"
            >
              Agent details
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </>
        }
      >
        <span className="hidden h-6 w-px bg-ink/10 sm:block" />
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold">
            {agent.name}{" "}
            <span className="font-normal text-muted-foreground">
              · {agent.role}
            </span>
          </p>
          <p className="mt-1 truncate font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground">
            Agent AI · {activeSessionId}
          </p>
        </div>
      </SiteHeader>

      <main className="mx-auto max-w-6xl px-5 py-8 md:py-11">
        <div className="grid gap-6 lg:grid-cols-[255px_minmax(0,1fr)] lg:gap-8">
          <aside className="space-y-3 lg:sticky lg:top-24 lg:h-max">
            <Link
              href={`/agents/${agent.id}`}
              className="flex items-center justify-between rounded-xl border border-ink/10 bg-white/70 px-3 py-2.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-ink"
            >
              Back to agent details
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            {/* <div className="bai-card p-4">
              <div className="flex items-center justify-between">
                <p className="label">Agent process</p>
                <span className="font-display text-lg font-bold">
                  {processProgress}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/8">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${processDone ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${processProgress}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                {processRunning
                  ? `${processEventCount} process event${processEventCount === 1 ? "" : "s"} completed`
                  : processDone
                    ? "Agent process complete."
                    : "Waiting for agent to start the uploaded files and prompt."}
              </p>
              <dl className="mt-3 space-y-1.5 text-[10px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Session</dt>
                  <dd className="truncate font-mono">{activeSessionId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tokens</dt>
                  <dd>
                    {usage
                      ? (
                          (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
                        ).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Outputs</dt>
                  <dd>{outputs.length}</dd>
                </div>
              </dl>
            </div> */}

            <div className="bai-card p-4">
              <p className="label">Workflow steps</p>
              <ol className="mt-4 space-y-3">
                {steps.map((label, index) => {
                  const done = index < completedSteps;
                  const current = index === activeStep && stage !== "complete";
                  return (
                    <li key={label} className="flex items-center gap-3">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] ${done ? "border-primary bg-primary text-white" : current ? "border-primary bg-primary/10 font-semibold text-primary" : "border-ink/15 text-muted-foreground"}`}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span
                        className={`text-xs ${current ? "font-semibold text-ink" : done ? "text-ink/70" : "text-muted-foreground"}`}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            <div>
              <p className="label">
                Step {String(activeStep + 1).padStart(2, "0")} ·{" "}
                {steps[activeStep]}
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold md:text-[38px]">
                {stage === "task"
                  ? "Prepare your task"
                  : stage === "runtime"
                    ? "Choose where Agent runs"
                    : stage === "estimate"
                      ? "Review the estimate"
                      : stage === "running"
                        ? "Working in an isolated workspace"
                        : stage === "complete"
                          ? sessions.find(
                              (session) => session.id === activeSessionId,
                            )?.status === "rejected"
                            ? "Result rejected"
                            : "Task accepted"
                          : "Review Agent’s result"}
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                {stage === "task"
                  ? "Add one or more data files and describe the work you want the agent to do."
                  : stage === "running"
                    ? "Agent AI is executing your task inside a temporary sandbox. Follow the pipeline and live trace below."
                    : "Your prompt and files are sent to Agent AI only after you confirm the payment."}
              </p>
            </div>
            {(stage === "review" || stage === "complete") && (
              <div className="bai-card p-5">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold">Run trace · pipeline</p>
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                    {activeSessionId}
                  </span>
                </div>
                <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {pipelineSteps.map((step, index) => (
                    <li
                      key={step.label}
                      className="flex items-start gap-2 rounded-xl bg-paper/65 p-3"
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${step.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink/15 text-muted-foreground"}`}
                      >
                        {step.done ? <Check className="h-3 w-3" /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10.5px] font-semibold">
                          {step.label}
                        </span>
                        <span className="mt-1 block text-[9px] leading-relaxed text-muted-foreground">
                          {step.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}
            {codexReady === false && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Agent isn’t ready on this server. The administrator must sign
                  into Agent and ensure its platform runtime is installed. Users
                  do not need to provide an API key. Payment is disabled until
                  then.
                </span>
              </div>
            )}

            {stage === "task" && (
              <div className="space-y-4">
                <div className="bai-card overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/8 p-5 md:p-6">
                    <div className="flex items-start gap-4">
                      <span
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm"
                        style={{ background: agent.accent }}
                      >
                        <Sparkles className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-display text-xl font-bold">
                          {agent.name}
                          <span className="ml-2 align-middle font-sans text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                            {agent.role}
                          </span>
                        </p>
                        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                          {agent.tagline} Executed by Agent AI.
                        </p>
                      </div>
                    </div>
                    <span className="chip">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Selected agent
                    </span>
                  </div>
                  <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
                    {agent.capabilities.map((capability) => (
                      <div
                        key={capability}
                        className="flex items-center gap-2 rounded-xl bg-paper/70 px-3 py-2.5 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        {capability}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="bai-card p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="label">Task files</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          CSV · up to 10 files, 8 MB total
                        </p>
                      </div>
                      <UploadCloud className="h-5 w-5 text-primary" />
                    </div>
                    <label className="mt-4 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-ink/20 bg-paper/60 px-5 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.03]">
                      <UploadCloud className="h-6 w-6 text-primary" />
                      <span className="mt-2 text-xs font-semibold">
                        Drop files here or browse
                      </span>
                      <span className="mt-1 text-[10px] text-muted-foreground">
                        CSV files, 2 MB maximum each
                      </span>
                      <input
                        className="sr-only"
                        type="file"
                        multiple
                        accept=".csv,text/csv"
                        onChange={(event) => void addFiles(event.target.files)}
                      />
                    </label>
                    {files.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {files.map((file, index) => (
                          <li
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-2 rounded-lg border border-ink/8 px-2.5 py-2"
                          >
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span className="min-w-0 flex-1 truncate text-[11px]">
                              {file.name}
                            </span>
                            <span className="font-mono text-[9px] text-muted-foreground">
                              {(file.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${file.name}`}
                              onClick={() =>
                                setFiles((items) =>
                                  items.filter((_, i) => i !== index),
                                )
                              }
                            >
                              <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="bai-card p-5">
                    <p className="label">Task prompt</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Write instructions or paste a task brief for {agent.name}.
                    </p>
                    <textarea
                      className="mt-4 min-h-[190px] w-full resize-y rounded-xl border border-ink/12 bg-white/80 p-3.5 text-[12px] leading-relaxed outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                      placeholder="Describe the outcome you need…"
                      value={prompt}
                      maxLength={20000}
                      onChange={(event) => setPrompt(event.target.value)}
                    />
                    <p className="mt-2 text-right font-mono text-[9px] text-muted-foreground">
                      {prompt.length.toLocaleString()} / 20,000
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10.5px] text-muted-foreground">
                    Files stay in browser memory until you continue.
                  </p>
                  <Button
                    disabled={!files.length || !prompt.trim()}
                    onClick={() => {
                      setError("");
                      setStage("runtime");
                    }}
                  >
                    Continue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {stage === "runtime" && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setRuntime("shared")}
                    className={`bai-card bai-lift p-5 text-left ${runtime === "shared" ? "border-primary/50 ring-2 ring-primary/10" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-sky-800">
                        <Cloud className="h-5 w-5" />
                      </span>
                      {runtime === "shared" && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <p className="mt-4 font-display text-lg font-bold">
                      Shared server
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Shared application host with an isolated temporary
                      workspace for each task.
                    </p>
                    <p className="mt-4 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      Standard · per-run workspace
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuntime("private")}
                    className={`bai-card bai-lift p-5 text-left ${runtime === "private" ? "border-primary/50 ring-2 ring-primary/10" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-violet-800">
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      {runtime === "private" && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <p className="mt-4 font-display text-lg font-bold">
                      Private workspace
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      A separate temporary workspace for this task. Network
                      access is disabled during execution.
                    </p>
                    <p className="mt-4 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      Enhanced isolation · per-run workspace
                    </p>
                  </button>
                </div>
                <div className="flex justify-between">
                  <Button variant="line" onClick={() => setStage("task")}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </Button>
                  <Button onClick={() => setStage("estimate")}>
                    Continue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {stage === "estimate" && (
              <div className="space-y-4">
                <div className="bai-card p-5 md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="label">Run estimate</p>
                      <h2 className="mt-2 font-display text-xl font-bold">
                        {agent.name} ·{" "}
                        {runtime === "private"
                          ? "Private workspace"
                          : "Shared server"}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {files.length} file{files.length === 1 ? "" : "s"} ·{" "}
                        {files
                          .reduce((sum, file) => sum + file.size, 0)
                          .toLocaleString()}{" "}
                        bytes
                      </p>
                    </div>
                    <span className="chip">Estimate</span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-paper/80 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        Estimated input
                      </p>
                      <p className="mt-2 font-display text-xl font-bold">
                        ~{inputEstimate.toLocaleString()}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        tokens · prompt + files
                      </p>
                    </div>
                    <div className="rounded-xl bg-paper/80 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        Estimated output
                      </p>
                      <p className="mt-2 font-display text-xl font-bold">
                        ~{outputEstimate.toLocaleString()}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        tokens · planning estimate
                      </p>
                    </div>
                    <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
                      <p className="font-mono text-[9px] uppercase tracking-wide text-secondary-foreground">
                        Charge
                      </p>
                      <p className="mt-2 font-display text-xl font-bold">
                        {money(estimatedCharge)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-ink/8 px-3.5 py-3">
                    <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                      Token counts are planning estimates: a Agent runtime
                      allowance plus prompt and file size for input, and a small
                      prompt-based output allowance. Rates:{" "}
                      {money(DEMO_RATES.inputPerThousand)} per 1K input tokens
                      and {money(DEMO_RATES.outputPerThousand)} per 1K output
                      tokens.
                    </p>
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button variant="line" onClick={() => setStage("runtime")}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </Button>
                  <Button
                    disabled={!codexReady || estimatedCharge > demoBalance}
                    onClick={() => setPaymentOpen(true)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run agent
                  </Button>
                </div>
                {codexReady === null && (
                  <p className="text-right text-[10px] text-muted-foreground">
                    Checking Agent configuration…
                  </p>
                )}
              </div>
            )}

            {stage === "running" && (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[285px_minmax(0,1fr)]">
                  <div className="bai-card flex flex-col p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <GitBranch className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="label">Pipeline</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Execution order
                        </p>
                      </div>
                    </div>
                    <ol className="mt-5 space-y-1">
                      {pipelineSteps.map((step, index) => (
                        <li
                          key={step.label}
                          className="relative flex gap-3 pb-5 last:pb-0"
                        >
                          {index < pipelineSteps.length - 1 && (
                            <span
                              className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px ${
                                step.done ? "bg-primary/40" : "bg-ink/10"
                              }`}
                            />
                          )}
                          <span
                            className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] ${
                              step.done
                                ? "border-primary bg-primary text-white"
                                : step.active
                                  ? "border-primary bg-primary/10 font-semibold text-primary"
                                  : "border-ink/15 bg-white text-muted-foreground"
                            }`}
                          >
                            {step.done ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : step.active ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <p
                              className={`text-[11.5px] ${
                                step.active
                                  ? "font-semibold text-ink"
                                  : step.done
                                    ? "text-ink/70"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {step.label}
                            </p>
                            <p className="mt-0.5 truncate text-[9.5px] text-muted-foreground">
                              {step.detail}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-auto pt-4">
                      <div className="rounded-xl border border-ink/8 bg-paper/70 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 text-[9.5px]">
                          <span className="text-muted-foreground">Session</span>
                          <span className="truncate font-mono">
                            {activeSessionId}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[9.5px]">
                          <span className="text-muted-foreground">Runtime</span>
                          <span className="truncate">
                            {runtime === "private"
                              ? "Private workspace"
                              : "Shared server"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bai-card overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink/5 text-ink">
                          <Terminal className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="label">Agent Trace</p>
                          <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                            {activeSessionId} ·{" "}
                            {runtime === "private"
                              ? "private sandbox"
                              : "shared sandbox"}
                          </p>
                        </div>
                      </div>
                      <span className="chip">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running
                      </span>
                    </div>
                    <div
                      ref={traceRef}
                      className="max-h-[430px] min-h-[360px] space-y-2 overflow-y-auto bg-[#0d1117] p-4 font-mono text-[11px] leading-relaxed text-slate-300"
                    >
                      <p className="text-slate-500">
                        $ connect --workspace {activeSessionId}
                      </p>
                      <p className="text-emerald-400">
                        ✓ isolated workspace ready
                      </p>
                      {activities.map((line, index) => (
                        <p key={`activity-${index}`} className="text-slate-300">
                          <span className="mr-2 text-emerald-400">›</span>
                          {line}
                        </p>
                      ))}
                      {messages.map((message, index) => (
                        <p
                          key={`message-${index}`}
                          className="whitespace-pre-wrap border-l-2 border-primary/60 pl-3 text-slate-200"
                        >
                          {message}
                        </p>
                      ))}
                      {!activities.length && !messages.length && (
                        <p className="text-slate-500">
                          Waiting for Agent to start…
                        </p>
                      )}
                      <p className="flex items-center gap-1.5 pt-1">
                        <span className="text-emerald-400">$</span>
                        <span className="h-3.5 w-1.5 animate-pulse bg-emerald-400" />
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bai-card p-4 md:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold">Event run</p>
                      <span className="font-mono text-[9.5px] text-muted-foreground">
                        {processEventCount} event
                        {processEventCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-lg font-bold">
                        {Math.round(processProgress)}%
                      </span>
                      <Button
                        size="sm"
                        variant="line"
                        onClick={cancelExecution}
                      >
                        <Square className="h-3 w-3 fill-current" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-violet-500 to-sky-400 transition-all duration-700"
                      style={{ width: `${processProgress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>
                      Working in an isolated workspace · live agent output
                    </span>
                    <span className="font-mono">
                      {Math.round(processProgress)} / 100
                    </span>
                  </div>
                </div>
              </div>
            )}

            {stage === "review" && (
              <div className="space-y-4">
                <div className="bai-card p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="label">Run complete · review required</p>
                      <h2 className="mt-2 font-display text-xl font-bold">
                        Agent result
                      </h2>
                    </div>
                    <span className="chip">
                      <CheckCircle2 className="h-3 w-3" />
                      Ready for review
                    </span>
                  </div>
                  <div className="mt-4 rounded-xl border border-ink/8 bg-white p-4">
                    <AgentResult content={messages.join("\n\n")} />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-paper/80 p-3.5">
                      <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        Agent usage · actual
                      </p>
                      <p className="mt-2 text-xs">
                        {usage
                          ? `${(usage.input_tokens ?? 0).toLocaleString()} input · ${(usage.output_tokens ?? 0).toLocaleString()} output tokens`
                          : "Usage was not returned by Agent."}
                      </p>
                    </div>
                    <div className="rounded-xl bg-paper/80 p-3.5">
                      <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        Payment
                      </p>
                      <p className="mt-2 text-xs">
                        {money(estimatedCharge)} credits
                      </p>
                    </div>
                  </div>
                  {outputs.length > 0 && (
                    <div className="mt-5">
                      <p className="label mb-2">
                        Generated files · {outputs.length}
                      </p>
                      <div className="divide-y divide-ink/8 rounded-xl border border-ink/8 bg-white">
                        {outputs.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-3 px-3 py-2.5"
                          >
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="min-w-0 flex-1 truncate text-[11px]">
                              {file.name}
                            </span>
                            <Button
                              size="sm"
                              variant="line"
                              onClick={() => download(file)}
                            >
                              <Download className="h-3 w-3" />
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="bai-card p-5">
                  <label className="block text-xs font-semibold">
                    Revision note{" "}
                    <span className="font-normal text-muted-foreground">
                      (required for Reject or Update Result)
                    </span>
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-xl border border-ink/12 bg-white p-3 text-xs"
                      placeholder="Tell Agent what to change…"
                      value={rejectNote}
                      onChange={(event) => setRejectNote(event.target.value)}
                      maxLength={4000}
                      required
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <Button
                      variant="danger"
                      onClick={() => void rejectResult()}
                      disabled={!rejectNote.trim()}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      variant="line"
                      onClick={() => void startCodex(rejectNote)}
                      disabled={!rejectNote.trim()}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Update Result
                    </Button>
                    <Button onClick={() => void acceptResult()}>
                      <Check className="h-3.5 w-3.5" />
                      Accept
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {stage === "complete" && (
              <div className="bai-card p-6 md:p-8">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <p className="label mt-5">
                  {sessions.find((session) => session.id === activeSessionId)
                    ?.status === "rejected"
                    ? "Result rejected"
                    : "Task accepted"}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold">
                  Your review is complete.
                </h2>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  {sessions.find((session) => session.id === activeSessionId)
                    ?.status === "rejected"
                    ? "This result was rejected. Agent runtime data has been cleaned and the review status is recorded in run history."
                    : "This result was accepted. Agent runtime data has been cleaned and the review status is recorded in run history."}
                </p>
                <div className="mt-5 rounded-xl border border-ink/8 bg-white p-4">
                  <p className="label mb-3">Agent result</p>
                  <AgentResult content={messages.join("\n\n")} />
                </div>
                {outputs.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {outputs.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-ink/8 bg-white px-3 py-2"
                      >
                        <span className="truncate text-xs">{file.name}</span>
                        <Button
                          size="sm"
                          variant="line"
                          onClick={() => download(file)}
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {cleanupDone ? (
                    <Button onClick={resetTask}>
                      <ArrowRight className="h-3.5 w-3.5" />
                      Start another task
                    </Button>
                  ) : (
                    <Button variant="line" onClick={() => setCleanupOpen(true)}>
                      <DatabaseZap className="h-3.5 w-3.5" />
                      Retry data cleanup
                    </Button>
                  )}
                  <p className="text-[10.5px] text-muted-foreground">
                    {cleanupDone
                      ? "Agent runtime data cleaned. Your run history is still available below."
                      : "Cleanup did not finish. Retry to remove Agent runtime data."}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mt-7">
          <SessionHistory sessions={sessions} onDelete={deleteSessionRecord} />
        </div>
      </main>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Confirm payment
            </DialogTitle>
            <DialogDescription>Checkout for {agent.name}.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-ink/8 bg-paper/70 p-4">
            <div className="flex justify-between text-xs">
              <span>Estimated run charge</span>
              <b>{money(estimatedCharge)}</b>
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Balance after payment</span>
              <span>{money(demoBalance - estimatedCharge)}</span>
            </div>
            <div className="mt-3 border-t border-ink/8 pt-3 text-[10px] leading-relaxed text-muted-foreground">
              Model: Agent AI (server configuration) · Runtime:{" "}
              {runtime === "private" ? "Private workspace" : "Shared server"}.
              Rates only; actual provider billing is separate and is not
              collected by this app.
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="line"
              onClick={() => setPaymentOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void startCodex()}
              disabled={!codexReady}
            >
              <Check className="h-3.5 w-3.5" />
              Pay {money(estimatedCharge)} credits & run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CleanupDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        onConfirm={cleanupAgentHistory}
      />
    </div>
  );
}
