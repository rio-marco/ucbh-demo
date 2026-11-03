import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import WorkspaceClient from "@/components/workspace/workspace-client";
import { AGENTS } from "@/data/agents";
import { listSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const agent = AGENTS.find((item) => item.id === agentId);

  if (!agent) notFound();

  const sessionId = `UCBH-${randomUUID().slice(0, 5).toUpperCase()}`;
  const sessions = await listSessions(agent.id);

  return (
    <WorkspaceClient
      agent={agent}
      sessionId={sessionId}
      initialSessions={sessions}
    />
  );
}
