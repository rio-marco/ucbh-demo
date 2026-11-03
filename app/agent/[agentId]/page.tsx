import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import WorkspaceClient from "@/components/workspace/workspace-client";
import { AGENTS } from "@/data/agents";
import { getSession, listSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ resume?: string; note?: string }>;
}) {
  const { agentId } = await params;
  const query = await searchParams;
  const agent = AGENTS.find((item) => item.id === agentId);

  if (!agent) notFound();

  const sessionId = `UCBH-${randomUUID().slice(0, 5).toUpperCase()}`;
  const [sessions, savedRun] = await Promise.all([
    listSessions(agent.id),
    query.resume ? getSession(query.resume) : Promise.resolve(null),
  ]);
  const resume =
    savedRun &&
    savedRun.agentId === agent.id &&
    savedRun.status === "review" &&
    savedRun.sourceFiles && savedRun.sourceFiles.length > 0 &&
    query.note
      ? {
          sessionId: savedRun.id,
          prompt: savedRun.prompt,
          files: savedRun.sourceFiles,
          environment: savedRun.environment,
          revisionNote: query.note,
        }
      : undefined;

  return (
    <WorkspaceClient
      agent={agent}
      sessionId={sessionId}
      initialSessions={sessions}
      resume={resume}
    />
  );
}
