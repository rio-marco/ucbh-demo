"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionRecord } from "@/lib/types";

export default function RunDetailsActions({
  session,
  canUpdate,
}: {
  session: SessionRecord;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isReview = session.status === "review";

  const finish = async (status: "accepted" | "rejected") => {
    if (status === "rejected" && !note.trim()) {
      setError(
        "Add a revision note explaining why this result is being rejected.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const cleaned = await fetch(
        `/api/runtime?sessionId=${encodeURIComponent(session.id)}`,
        { method: "DELETE" },
      );
      if (!cleaned.ok)
        throw new Error(
          "Could not clean Agent runtime data. The run is still awaiting approval.",
        );
      const saved = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: session.id,
          agentId: session.agentId,
          status,
          prompt: session.prompt,
          files: session.files,
          inputTokens: session.inputTokens,
          outputTokens: session.outputTokens,
          outputs: session.outputs,
          environment: session.environment,
          fee: session.fee,
          result: session.result,
          trace:
            status === "rejected"
              ? [...session.trace, `Rejected: ${note.trim()}`]
              : session.trace,
          reviewNote: status === "rejected" ? note.trim() : "",
        }),
      });
      if (!saved.ok) throw new Error("Could not update the run status.");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not update this run.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updateResult = () => {
    if (!note.trim()) {
      setError("Write a revision note before updating the result.");
      return;
    }
    router.push(
      `/agent/${session.agentId}?resume=${encodeURIComponent(session.id)}&note=${encodeURIComponent(note.trim())}`,
    );
  };

  return (
    <section className="bai-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">Client decision</p>
          <h2 className="mt-2 font-display text-xl font-bold">
            Review and choose an action
          </h2>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[9px] ${isReview ? "border-amber-200 bg-amber-50 text-amber-800" : "border-ink/10 bg-paper text-muted-foreground"}`}
        >
          {isReview ? "Decision needed" : "Decision recorded"}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Read the agent response and task files before deciding. Add a note when
        rejecting or requesting an update.
      </p>
      <label
        className="mt-4 block text-xs font-semibold"
        htmlFor="run-review-note"
      >
        Review note{" "}
        <span className="font-normal text-muted-foreground">
          (required for Reject and Update Result)
        </span>
      </label>
      <textarea
        id="run-review-note"
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setError("");
        }}
        maxLength={4000}
        disabled={!isReview || busy}
        className="mt-2 min-h-24 w-full rounded-xl border border-ink/12 bg-white p-3 text-xs leading-relaxed disabled:bg-paper/60"
        placeholder="Explain what should change, or why this result should be rejected…"
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="flex flex-col items-start rounded-xl border border-red-200 bg-red-50/40 p-3">
          <Button
            variant="danger"
            className="w-full"
            onClick={() => void finish("rejected")}
            disabled={!isReview || busy || !note.trim()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Reject
          </Button>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Decline this result, save your reason, and close the run after
            cleanup.
          </p>
        </div>
        <div className="flex flex-col items-start rounded-xl border border-ink/10 bg-white p-3">
          <Button
            variant="line"
            className="w-full"
            onClick={updateResult}
            disabled={!isReview || busy || !note.trim() || !canUpdate}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Update Result
          </Button>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Send your note and the saved task files back to the agent for
            another run.
          </p>
        </div>
        <div className="flex flex-col items-start rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <Button
            className="w-full"
            onClick={() => void finish("accepted")}
            disabled={!isReview || busy}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Accept
          </Button>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Approve this result, record your decision, and complete cleanup.
          </p>
        </div>
      </div>
      {!canUpdate && isReview && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Saved input files are unavailable, so Update Result is disabled for
          this run.
        </p>
      )}
    </section>
  );
}
