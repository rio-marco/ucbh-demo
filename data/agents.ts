import type { Agent } from "@/lib/types";

// Agent profiles provide task context; all execution and responses come from Agent.
export const AGENTS: Agent[] = [
  {
    id: "atlas",
    name: "Atlas",
    role: "Sales & inventory",
    accent: "#F5CF4E",
    tagline:
      "Analyze sales and stock data, identify risk, and prepare recommendations.",
    capabilities: [
      "Demand analysis",
      "Stock risk review",
      "Recommendation drafting",
    ],
    prompts: [""],
  },
  {
    id: "ledger",
    name: "Ledger",
    role: "Invoice audit",
    accent: "#E7A57A",
    tagline:
      "Review invoice data for duplicates, missing fields, and unusual variances.",
    capabilities: ["Duplicate review", "Variance analysis", "Audit summary"],
    prompts: [""],
  },
  {
    id: "relay",
    name: "Relay",
    role: "Support triage",
    accent: "#A9C7E8",
    tagline:
      "Organize support data, surface urgent cases, and prepare a triage summary.",
    capabilities: ["Queue analysis", "Priority review", "Triage summary"],
    prompts: [""],
  },
];
