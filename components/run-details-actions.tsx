"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionRecord } from "@/lib/types";

export default function RunDetailsActions({ session, canUpdate }: { session: SessionRecord; canUpdate: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finish = async (status: "accepted" | "rejected") => {
    if (status === "rejected" && !note.trim()) {
      setError("Add a revision note explaining why this result is being rejected.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const cleaned = await fetch(`/api/runtime?sessionId=${encodeURIComponent(session.id)}`, { method: "DELETE" });
      if (!cleaned.ok) throw new Error("Could not clean Agent runtime data. The run is still awaiting approval.");
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
          trace: status === "rejected" ? [...session.trace, `Rejected: ${note.trim()}`] : session.trace,
          reviewNote: status === "rejected" ? note.trim() : "",
        }),
      });
      if (!saved.ok) throw new Error("Could not update the run status.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this run.");
    } finally {
      setBusy(false);
    }
  };

  const updateResult = () => {
    if (!note.trim()) {
      setError("Write a revision note before updating the result.");
      return;
    }
    router.push(`/agent/${session.agentId}?resume=${encodeURIComponent(session.id)}&note=${encodeURIComponent(note.trim())}`);
  };

  if (session.status !== "review") return null;
  return (
    <div className="bai-card p-5">
      <label className="block text-xs font-semibold" htmlFor="run-review-note">Revision note <span className="font-normal text-muted-foreground">(required for Reject or Update Result)</span></label>
      <textarea id="run-review-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} className="mt-2 min-h-24 w-full rounded-xl border border-ink/12 bg-white p-3 text-xs" placeholder="Explain what should change…" />
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <Button variant="danger" onClick={() => void finish("rejected")} disabled={busy || !note.trim()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Reject</Button>
        <Button variant="line" onClick={updateResult} disabled={busy || !note.trim() || !canUpdate}><RotateCcw className="h-3.5 w-3.5" />Update Result</Button>
        <Button onClick={() => void finish("accepted")} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept</Button>
      </div>
      {!canUpdate && <p className="mt-3 text-[10px] text-muted-foreground">The uploaded files are no longer available for another run. Update from this page is disabled.</p>}
    </div>
  );
}
