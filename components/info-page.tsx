import type { ReactNode } from "react";
import SiteHeader from "@/components/site-header";

export default function InfoPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="page-container py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="label">{eyebrow}</p>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight md:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
              {description}
            </p>
          ) : null}
          <div className="mt-8 space-y-5">{children}</div>
        </div>
      </main>
    </div>
  );
}
