import Link from "next/link";
import { QuickBooksAccountAction } from "@/components/quickbooks-account-action";

export default function ReconnectPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          QuickBooks
        </p>
        <h1 className="text-3xl font-semibold text-ink">Reconnect QuickBooks</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          Your previous QuickBooks connection is no longer active. Connect the
          company you want this workspace to use. Each connection is stored for
          your browser session only.
        </p>
      </div>
      <QuickBooksAccountAction action="connect" />
      <Link className="text-sm text-primary underline" href="/">
        Return to workspace
      </Link>
    </main>
  );
}
