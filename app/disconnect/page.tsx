import Link from "next/link";
import InfoPage from "@/components/info-page";
import { QuickBooksAccountAction } from "@/components/quickbooks-account-action";
import { Button } from "@/components/ui/button";

export default function DisconnectPage() {
  return (
    <InfoPage
      eyebrow="QuickBooks"
      title="Disconnect QuickBooks"
      description="Disconnecting removes the stored tokens for this browser session and revokes them with Intuit. You can reconnect at any time from the workspace."
    >
      <section className="bai-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold">Disconnect your account</h2>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          After disconnecting, the agent can no longer read QuickBooks data in
          this browser until you connect again.
        </p>
        <div className="mt-5">
          <QuickBooksAccountAction action="disconnect" />
        </div>
      </section>
      <Button asChild variant="line">
        <Link href="/">Return to the workspace</Link>
      </Button>
    </InfoPage>
  );
}
