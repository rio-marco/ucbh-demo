import Link from "next/link";
import InfoPage from "@/components/info-page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <InfoPage
      eyebrow="404 · Page not found"
      title="We can't find that page"
      description="The page you are looking for does not exist or may have moved. Return to the overview to continue."
    >
      <Button asChild>
        <Link href="/">Back to overview</Link>
      </Button>
    </InfoPage>
  );
}
