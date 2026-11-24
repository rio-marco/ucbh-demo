"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Action = "connect" | "disconnect";

export function QuickBooksAccountAction({ action }: { action: Action }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (action === "connect") {
        const response = await fetch("/api/mcp/connector/auth?returnTo=/", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          authUrl?: string;
          error?: string;
        };
        if (!response.ok || !data.authUrl) {
          throw new Error(data.error || "QuickBooks login is unavailable.");
        }
        window.location.assign(data.authUrl);
        return;
      }

      const response = await fetch("/api/quickbooks/status", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Disconnect failed.");
      await fetch("/api/mcp/connector/status", { method: "DELETE" }).catch(
        () => undefined,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete the request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <Button onClick={() => void run()} disabled={busy}>
        {busy
          ? "Working…"
          : action === "connect"
            ? "Connect QuickBooks"
            : "Disconnect QuickBooks"}
      </Button>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
