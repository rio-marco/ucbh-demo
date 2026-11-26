import Link from "next/link";
import InfoPage from "@/components/info-page";
import { QuickBooksAccountAction } from "@/components/quickbooks-account-action";
import { Button } from "@/components/ui/button";

export default function ReconnectPage() {
  return (
    <InfoPage
      eyebrow="QuickBooks"
      title="Reconnect QuickBooks"
      description="Your previous QuickBooks connection is no longer active. Connect the company you want this workspace to use. Each connection is stored for this browser session only."
    >
      <section className="bai-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold">Connect a company</h2>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          You will be redirected to Intuit to sign in and authorize access.
          Your credentials are entered only on Intuit&apos;s website.
        </p>
        <div className="mt-5">
          <QuickBooksAccountAction action="connect" />
        </div>
      </section>
      <Button asChild variant="line">
        <Link href="/">Return to the workspace</Link>
      </Button>
    </InfoPage>
  );
}
