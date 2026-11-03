import { notFound, redirect } from "next/navigation";
import { AGENTS } from "@/data/agents";

export default async function AgentDetails({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  if (!AGENTS.some((agent) => agent.id === agentId)) notFound();
  redirect(`/agent/${agentId}`);
}
