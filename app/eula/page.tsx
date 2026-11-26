import Link from "next/link";
import InfoPage from "@/components/info-page";
import { Button } from "@/components/ui/button";

export default function EulaPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="End user license agreement"
      description="By connecting an account, you authorize this workspace to access the data you permit through the provider's consent screen and to use that data only to fulfill the actions you request."
    >
      <section className="bai-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold">Permitted use</h2>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          The workspace is provided for reviewing and preparing data-related
          tasks. You remain responsible for the instructions you give the agent
          and for approving any changes before they are applied.
        </p>
      </section>
      <section className="bai-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold">Placeholder notice</h2>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          This is a placeholder agreement. Replace it with your reviewed end
          user license agreement before submitting the Intuit production app
          assessment.
        </p>
      </section>
      <Button asChild variant="line">
        <Link href="/">Return to the workspace</Link>
      </Button>
    </InfoPage>
  );
}
