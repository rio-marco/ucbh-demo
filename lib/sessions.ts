import { promises as fs } from "node:fs";
import path from "node:path";
import type { SessionRecord, SessionStats, SessionStatus } from "@/lib/types";

const STORE_PATH = path.join(process.cwd(), ".data", "sessions.json");
const STATUSES: SessionStatus[] = [
  "running",
  "review",
  "accepted",
  "rejected",
  "failed",
  "cancelled",
];

let writeQueue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<SessionRecord[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSessionRecord);
  } catch {
    return [];
  }
}

async function writeAll(sessions: SessionRecord[]) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(sessions, null, 2), "utf8");
  await fs.rename(temporary, STORE_PATH);
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.agentId === "string" &&
    typeof record.agentName === "string" &&
    typeof record.title === "string" &&
    typeof record.status === "string" &&
    STATUSES.includes(record.status as SessionStatus) &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

function normalize(record: SessionRecord): SessionRecord {
  const inputTokens = Math.max(0, Math.round(record.inputTokens || 0));
  const outputTokens = Math.max(0, Math.round(record.outputTokens || 0));
  return {
    ...record,
    prompt:
      typeof record.prompt === "string" ? record.prompt.slice(0, 20_000) : "",
    files: Array.isArray(record.files) ? record.files.slice(0, 10) : [],
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    outputs: Math.max(0, Math.round(record.outputs || 0)),
  };
}

function mutate<T>(
  update: (sessions: SessionRecord[]) => {
    sessions: SessionRecord[];
    result: T;
  },
): Promise<T> {
  const task = writeQueue.then(async () => {
    const current = await readAll();
    const { sessions, result } = update(current);
    await writeAll(sessions);
    return result;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

export async function listSessions(agentId?: string): Promise<SessionRecord[]> {
  const sessions = await readAll();
  return sessions
    .filter((session) => !agentId || session.agentId === agentId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAgentStats(agentId: string): Promise<SessionStats> {
  const sessions = await listSessions(agentId);
  const stats = sessions.reduce<SessionStats>(
    (total, session) => {
      total.totalRuns += 1;
      if (session.status === "accepted") total.acceptedRuns += 1;
      if (session.status === "review" || session.status === "running")
        total.reviewRuns += 1;
      total.inputTokens += session.inputTokens;
      total.outputTokens += session.outputTokens;
      total.filesGenerated += session.outputs;
      if (!total.lastRunAt || session.updatedAt > total.lastRunAt)
        total.lastRunAt = session.updatedAt;
      return total;
    },
    {
      totalRuns: 0,
      acceptedRuns: 0,
      reviewRuns: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      filesGenerated: 0,
      lastRunAt: null,
    },
  );
  stats.totalTokens = stats.inputTokens + stats.outputTokens;
  return stats;
}

export type SessionInput = {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  status: SessionStatus;
  prompt: string;
  files: { name: string; size: number }[];
  inputTokens?: number;
  outputTokens?: number;
  outputs?: number;
};

export async function upsertSession(
  input: SessionInput,
): Promise<SessionRecord> {
  return mutate((sessions) => {
    const now = new Date().toISOString();
    const index = sessions.findIndex((session) => session.id === input.id);
    const existing = index >= 0 ? sessions[index] : null;
    const next = normalize({
      ...(existing ?? {}),
      ...input,
      inputTokens: input.inputTokens ?? existing?.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? existing?.outputTokens ?? 0,
      outputs: input.outputs ?? existing?.outputs ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } as SessionRecord);
    if (index >= 0) sessions[index] = next;
    else sessions.unshift(next);
    return { sessions, result: next };
  });
}

export async function deleteSession(id: string): Promise<boolean> {
  return mutate((sessions) => {
    const next = sessions.filter((session) => session.id !== id);
    return { sessions: next, result: next.length !== sessions.length };
  });
}

export { STATUSES as SESSION_STATUSES };
