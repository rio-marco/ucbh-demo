"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
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
  Send,
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
import {
  parseQuickBooksUpdates,
  QB_RECORD_DEFINITIONS,
  QB_REPORT_DEFINITIONS,
  QUICKBOOKS_UPDATES_FILE,
  type QuickBooksUpdateOperation,
} from "@/lib/quickbooks-entities";

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
const MAX_TASK_FILES = 40;
const MAX_TASK_FILE_BYTES = 2_000_000;
const MAX_TASK_TOTAL_BYTES = 20_000_000;
const QB_MAX_FILES = MAX_TASK_FILES;
const QB_MAX_TOTAL_BYTES = MAX_TASK_TOTAL_BYTES;

type QuickBooksPayload = Record<string, any>;
type QbSummary = {
  records: number;
  files: number;
  entities: { label: string; count: number; file: string }[];
  reports: { label: string; file: string }[];
};

const QB_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the QuickBooks authorization.",
  invalid_state: "The QuickBooks sign-in session expired. Please try again.",
  missing_params:
    "QuickBooks did not return the expected details. Please try again.",
  token_exchange:
    "QuickBooks could not complete the connection. Please try again.",
};

const qbErrorMessage = (reason: string | null) =>
  (reason && QB_ERROR_MESSAGES[reason]) ||
  "Could not connect to QuickBooks. Please try again.";

function qbEntities<T = Record<string, unknown>>(
  payload: unknown,
  key: string,
): T[] {
  const value = (payload as any)?.QueryResponse?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const lines = [columns.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  }
  return lines.join("\n");
}

function summarizeQuickBooks(data: QuickBooksPayload): QbSummary {
  const entities = QB_RECORD_DEFINITIONS.map((definition) => ({
    label: definition.label,
    count: qbEntities(data[definition.key], definition.entity).length,
    file: definition.file,
  })).filter((item) => item.count > 0);

  const reports = QB_REPORT_DEFINITIONS.filter((definition) =>
    Boolean(data[definition.key]),
  ).map((definition) => ({
    label: definition.label,
    file: definition.file,
  }));

  const files =
    entities.length +
    reports.length +
    (data.companyInfo?.CompanyInfo ? 1 : 0);

  return {
    records: entities.reduce((sum, item) => sum + item.count, 0),
    files,
    entities,
    reports,
  };
}

function quickBooksToFiles(data: QuickBooksPayload): Upload[] {
  const files: Upload[] = [];
  const encodeSize = (content: string) =>
    new TextEncoder().encode(content).length;

  const addCsv = (name: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const content = toCsv(rows);
    if (!content) return;
    files.push({ name, content, size: encodeSize(content) });
  };

  const addJson = (name: string, value: unknown) => {
    if (!value) return;
    const content = JSON.stringify(value, null, 2);
    if (!content) return;
    files.push({ name, content, size: encodeSize(content) });
  };

  for (const definition of QB_RECORD_DEFINITIONS) {
    addCsv(
      definition.file,
      qbEntities(data[definition.key], definition.entity),
    );
  }

  const companyInfo = data.companyInfo?.CompanyInfo;
  if (companyInfo && typeof companyInfo === "object") {
    addCsv("quickbooks-company-info.csv", [
      companyInfo as Record<string, unknown>,
    ]);
  }

  for (const definition of QB_REPORT_DEFINITIONS) {
    addJson(definition.file, data[definition.key]);
  }

  return files;
}

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

type QuickBooksPushResult = {
  entity: string;
  id: string;
  ok: boolean;
  syncToken?: string;
  error?: string;
};

function QuickBooksPushPanel({
  file,
  connected,
  sessionId,
}: {
  file: OutputFile | null;
  connected: boolean;
  sessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<QuickBooksPushResult[] | null>(null);

  const parsed = useMemo(() => {
    if (!file) return { operations: [] as QuickBooksUpdateOperation[] };
    try {
      return parseQuickBooksUpdates(JSON.parse(file.content));
    } catch {
      return {
        operations: [] as QuickBooksUpdateOperation[],
        error: `${QUICKBOOKS_UPDATES_FILE} is not valid JSON.`,
      };
    }
  }, [file]);

  useEffect(() => {
    setResults(null);
    setError("");
    setOpen(false);
  }, [file?.content, sessionId]);

  if (!file) return null;

  const operations = parsed.operations ?? [];
  const succeeded = results?.filter((item) => item.ok).length ?? 0;
  const failed = results?.filter((item) => !item.ok).length ?? 0;

  const push = async () => {
    if (!operations.length) return;
    setPushing(true);
    setError("");
    try {
      const response = await fetch("/api/quickbooks/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-qb-confirm": "push",
        },
        body: JSON.stringify({ sessionId, operations }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        results?: QuickBooksPushResult[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not update QuickBooks.");
      }
      setResults(
        Array.isArray(data.results) ? data.results : [],
      );
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update QuickBooks.",
      );
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="bai-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label text-[#1F7A14]">QuickBooks write-back</p>
          <h3 className="mt-1.5 font-display text-base font-bold">
            Proposed record updates
          </h3>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            The agent proposed {operations.length} update
            {operations.length === 1 ? "" : "s"} to existing QuickBooks
            records. Review the exact fields before writing.
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          disabled={!connected || !operations.length || Boolean(parsed.error)}
        >
          <Send className="h-3.5 w-3.5" />
          Review &amp; push
        </Button>
      </div>

      {parsed.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {parsed.error} The updates will not be sent.
        </div>
      )}

      {!connected && (
        <p className="mt-3 text-[11px] text-amber-700">
          Reconnect QuickBooks on the task screen to enable write-back.
        </p>
      )}

      {results && (
        <div className="mt-3 rounded-lg border border-ink/8 bg-white p-3">
          <p className="text-[11px] font-semibold">
            {succeeded} updated · {failed} failed
          </p>
          {failed > 0 && (
            <ul className="mt-2 space-y-1">
              {results
                .filter((item) => !item.ok)
                .map((item) => (
                  <li
                    key={`${item.entity}-${item.id}`}
                    className="text-[10.5px] leading-relaxed text-red-600"
                  >
                    {item.entity} #{item.id}: {item.error}
                  </li>
                ))}
            </ul>
          )}
          {succeeded > 0 && (
            <p className="mt-2 text-[10.5px] text-emerald-700">
              QuickBooks was updated. Re-import the QuickBooks data to refresh
              your local snapshot.
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Push updates to QuickBooks</DialogTitle>
            <DialogDescription>
              These changes will be applied to your connected QuickBooks
              company immediately. Review every operation first.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-ink/8 bg-paper/60 p-3">
            {operations.map((operation, index) => (
              <div
                key={`${operation.entity}-${operation.id}-${index}`}
                className="rounded-lg border border-ink/8 bg-white p-3"
              >
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {operation.entity} · Id {operation.id} · SyncToken{" "}
                  {operation.syncToken}
                </p>
                <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink/80">
                  {JSON.stringify(operation.fields, null, 2)}
                </pre>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10.5px] leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This updates existing records only and is sandbox-only by default.
            Updates use each record&apos;s SyncToken; stale tokens or invalid
            fields are rejected by QuickBooks per record.
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button variant="line" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void push()} disabled={pushing}>
              {pushing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {pushing ? "Pushing…" : `Push ${operations.length} update${operations.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDone, setCleanupDone] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [qbDialogOpen, setQbDialogOpen] = useState(false);
  const [qbConnecting, setQbConnecting] = useState(false);
  const [qbChecking, setQbChecking] = useState(true);
  const [qbConnected, setQbConnected] = useState(false);
  const [qbCompanyName, setQbCompanyName] = useState<string | null>(null);
  const [qbRealmId, setQbRealmId] = useState<string | null>(null);
  const [qbSummary, setQbSummary] = useState<QbSummary | null>(null);
  const [qbDataLoading, setQbDataLoading] = useState(false);
  const [qbDataError, setQbDataError] = useState("");
  const [qbDataWarning, setQbDataWarning] = useState("");
  const [qbImported, setQbImported] = useState(false);
  const [qbError, setQbError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const traceRef = useRef<HTMLDivElement | null>(null);
  const qbAutoImportRef = useRef(false);
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

  const stripQbParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("qb");
    url.searchParams.delete("reason");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  const refreshQbStatus = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/quickbooks/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json()) as {
        connected?: boolean;
        companyName?: string | null;
        realmId?: string | null;
        error?: string;
      };
      const connected = Boolean(data.connected);
      setQbConnected(connected);
      setQbCompanyName(data.companyName ?? null);
      setQbRealmId(data.realmId ?? null);
      if (!connected && data.error) setQbError(data.error);
      return connected;
    } catch {
      setQbConnected(false);
      return false;
    } finally {
      setQbChecking(false);
    }
  };

  const importQuickBooksData = async () => {
    setQbDataLoading(true);
    setQbDataError("");
    setQbDataWarning("");
    try {
      const response = await fetch("/api/quickbooks/data?type=all", {
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: QuickBooksPayload;
        errors?: Record<string, string>;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Could not load QuickBooks data.");
      }

      setQbSummary(summarizeQuickBooks(payload.data));

      if (payload.errors && Object.keys(payload.errors).length) {
        setQbDataWarning(
          `Some record types could not be loaded: ${Object.keys(
            payload.errors,
          ).join(", ")}.`,
        );
      }

      const generated = quickBooksToFiles(payload.data);
      if (!generated.length) {
        setQbDataError(
          "Connected, but there are no QuickBooks records to import yet.",
        );
        return;
      }

      const retained = files.filter(
        (file) => !file.name.startsWith("quickbooks-"),
      );
      const combined = [...retained, ...generated];
      const totalSize = combined.reduce((sum, file) => sum + file.size, 0);
      if (combined.length > QB_MAX_FILES || totalSize > QB_MAX_TOTAL_BYTES) {
        setQbDataError(
          `QuickBooks data is larger than the task upload limit (${QB_MAX_FILES} files / ${Math.round(
            QB_MAX_TOTAL_BYTES / 1_000_000,
          )} MB). Remove some files and retry.`,
        );
        return;
      }

      setFiles(combined);
      setQbImported(true);
    } catch (reason) {
      setQbDataError(
        reason instanceof Error
          ? reason.message
          : "Could not load QuickBooks data.",
      );
    } finally {
      setQbDataLoading(false);
    }
  };

  const connectQuickBooks = async () => {
    setQbError("");
    setQbDataError("");
    setQbDataWarning("");
    setQbConnecting(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("qb");
      url.searchParams.delete("reason");
      const returnTo = `${url.pathname}${url.search}`;
      const response = await fetch(
        `/api/quickbooks/auth?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        authUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.authUrl) {
        throw new Error(
          data.error || "QuickBooks is not configured on this server.",
        );
      }
      // Full-page redirect to Intuit's own login. No credentials are
      // collected or stored by this application.
      window.location.assign(data.authUrl);
    } catch (reason) {
      setQbConnecting(false);
      setQbError(
        reason instanceof Error
          ? reason.message
          : "Could not start the QuickBooks connection.",
      );
    }
  };

  const disconnectQuickBooks = async () => {
    setQbDataLoading(true);
    setQbDataError("");
    setQbDataWarning("");
    try {
      const response = await fetch("/api/quickbooks/status", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Disconnect failed");
      setQbConnected(false);
      setQbCompanyName(null);
      setQbRealmId(null);
      setQbSummary(null);
      setQbImported(false);
      qbAutoImportRef.current = false;
      setFiles((current) =>
        current.filter((file) => !file.name.startsWith("quickbooks-")),
      );
      setQbDialogOpen(false);
    } catch {
      setQbDataError("Could not disconnect QuickBooks. Please try again.");
    } finally {
      setQbDataLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const qb = params.get("qb");
    const reason = params.get("reason");

    if (qb === "error") {
      setQbError(qbErrorMessage(reason));
    }

    const initialise = async () => {
      const connected = await refreshQbStatus();
      if (cancelled) return;
      if (connected && qb === "connected") {
        setQbDialogOpen(true);
      }
      if (qb) stripQbParams();
    };

    void initialise();
    return () => {
      cancelled = true;
    };
    // Runs once on mount: the query string is the OAuth callback signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage !== "task" || !qbConnected || qbDataLoading || qbImported) {
      return;
    }
    if (files.length > 0 || qbAutoImportRef.current) return;
    // QuickBooks remains connected across tasks, but its CSV files only live
    // in this page's state. Re-import automatically so returning users are
    // not left with an empty attachment list and a disabled Continue button.
    qbAutoImportRef.current = true;
    void importQuickBooksData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, qbConnected, qbDataLoading, qbImported, files.length]);

  useEffect(() => {
    fetch("/api/execute", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setAgentReady(Boolean(data.ready)))
      .catch(() => setAgentReady(false));
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
    setQbImported(false);
    setQbDataError("");
    setQbDataWarning("");
    qbAutoImportRef.current = false;
    setRunProgress(0);
    setActiveSessionId(createSessionId());
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setError("");
    const incoming = Array.from(list);
    if (
      files.length + incoming.length > MAX_TASK_FILES ||
      incoming.some(
        (file) =>
          !file.name.toLowerCase().endsWith(".csv") ||
          file.size > MAX_TASK_FILE_BYTES,
      )
    ) {
      setError(
        `Choose up to ${MAX_TASK_FILES} CSV files, each ${Math.round(
          MAX_TASK_FILE_BYTES / 1_000_000,
        )} MB or smaller.`,
      );
      return;
    }
    if (
      files.reduce((sum, file) => sum + file.size, 0) +
        incoming.reduce((sum, file) => sum + file.size, 0) >
      MAX_TASK_TOTAL_BYTES
    ) {
      setError(
        `The combined upload limit is ${Math.round(
          MAX_TASK_TOTAL_BYTES / 1_000_000,
        )} MB.`,
      );
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

  const startAgent = async (revisionNote = "") => {
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
            const tool =
              typeof event.data.tool === "string" ? event.data.tool : "";
            const status = String(event.data.status || "completed");
            const activity = tool
              ? `${tool.replace(/_/g, " ")} ${status}`
              : `Command ${status}`;
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
    void startAgent(resume.revisionNote);
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
            {agentReady === false && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Something went wrong please try again later or contact the
                  administrator
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
                          CSV · up to {MAX_TASK_FILES} files,{" "}
                          {Math.round(MAX_TASK_TOTAL_BYTES / 1_000_000)} MB total
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
                        CSV files, {Math.round(MAX_TASK_FILE_BYTES / 1_000_000)} MB
                        maximum each
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

                    {/* Divider */}
                    <div className="relative mt-5 mb-1">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-ink/10" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          or import from
                        </span>
                      </div>
                    </div>

                    {/* Connect with QuickBooks Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (qbConnected) {
                          setQbDialogOpen(true);
                        } else {
                          void connectQuickBooks();
                        }
                      }}
                      disabled={qbConnecting || qbChecking}
                      className={`mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold transition-all duration-200 disabled:cursor-wait disabled:opacity-70 ${
                        qbConnected
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-ink/15 bg-white text-ink hover:border-[#2CA01C]/40 hover:bg-[#2CA01C]/[0.04] hover:shadow-sm"
                      }`}
                    >
                      {/* QuickBooks Logo SVG */}
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="12" cy="12" r="11" fill="#2CA01C" />
                        <path
                          d="M7.5 7.5C6.12 7.5 5 8.62 5 10v4c0 1.38 1.12 2.5 2.5 2.5H9v-1.5H7.5c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1H9V14.5c0 1.38 1.12 2.5 2.5 2.5V7.5H7.5z"
                          fill="white"
                        />
                        <path
                          d="M16.5 16.5c1.38 0 2.5-1.12 2.5-2.5v-4c0-1.38-1.12-2.5-2.5-2.5H15v1.5h1.5c.55 0 1 .45 1 1v4c0 .55-.45 1-1 1H15V9.5c0-1.38-1.12-2.5-2.5-2.5v9.5h4z"
                          fill="white"
                        />
                      </svg>
                      {qbConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Redirecting to Intuit…
                        </>
                      ) : qbConnected ? (
                        <>
                          {qbCompanyName
                            ? `Connected · ${qbCompanyName}`
                            : "Connected to QuickBooks"}
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </>
                      ) : qbChecking ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Checking QuickBooks…
                        </>
                      ) : (
                        "Connect with QuickBooks"
                      )}
                    </button>
                    {qbError && !qbDialogOpen && (
                      <p className="mt-2 text-[10.5px] leading-relaxed text-red-600">
                        {qbError}
                      </p>
                    )}
                    {qbConnected && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10.5px] font-semibold text-emerald-800">
                            {qbCompanyName || "QuickBooks company"}
                            {qbRealmId ? ` · ${qbRealmId}` : ""}
                          </p>
                          <button
                            type="button"
                            onClick={() => setQbDialogOpen(true)}
                            className="text-[10px] font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                          >
                            Manage
                          </button>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-emerald-700/80">
                          {qbDataLoading
                            ? "Reading your QuickBooks data…"
                            : qbImported
                              ? "QuickBooks records are part of this task."
                              : "Import all QuickBooks record types and reports into this task."}
                        </p>
                        {qbSummary && (
                          <div className="mt-1.5 space-y-1">
                            <p className="font-mono text-[9.5px] leading-relaxed text-emerald-800/80">
                              {qbSummary.records} records · {qbSummary.files}{" "}
                              files
                              {qbSummary.reports.length
                                ? ` · ${qbSummary.reports.length} reports`
                                : ""}
                            </p>
                            {qbSummary.entities.length > 0 && (
                              <p className="text-[9.5px] leading-relaxed text-emerald-800/70">
                                {qbSummary.entities
                                  .map(
                                    (entity) =>
                                      `${entity.label}: ${entity.count}`,
                                  )
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                        )}
                        {qbDataWarning && (
                          <p className="mt-1.5 text-[10px] leading-relaxed text-amber-700">
                            {qbDataWarning}
                          </p>
                        )}
                        {qbDataError && (
                          <p className="mt-1.5 text-[10px] leading-relaxed text-red-600">
                            {qbDataError}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void importQuickBooksData()}
                            disabled={qbDataLoading}
                            className="rounded-lg bg-[#2CA01C] px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#248B17] disabled:opacity-60"
                          >
                            {qbImported
                              ? "Refresh imported data"
                              : "Import data"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void disconnectQuickBooks()}
                            disabled={qbDataLoading}
                            className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
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
                    disabled={!agentReady || estimatedCharge > demoBalance}
                    onClick={() => setPaymentOpen(true)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run agent
                  </Button>
                </div>
                {agentReady === null && (
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
                <QuickBooksPushPanel
                  file={
                    outputs.find(
                      (file) => file.name === QUICKBOOKS_UPDATES_FILE,
                    ) ?? null
                  }
                  connected={qbConnected}
                  sessionId={activeSessionId}
                />
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
                      onClick={() => void startAgent(rejectNote)}
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
                <div className="mt-5">
                  <QuickBooksPushPanel
                    file={
                      outputs.find(
                        (file) => file.name === QUICKBOOKS_UPDATES_FILE,
                      ) ?? null
                    }
                    connected={qbConnected}
                    sessionId={activeSessionId}
                  />
                </div>
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
              Environment:{" "}
              <b className="text-xs">
                {runtime === "private" ? "Private workspace" : "Shared server"}.
              </b>
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
              onClick={() => void startAgent()}
              disabled={!agentReady}
            >
              <Check className="h-3.5 w-3.5" />
              Pay {money(estimatedCharge)} credits & run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QuickBooks Connection Dialog */}
      <Dialog open={qbDialogOpen} onOpenChange={setQbDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
          {/* Green Header */}
          <div className="bg-gradient-to-br from-[#2CA01C] to-[#1F7A14] px-6 pt-7 pb-5 text-center text-white">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="12" cy="12" r="11" fill="white" fillOpacity="0.2" />
                <path
                  d="M7.5 7.5C6.12 7.5 5 8.62 5 10v4c0 1.38 1.12 2.5 2.5 2.5H9v-1.5H7.5c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1H9V14.5c0 1.38 1.12 2.5 2.5 2.5V7.5H7.5z"
                  fill="white"
                />
                <path
                  d="M16.5 16.5c1.38 0 2.5-1.12 2.5-2.5v-4c0-1.38-1.12-2.5-2.5-2.5H15v1.5h1.5c.55 0 1 .45 1 1v4c0 .55-.45 1-1 1H15V9.5c0-1.38-1.12-2.5-2.5-2.5v9.5h4z"
                  fill="white"
                />
              </svg>
            </div>
            <DialogHeader>
              <DialogTitle className="font-display text-xl text-white">
                {qbConnected ? "Connected!" : "Connect to QuickBooks"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-white/80 text-xs">
                {qbConnected
                  ? "Your Intuit account is linked to this workspace."
                  : "You'll be redirected to Intuit to sign in and grant access."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 pb-6 pt-4">
            {qbConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-emerald-800">
                      {qbCompanyName || "QuickBooks company"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[9.5px] text-emerald-700/80">
                      Realm {qbRealmId || "unknown"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-ink/8 bg-paper/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold">QuickBooks data</p>
                    <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      {qbDataLoading
                        ? "Loading"
                        : qbSummary
                          ? "Ready"
                          : "Not loaded"}
                    </span>
                  </div>
                  {qbSummary ? (
                    <div className="mt-2 space-y-2">
                      <p className="rounded-lg bg-white px-2 py-1.5 text-[10.5px] font-semibold">
                        {qbSummary.records} records · {qbSummary.files} files
                        {qbSummary.reports.length
                          ? ` · ${qbSummary.reports.length} reports`
                          : ""}
                      </p>
                      <dl className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto text-[10.5px]">
                        {qbSummary.entities.map((entity) => (
                          <div
                            key={entity.file}
                            className="flex justify-between rounded-lg bg-white px-2 py-1.5"
                          >
                            <dt className="text-muted-foreground">
                              {entity.label}
                            </dt>
                            <dd className="font-semibold">{entity.count}</dd>
                          </div>
                        ))}
                        {qbSummary.reports.map((report) => (
                          <div
                            key={report.file}
                            className="flex justify-between rounded-lg bg-white px-2 py-1.5"
                          >
                            <dt className="text-muted-foreground">
                              {report.label}
                            </dt>
                            <dd className="font-semibold">✓</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : (
                    <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                      Load all available QuickBooks record types and reports to
                      use them in this task.
                    </p>
                  )}
                  {qbDataWarning && (
                    <p className="mt-2 text-[10.5px] leading-relaxed text-amber-700">
                      {qbDataWarning}
                    </p>
                  )}
                  {qbDataError && (
                    <p className="mt-2 text-[10.5px] leading-relaxed text-red-600">
                      {qbDataError}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void importQuickBooksData()}
                      disabled={qbDataLoading}
                      className="rounded-lg bg-[#2CA01C] px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#248B17] disabled:opacity-60"
                    >
                      {qbDataLoading
                        ? "Loading…"
                        : qbImported
                          ? "Refresh imported data"
                          : "Import data into task"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnectQuickBooks()}
                      disabled={qbDataLoading}
                      className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-ink/70 transition hover:bg-paper disabled:opacity-60"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={() => setQbDialogOpen(false)}>
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </Button>
                </div>
              </div>
            ) : qbConnecting ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#2CA01C]" />
                <p className="text-sm font-medium">Redirecting to Intuit…</p>
                <p className="text-center text-[11px] text-muted-foreground">
                  Sign in on Intuit&apos;s secure page to authorize this app.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {qbError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
                    {qbError}
                  </div>
                )}
                <ol className="space-y-2.5">
                  {[
                    "You are redirected to Intuit's own sign-in page.",
                    "Sign in and choose the QuickBooks company to connect.",
                    "Grant the accounting access requested by this app.",
                    "Intuit returns you here with secure OAuth tokens.",
                  ].map((step, index) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#2CA01C]/10 text-[10px] font-semibold text-[#1F7A14]">
                        {index + 1}
                      </span>
                      <span className="text-[11px] leading-relaxed text-muted-foreground">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="flex items-start gap-2 rounded-lg border border-ink/8 px-3 py-2.5">
                  <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-[10px] leading-relaxed text-muted-foreground">
                    Your QuickBooks email and password are entered only on
                    Intuit&apos;s site. This app never sees or stores them.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void connectQuickBooks()}
                  disabled={qbConnecting}
                  className="w-full rounded-xl bg-[#2CA01C] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#248B17] hover:shadow-md active:scale-[0.98] disabled:opacity-60"
                >
                  Continue to Intuit
                </button>
                <p className="text-center text-[10px] text-muted-foreground">
                  By connecting you agree to Intuit&apos;s{" "}
                  <a
                    href="https://www.intuit.com/legal/terms/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-ink"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://www.intuit.com/privacy/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-ink"
                  >
                    Privacy Policy
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
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
