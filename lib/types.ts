export type Agent = {
  id: string;
  name: string;
  role: string;
  accent: string;
  tagline: string;
  capabilities: string[];
  prompts: string[];
};

export type SessionStatus =
  | "running"
  | "review"
  | "accepted"
  | "rejected"
  | "failed"
  | "cancelled";

export type SessionFile = { name: string; size: number };

export type SessionRecord = {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  status: SessionStatus;
  prompt: string;
  files: SessionFile[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  outputs: number;
  createdAt: string;
  updatedAt: string;
};

export type SessionStats = {
  totalRuns: number;
  acceptedRuns: number;
  reviewRuns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  filesGenerated: number;
  lastRunAt: string | null;
};
