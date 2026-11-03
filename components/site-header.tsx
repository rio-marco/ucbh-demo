import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/logo";

export default function SiteHeader({
  brand = false,
  children,
  actions,
}: {
  brand?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink/8 bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="UCBH home" className="shrink-0">
            <Logo compact={!brand} />
          </Link>
          {children}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
