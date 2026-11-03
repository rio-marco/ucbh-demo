"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  Coins,
  DatabaseZap,
  FileText,
  History,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AGENTS } from "@/data/agents";
import type { SessionRecord, SessionStatus } from "@/lib/types";

const STATUS_META: Record<
  SessionStatus,
  { label: string; badge: string; dot: string }
> = {
  running: {
    label: "Running",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  review: {
    label: "Awaiting review",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  accepted: {
    label: "Accepted",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Revision requested",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
  },
  failed: {
    label: "Failed",
    badge: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Cancelled",
    badge: "border-ink/10 bg-ink/5 text-muted-foreground",
    dot: "bg-ink/30",
  },
};

const number = (value: number) => value.toLocaleString("en-US");
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function StatusBadge({ status }: { status: SessionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function CleanupDialog({
  open,
  onOpenChange,
  defaultAgentId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAgentId: string;
  onConfirm: (agentId: string) => Promise<void> | void;
}) {
  const [agentId, setAgentId] = useState(defaultAgentId);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setAgentId(defaultAgentId);
  }, [open, defaultAgentId]);

  const selected = AGENTS.find((agent) => agent.id === agentId);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm(agentId);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Data cleanup
          </DialogTitle>
          <DialogDescription>
            Select an agent and clear its session history. User session history
            is not stored — only the Agent runtime history is removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setAgentId(agent.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                agentId === agent.id
                  ? "border-primary/50 bg-primary/[0.04] ring-2 ring-primary/10"
                  : "border-ink/10 hover:border-primary/25"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="grid h-8 w-8 place-items-center rounded-lg border border-ink/10 font-display text-sm font-bold"
                  style={{ background: `${agent.accent}66` }}
                >
                  {agent.name[0]}
                </span>
                <span>
                  <span className="block text-xs font-semibold">
                    {agent.name}
                  </span>
                  <span className="block font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    {agent.role} · Agent
                  </span>
                </span>
              </span>
              {agentId === agent.id && (
                <span className="chip !bg-emerald-50 !text-emerald-700">
                  Selected
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[10.5px] leading-relaxed text-red-800">
          <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This permanently removes {selected?.name ?? "the selected agent"}'s
            agent runtime history and token records from this deployment.
            Generated task files are already deleted after each run.
          </span>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="line"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void confirm()}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <DatabaseZap className="h-3.5 w-3.5" />
            )}
            Clean history
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SessionHistory({
  sessions,
  agentId,
  onDelete,
  onCleanup,
}: {
  sessions: SessionRecord[];
  agentId: string;
  onDelete: (id: string) => Promise<void> | void;
  onCleanup: (agentId: string) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<SessionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionRecord | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setPending(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
      setSelected((current) =>
        current?.id === deleteTarget.id ? null : current,
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="bai-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <History className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Session history</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              {sessions.length} session{sessions.length === 1 ? "" : "s"} ·
              stored for the agent, not a user account
            </p>
          </div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            No agent sessions yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[10.5px] leading-relaxed text-muted-foreground">
            Sessions appear here after you prepare a task in the workspace.
            Dashboard and agent details pages never show history.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink/8">
          {sessions.map((session) => (
            <li key={session.id}>
              <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper/70 sm:px-5">
                <button
                  type="button"
                  onClick={() => setSelected(session)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-xs font-semibold">
                        {session.title}
                      </span>
                      <StatusBadge status={session.status} />
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] text-muted-foreground">
                      <span>{session.id}</span>
                      <span>{formatDate(session.updatedAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Coins className="h-2.5 w-2.5" />
                        {number(session.totalTokens)} tokens
                      </span>
                      <span>
                        {session.outputs} file
                        {session.outputs === 1 ? "" : "s"}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${session.title}`}
                  onClick={() => setDeleteTarget(session)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-w-2xl rounded-2xl">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    {selected.id}
                  </span>
                </div>
                <DialogTitle className="mt-2 text-left font-display text-xl">
                  {selected.title}
                </DialogTitle>
                <DialogDescription className="text-left">
                  {selected.agentName} · Agent session ·{" "}
                  {formatDate(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
                <div className="rounded-xl border border-ink/8 bg-paper/60 p-3.5">
                  <p className="label">Prompt</p>
                  <p className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink/75">
                    {selected.prompt || "No prompt recorded."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-paper/70 p-3">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      Input tokens
                    </p>
                    <p className="mt-1.5 font-display text-lg font-bold">
                      {number(selected.inputTokens)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-paper/70 p-3">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      Output tokens
                    </p>
                    <p className="mt-1.5 font-display text-lg font-bold">
                      {number(selected.outputTokens)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      Total tokens
                    </p>
                    <p className="mt-1.5 font-display text-lg font-bold">
                      {number(selected.totalTokens)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="label">Task files · {selected.files.length}</p>
                  {selected.files.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {selected.files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-2 rounded-lg border border-ink/8 px-2.5 py-2 text-[11px]"
                        >
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span className="min-w-0 flex-1 truncate">
                            {file.name}
                          </span>
                          <span className="font-mono text-[9px] text-muted-foreground">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      No files recorded.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap justify-between gap-2 rounded-xl border border-ink/8 px-3 py-2.5 text-[10.5px] text-muted-foreground">
                  <span>Generated files: {selected.outputs}</span>
                  <span>Updated: {formatDate(selected.updatedAt)}</span>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setDeleteTarget(selected);
                    setSelected(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete session
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Delete session?
            </DialogTitle>
            <DialogDescription>
              This removes {deleteTarget?.id} from the session history. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="line"
              onClick={() => setDeleteTarget(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void confirmDelete()}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CleanupDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        defaultAgentId={agentId}
        onConfirm={onCleanup}
      />
    </section>
  );
}
