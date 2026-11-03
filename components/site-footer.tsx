import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import Logo from "@/components/logo";
import { AGENTS } from "@/data/agents";

const year = new Date().getFullYear();

const PLATFORM_LINKS = [
  { label: "Dashboard", href: "/" },
  { label: "Agent profiles", href: "/#agents" },
  { label: "Data handling", href: "/#data-handling" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-white/55">
      <div className="mx-auto max-w-6xl px-5 py-10 md:py-12">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr] md:gap-12">
          <div>
            <Link href="/" aria-label="UCBH home" className="inline-flex">
              <Logo />
            </Link>
            <p className="mt-4 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
              A focused agent platform for running Agent AI against uploaded
              data in temporary, isolated workspaces.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-ink/10 bg-white/70 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Systems operational
            </div>
          </div>

          <nav aria-label="Platform">
            <p className="label">Platform</p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-muted-foreground">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Agents">
            <p className="label">Agents</p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-muted-foreground">
              {AGENTS.map((agent) => (
                <li key={agent.id}>
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
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-9 flex flex-col gap-3 border-t border-ink/10 pt-5 text-[10.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} UCBH. All rights reserved.</p>
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Isolated workspaces · session data stays with the agent runtime.
          </p>
        </div>
      </div>
    </footer>
  );
}
