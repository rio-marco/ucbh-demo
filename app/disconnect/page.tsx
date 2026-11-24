import Link from "next/link";
import { QuickBooksAccountAction } from "@/components/quickbooks-account-action";

export default function DisconnectPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          QuickBooks
        </p>
        <h1 className="text-3xl font-semibold text-ink">Disconnect QuickBooks</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          Disconnecting removes the stored tokens for this browser session and
          revokes them with Intuit. You can reconnect at any time from the
          workspace.
        </p>
      </div>
      <QuickBooksAccountAction action="disconnect" />
      <Link className="text-sm text-primary underline" href="/">
        Return to workspace
      </Link>
    </main>
  );
}
