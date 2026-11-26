import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Logo from "@/components/logo";

const year = new Date().getFullYear();

const LINK_GROUPS = [
  {
    title: "Platform",
    links: [
      { label: "Overview", href: "/" },
      { label: "Agent profiles", href: "/#agents" },
      { label: "How it works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "End user license agreement", href: "/eula" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="page-container py-12 md:py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] md:gap-8">
          <div className="max-w-sm">
            <Link
              href="/"
              aria-label="UCBH home"
              className="inline-flex rounded-lg"
            >
              <Logo />
            </Link>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              A workspace for running AI agents against uploaded data and
              QuickBooks records. Every task stays under your review.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-[12px] font-medium text-foreground/70">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Each run uses a temporary, isolated workspace.
            </p>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
                {group.title}
              </p>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                      {link.href.startsWith("http") ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} UCBH. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
