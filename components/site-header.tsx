import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/logo";
import SiteNav from "@/components/site-nav";
import { Button } from "@/components/ui/button";

export default function SiteHeader({
  children,
  actions,
  navigation = true,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  navigation?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="page-container flex h-16 items-center gap-3 sm:gap-5">
        <Link href="/" aria-label="UCBH home" className="shrink-0 rounded-lg">
          <Logo />
        </Link>

        {navigation ? (
          <>
            <span className="hidden h-6 w-px bg-border md:block" />
            <SiteNav />
          </>
        ) : null}

        {children ? (
          <div className="hidden min-w-0 items-center gap-3 border-l border-border pl-4 md:flex">
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
