import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Legal
        </p>
        <h1 className="text-3xl font-semibold text-ink">Privacy Policy</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          This workspace stores OAuth tokens for the services you choose to
          connect. Tokens are encrypted at rest and scoped to your browser
          session. We do not sell your data or use it for advertising.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          Replace this placeholder with your reviewed privacy policy before
          submitting the Intuit production app assessment.
        </p>
      </div>
      <Link className="text-sm text-primary underline" href="/">
        Return to workspace
      </Link>
    </main>
  );
}
