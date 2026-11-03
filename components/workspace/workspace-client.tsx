"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Download,
  FileText,
  Loader2,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Agent } from "@/lib/types";

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
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const type = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      if (type && data) onEvent({ type, data: JSON.parse(data) });
    }
  }
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

export default function WorkspaceClient({
  agent,
  sessionId,
}: {
  agent: Agent;
  sessionId: string;
}) {
  const [stage, setStage] = useState<Stage>("task");
  const [files, setFiles] = useState<Upload[]>([]);
  const [prompt, setPrompt] = useState(agent.prompts[0] || "");
  const [runtime, setRuntime] = useState<"shared" | "private">("private");
  const [messages, setMessages] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  const [demoBalance, setDemoBalance] = useState(DEMO_STARTING_BALANCE);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [codexReady, setCodexReady] = useState<boolean | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const abortRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    fetch("/api/execute", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setCodexReady(Boolean(data.ready)))
      .catch(() => setCodexReady(false));
  }, []);

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

  const startCodex = async () => {
    setPaymentOpen(false);
    setDemoBalance((balance) => Math.max(0, balance - estimatedCharge));
    setStage("running");
    setError("");
    setMessages([]);
    setActivities([]);
    setOutputs([]);
    setUsage(null);
    const abort = new AbortController();
    abortRef.current = abort;
    let executionError = "";
    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          prompt,
          files: files.map(({ name, content }) => ({ name, content })),
          environment: runtime,
        }),
        signal: abort.signal,
      });
      await readEvents(
        response,
        (event) => {
          if (event.type === "message")
            setMessages((items) => [...items, String(event.data.text || "")]);
          if (event.type === "activity")
            setActivities((items) => [
              ...items,
              `Command ${event.data.status}`,
            ]);
          if (event.type === "file_change")
            setActivities((items) => [
              ...items,
              ...(event.data.changes || []).map(
                (change: { kind: string; path: string }) =>
                  `${change.kind}: ${change.path}`,
              ),
            ]);
          if (event.type === "complete") {
            setOutputs(event.data.files || []);
            setUsage(event.data.usage || null);
          }
          if (event.type === "error") {
            executionError = String(
              event.data.message || "Codex execution failed.",
            );
            setError(executionError);
          }
        },
        abort.signal,
      );
      if (abort.signal.aborted) {
        setError("Execution cancelled.");
        setStage("estimate");
      } else if (executionError) setStage("estimate");
      else setStage("review");
    } catch (reason) {
      if (!abort.signal.aborted) {
        setError(
          reason instanceof Error ? reason.message : "Codex execution failed.",
        );
        setStage("estimate");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const download = (file: OutputFile) => {
    const url = URL.createObjectURL(
      new Blob([file.content], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name.split("/").pop() || "codex-output.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const rejectResult = () => {
    const note =
      rejectNote.trim() ||
      "Please revise the previous result and address the issues I found.";
    setPrompt(
      (current) =>
        `${current}\n\nRevision request based on the rejected result:\n${note}`,
    );
    setRejectNote("");
    setStage("task");
    setError("");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink/8 bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Logo compact />
            </Link>
            <span className="hidden h-6 w-px bg-ink/10 sm:block" />
            <div>
              <p className="text-[12.5px] font-semibold">
                {agent.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {agent.role}
                </span>
              </p>
              <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground">
                Agent AI · {sessionId}
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All agents
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-7 px-5 py-8 lg:grid-cols-[220px_1fr] lg:gap-10 lg:py-11">
        <aside className="space-y-3 lg:sticky lg:top-24 lg:h-max">
          <div className="bai-card p-4">
            <p className="label mb-4">Your workflow</p>
            <ol className="space-y-3">
              {steps.map((label, index) => (
                <li key={label} className="flex items-center gap-3">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full border text-[11px] ${index < activeStep ? "border-primary bg-primary text-white" : index === activeStep ? "border-primary bg-primary/10 font-semibold text-primary" : "border-ink/15 text-muted-foreground"}`}
                  >
                    {index < activeStep ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`text-xs ${index === activeStep ? "font-semibold text-ink" : "text-muted-foreground"}`}
                  >
                    {label}
                  </span>
                </li>
              ))}
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
                      ? "Codex is working"
                      : stage === "complete"
                        ? "Task accepted"
                        : "Review Codex’s result"}
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {stage === "task"
                ? "Add one or more data files and describe the work you want the agent to do."
                : "Your prompt and files are sent to Agent AI only after you confirm the payment."}
            </p>
          </div>
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
                Codex isn’t ready on this server. The administrator must sign
                into Codex and ensure its platform runtime is installed. Users
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
                    Shared application host with an isolated temporary workspace
                    for each task.
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
                    A separate temporary workspace for this task. Network access
                    is disabled during execution.
                  </p>
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                    Enhanced isolation · per-run workspace
                  </p>
                </button>
              </div>
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10.5px] leading-relaxed text-amber-950">
                Both options currently run on this deployment’s server in the
                same Codex sandbox policy. A separate private cloud or dedicated
                server is not configured.
              </p>
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
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      preview credits only
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-ink/8 px-3.5 py-3">
                  <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                    Token counts are planning estimates: a Agent runtime
                    allowance plus prompt and file size for input, and a small
                    prompt-based output allowance. Rates:{" "}
                    {money(DEMO_RATES.inputPerThousand)} per 1K input tokens and{" "}
                    {money(DEMO_RATES.outputPerThousand)} per 1K output tokens.
                    This preview charge is simulated and is not an Agent charge;
                    actual Codex usage is reported after the run when available.
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
                  Checking Codex configuration…
                </p>
              )}
            </div>
          )}

          {stage === "running" && (
            <div className="bai-card p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="label">Live Codex execution</p>
                  <p className="mt-2 font-display text-lg font-bold">
                    Working in an isolated workspace
                  </p>
                </div>
                <span className="chip">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {activities.map((line, index) => (
                  <p
                    key={index}
                    className="rounded-lg bg-paper px-3 py-2 font-mono text-[10px] text-muted-foreground"
                  >
                    {line}
                  </p>
                ))}
                {messages.map((message, index) => (
                  <p
                    key={index}
                    className="whitespace-pre-wrap rounded-xl border border-ink/8 bg-white p-4 text-xs leading-relaxed"
                  >
                    {message}
                  </p>
                ))}
                {!activities.length && !messages.length && (
                  <p className="text-xs text-muted-foreground">
                    Waiting for Codex to start…
                  </p>
                )}
              </div>
              <Button
                className="mt-5"
                variant="line"
                onClick={() => abortRef.current?.abort()}
              >
                <Square className="h-3 w-3" />
                Cancel execution
              </Button>
            </div>
          )}

          {stage === "review" && (
            <div className="space-y-4">
              <div className="bai-card p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="label">Run complete · review required</p>
                    <h2 className="mt-2 font-display text-xl font-bold">
                      Codex result
                    </h2>
                  </div>
                  <span className="chip">
                    <CheckCircle2 className="h-3 w-3" />
                    Ready for review
                  </span>
                </div>
                <div className="mt-4 whitespace-pre-wrap rounded-xl border border-ink/8 bg-white p-4 text-xs leading-relaxed">
                  {messages.length
                    ? messages.join("\n\n")
                    : "Codex completed without a text response."}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-paper/80 p-3.5">
                    <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      Codex usage · actual
                    </p>
                    <p className="mt-2 text-xs">
                      {usage
                        ? `${(usage.input_tokens ?? 0).toLocaleString()} input · ${(usage.output_tokens ?? 0).toLocaleString()} output tokens`
                        : "Usage was not returned by Codex."}
                    </p>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      Provider charge is not available from the SDK.
                    </p>
                  </div>
                  <div className="rounded-xl bg-paper/80 p-3.5">
                    <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      Payment
                    </p>
                    <p className="mt-2 text-xs">
                      {money(estimatedCharge)} preview credits
                    </p>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      No payment was sent to Agent.
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
                    (optional if rejecting)
                  </span>
                  <textarea
                    className="mt-2 min-h-20 w-full rounded-xl border border-ink/12 bg-white p-3 text-xs"
                    placeholder="Tell Codex what to change…"
                    value={rejectNote}
                    onChange={(event) => setRejectNote(event.target.value)}
                  />
                </label>
                <div className="mt-4 flex flex-wrap justify-between gap-3">
                  <Button variant="line" onClick={rejectResult}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reject & return task
                  </Button>
                  <Button onClick={() => setStage("complete")}>
                    <Check className="h-3.5 w-3.5" />
                    Accept result
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
              <p className="label mt-5">Task accepted</p>
              <h2 className="mt-2 font-display text-2xl font-bold">
                Your review is complete.
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Accepted files are ready to download. This deployment does not
                connect to an external business workspace, so accepting records
                your decision in this session and does not publish changes
                elsewhere.
              </p>
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
              <Button
                className="mt-6"
                onClick={() => {
                  setStage("task");
                  setPrompt(agent.prompts[0] || "");
                  setFiles([]);
                  setMessages([]);
                  setOutputs([]);
                  setUsage(null);
                  setError("");
                }}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Start another task
              </Button>
            </div>
          )}
        </section>
      </main>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Confirm payment
            </DialogTitle>
            <DialogDescription>
              Preview checkout for {agent.name}. No card details are requested
              and no real payment will be made.
            </DialogDescription>
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
    </div>
  );
}
