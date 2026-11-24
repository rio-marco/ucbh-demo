import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import ComingSoonBadge, {
  COMING_SOON_SURFACE,
} from "@/components/coming-soon-badge";
import Logo from "@/components/logo";
import { AGENTS } from "@/data/agents";

const year = new Date().getFullYear();

const PLATFORM_LINKS = [{ label: "Dashboard", href: "/" }];

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-ink/10 bg-white/75">
      <div className="mx-auto max-w-6xl px-5 py-9 md:py-11">
        <div className="grid gap-9 sm:grid-cols-2 md:grid-cols-[1.5fr_0.75fr_1fr] md:gap-14">
          <div>
            <Link href="/" aria-label="UCBH home" className="inline-flex">
              <Logo />
            </Link>
            <p className="mt-4 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
              A secure workspace for running AI agents against uploaded data,
              with each run contained in an isolated session.
            </p>
          </div>

          <nav aria-label="Platform">
            <p className="font-display text-xs font-bold">Platform</p>
            <ul className="mt-4 space-y-2.5 text-[12.5px] text-muted-foreground">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="hover:text-ink">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Agents">
            <p className="font-display text-xs font-bold">Agents</p>
            <ul className="mt-4 space-y-2.5 text-[12.5px] text-muted-foreground">
              {AGENTS.map((agent) => {
                const comingSoon = Boolean(agent.comingSoon);
                return (
                  <li key={agent.id}>
                    {comingSoon ? (
                      <div
                        aria-disabled="true"
                        className={`inline-flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1 ${COMING_SOON_SURFACE}`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full opacity-70"
                          style={{ background: agent.accent }}
                        />
                        {agent.name}
                        <ComingSoonBadge compact />
                      </div>
                    ) : (
                      <Link
                        href={`/agents/${agent.id}`}
                        className="inline-flex items-center gap-2 hover:text-ink"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: agent.accent }}
                        />
                        {agent.name}
                        <span className="text-[10px] text-muted-foreground/70">
                          · {agent.role}
                        </span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="mt-9 flex flex-col gap-3 border-t border-ink/10 pt-5 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <p>© {year} UCBH. All rights reserved.</p>
            <Link className="hover:text-foreground" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-foreground" href="/eula">
              EULA
            </Link>
            <Link className="hover:text-foreground" href="/disconnect">
              Disconnect
            </Link>
          </div>
          <p className="inline-flex items-center gap-1.5 leading-relaxed">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Runs are isolated.
          </p>
        </div>
      </div>
    </footer>
  );
}
