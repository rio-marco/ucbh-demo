"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DatabaseZap,
  ExternalLink,
  FileText,
  History,
  Loader2,
  ShieldCheck,
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
import type { SessionRecord, SessionStatus } from "@/lib/types";

const STATUS_META: Record<SessionStatus, { label: string; styles: string }> = {
  running: {
    label: "Running",
    styles: "border-sky-200 bg-sky-50 text-sky-700",
  },
  review: {
    label: "Awaiting approval",
    styles: "border-amber-200 bg-amber-50 text-amber-700",
  },
  accepted: {
    label: "Accepted",
    styles: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  rejected: {
    label: "Rejected",
    styles: "border-orange-200 bg-orange-50 text-orange-700",
  },
  failed: { label: "Failed", styles: "border-red-200 bg-red-50 text-red-700" },
  cancelled: {
    label: "Cancelled",
    styles: "border-ink/10 bg-ink/5 text-muted-foreground",
  },
};

const number = (value: number) => value.toLocaleString("en-US");
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

function timeAgo(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium ${meta.styles}`}
    >
      {meta.label}
    </span>
  );
}

export function CleanupDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
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
            Remove this run’s Agent runtime history from the server. Run history
            and its review status are kept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[10.5px] leading-relaxed text-red-800">
            <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Removes the run’s saved Agent thread and runtime history.
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[10.5px] leading-relaxed text-emerald-900">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Keeps the session summary, token totals, result, and status in run
              history.
            </span>
          </div>
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
            Clean Agent data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SessionHistory({
  sessions,
  onDelete,
}: {
  sessions: SessionRecord[];
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<SessionRecord | null>(null);
  const [pending, setPending] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setPending(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="bai-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-ink/8 p-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <History className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Run history</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            {sessions.length} run{sessions.length === 1 ? "" : "s"} · review and
            inspect previous results
          </p>
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            No agent sessions yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[10.5px] leading-relaxed text-muted-foreground">
            Your runs, prompts, usage, and review status will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left">
            <thead className="bg-paper/70">
              <tr className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {[
                  "Run",
                  "Brief",
                  "Environment",
                  "Tokens",
                  "Fee",
                  "Status",
                  "Submitted",
                  "Action",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-4 py-3 font-medium"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className="align-top transition-colors hover:bg-paper/40"
                >
                  <td className="max-w-[190px] px-4 py-3">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p
                          className="truncate text-[11px] font-semibold"
                          title={session.files
                            .map((file) => file.name)
                            .join(", ")}
                        >
                          {session.files[0]?.name || session.title}
                        </p>
                        <p
                          className="mt-1 truncate font-mono text-[9px] text-muted-foreground"
                          title={session.id}
                        >
                          Run-{session.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[230px] px-4 py-3">
                    <p
                      className="line-clamp-2 text-[11px] leading-relaxed text-ink/75"
                      title={session.prompt}
                    >
                      {session.prompt || session.title}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[11px]">
                    {session.environment === "private" ? "Private" : "Shared"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[11px] tabular-nums">
                    {number(session.totalTokens)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[11px] tabular-nums">
                    {money(session.fee)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={session.status} />
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-[10px] text-muted-foreground"
                    title={new Date(session.createdAt).toLocaleString()}
                  >
                    {timeAgo(session.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/run-details/${encodeURIComponent(session.id)}`}
                        aria-label={`View details for ${session.id}`}
                        title="View run details"
                        className="grid h-8 w-8 place-items-center rounded-lg text-primary hover:bg-primary/10"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete ${session.id}`}
                        title="Delete run"
                        onClick={() => setDeleteTarget(session)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Delete run?
            </DialogTitle>
            <DialogDescription>
              This removes {deleteTarget?.id} from run history. This cannot be
              undone.
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
    </section>
  );
}
