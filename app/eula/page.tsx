import Link from "next/link";

export default function EulaPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Legal
        </p>
        <h1 className="text-3xl font-semibold text-ink">
          End User License Agreement
        </h1>
        <p className="text-sm leading-7 text-muted-foreground">
          By connecting an account, you authorize this workspace to access the
          data you permit through the provider&apos;s consent screen and to use
          that data only to fulfill the actions you request.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          Replace this placeholder with your reviewed end user license agreement
          before submitting the Intuit production app assessment.
        </p>
      </div>
      <Link className="text-sm text-primary underline" href="/">
        Return to workspace
      </Link>
    </main>
  );
}
