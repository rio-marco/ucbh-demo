import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const AGENT_TEMP_PREFIX = "ucbh-";

export type RuntimeCleanupResult = {
  threads: number;
  rolloutFiles: number;
  historyEntries: number;
};

/**
 * Remove any leftover temporary workspaces created for a run.
 *
 * Claude runs entirely inside these temporary directories and the execute
 * route deletes them in its `finally` block. This cleanup is a best-effort
 * safety net for interrupted runs.
 */
export async function clearAgentRuntimeHistory(
  sessionId?: string,
): Promise<RuntimeCleanupResult> {
  const sessionKey = sessionId
    ?.replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  const prefix = sessionKey
    ? `${AGENT_TEMP_PREFIX}agent-${sessionKey}-`
    : `${AGENT_TEMP_PREFIX}agent-`;

  const entries = await fs
    .readdir(/*turbopackIgnore: true*/ os.tmpdir(), { withFileTypes: true })
    .catch(() => [] as { isDirectory(): boolean; name: string }[]);

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    await fs
      .rm(path.join(os.tmpdir(), entry.name), {
        recursive: true,
        force: true,
      })
      .then(() => {
        removed += 1;
      })
      .catch(() => undefined);
  }

  return { threads: 0, rolloutFiles: removed, historyEntries: 0 };
}
