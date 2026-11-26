import Link from "next/link";
import InfoPage from "@/components/info-page";
import { Button } from "@/components/ui/button";

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Privacy policy"
      description="This workspace stores OAuth tokens only for the services you choose to connect. Tokens are encrypted at rest and scoped to your browser session. We do not sell your data or use it for advertising."
    >
      <section className="bai-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold">Information we store</h2>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          Connection tokens, task details, and run summaries are kept for your
          browser session. Generated files are available for review and are
          removed with the temporary workspace after the run.
        </p>
      </section>
      <section className="bai-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold">Placeholder notice</h2>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          This is a placeholder policy. Replace it with your reviewed privacy
          policy before submitting the Intuit production app assessment.
        </p>
      </section>
      <Button asChild variant="line">
        <Link href="/">Return to the workspace</Link>
      </Button>
    </InfoPage>
  );
}
