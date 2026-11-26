"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/#agents", label: "Agents" },
  { href: "/#how-it-works", label: "How it works" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : false);

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="hidden items-center gap-1 md:flex"
      >
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground",
              isActive(link.href) && "bg-primary/5 text-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="md:hidden">
        <button
          type="button"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((current) => !current)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-foreground"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        {open && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="absolute left-0 right-0 top-full border-b border-border bg-card px-5 py-3 shadow-lg"
          >
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/agent/atlas"
              onClick={() => setOpen(false)}
              className="btn-ink mt-2 w-full"
            >
              Open workspace
            </Link>
          </nav>
        )}
      </div>
    </>
  );
}
