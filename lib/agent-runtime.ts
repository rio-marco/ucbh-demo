import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const AGENT_TEMP_PREFIX = "ucbh-";
export const AGENT_THREAD_SOURCE = "ucbh-platform";

export function getCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

type ThreadRow = {
  id: string;
  cwd: string | null;
  thread_source: string | null;
  rollout_path: string | null;
};

export type RuntimeCleanupResult = {
  threads: number;
  rolloutFiles: number;
  historyEntries: number;
};

function isAppThread(row: ThreadRow, sessionId?: string) {
  const cwd = row.cwd ?? "";
  const tempRoot = `${os.tmpdir().replace(/\/+$/, "")}${path.sep}`;
  const inAppWorkspace = cwd.startsWith(`${tempRoot}${AGENT_TEMP_PREFIX}`);
  const marked = (row.thread_source ?? "").startsWith(AGENT_THREAD_SOURCE);
  if (sessionId) {
    const sessionKey = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    return inAppWorkspace && cwd.includes(`agent-${sessionKey}-`);
  }
  return inAppWorkspace || marked;
}

function openDatabase(file: string) {
  const database = new DatabaseSync(file);
  database.exec("PRAGMA busy_timeout = 5000");
  return database;
}

function hasTable(database: DatabaseSync, table: string) {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}

function columns(database: DatabaseSync, table: string) {
  return (
    database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((column) => column.name);
}

function deleteIds(
  database: DatabaseSync,
  table: string,
  column: string,
  ids: string[],
) {
  if (!ids.length || !hasTable(database, table)) return;
  if (!columns(database, table).includes(column)) return;
  const placeholders = ids.map(() => "?").join(", ");
  database
    .prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`)
    .run(...ids);
}

async function walk(directory: string): Promise<string[]> {
  const entries = await fs
    .readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true })
    .catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

async function pruneJsonl(file: string, ids: Set<string>) {
  try {
    const raw = await fs.readFile(file, "utf8");
    if (!raw) return 0;
    const lines = raw.split("\n");
    const kept = lines.filter(
      (line) => !line || ![...ids].some((id) => line.includes(id)),
    );
    const removed = lines.length - kept.length;
    if (removed) await fs.writeFile(file, kept.join("\n"), "utf8");
    return removed;
  } catch {
    return 0;
  }
}

export async function clearAgentRuntimeHistory(sessionId?: string): Promise<RuntimeCleanupResult> {
  const codexHome = getCodexHome();
  const entries = await fs
    .readdir(/*turbopackIgnore: true*/ codexHome)
    .catch(() => [] as string[]);
  const stateFiles = entries.filter((name) => /^state_\d+\.sqlite$/.test(name));
  const historyFiles = entries.filter((name) =>
    /^thread_history_\d+\.sqlite$/.test(name),
  );
  const logFiles = entries.filter((name) => /^logs_\d+\.sqlite$/.test(name));

  const ids = new Set<string>();
  const rolloutPaths = new Set<string>();

  for (const file of stateFiles) {
    try {
      const database = openDatabase(path.join(codexHome, file));
      try {
        const rows = database
          .prepare("SELECT id, cwd, thread_source, rollout_path FROM threads")
          .all() as ThreadRow[];
        for (const row of rows) {
          if (!isAppThread(row, sessionId)) continue;
          ids.add(row.id);
          if (row.rollout_path) rolloutPaths.add(row.rollout_path);
        }
      } finally {
        database.close();
      }
    } catch (error) {
      console.error(`Could not read ${file} for Agent cleanup`, error);
    }
  }

  if (!ids.size) {
    return { threads: 0, rolloutFiles: 0, historyEntries: 0 };
  }

  const idList = [...ids];

  for (const file of stateFiles) {
    try {
      const database = openDatabase(path.join(codexHome, file));
      try {
        database.exec("BEGIN");
        deleteIds(database, "threads", "id", idList);
        deleteIds(database, "thread_dynamic_tools", "thread_id", idList);
        deleteIds(database, "thread_spawn_edges", "parent_thread_id", idList);
        deleteIds(database, "thread_spawn_edges", "child_thread_id", idList);
        deleteIds(database, "thread_attachments", "thread_id", idList);
        deleteIds(database, "thread_read_receipts", "thread_id", idList);
        deleteIds(database, "guardian_review_feedback", "thread_id", idList);
        database.exec("COMMIT");
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Ignore a rollback failure; the connection is closed below.
        }
        console.error(`Could not clean ${file}`, error);
      } finally {
        database.close();
      }
    } catch (error) {
      console.error(`Could not open ${file} for Agent cleanup`, error);
    }
  }

  for (const file of historyFiles) {
    try {
      const database = openDatabase(path.join(codexHome, file));
      try {
        database.exec("BEGIN");
        deleteIds(database, "thread_turns", "thread_id", idList);
        deleteIds(database, "thread_items", "thread_id", idList);
        deleteIds(
          database,
          "thread_history_projection_state",
          "thread_id",
          idList,
        );
        deleteIds(database, "thread_realtime_items", "thread_id", idList);
        database.exec("COMMIT");
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Ignore a rollback failure; the connection is closed below.
        }
        console.error(`Could not clean ${file}`, error);
      } finally {
        database.close();
      }
    } catch (error) {
      console.error(`Could not open ${file} for Agent cleanup`, error);
    }
  }

  for (const file of logFiles) {
    try {
      const database = openDatabase(path.join(codexHome, file));
      try {
        deleteIds(database, "logs", "thread_id", idList);
      } finally {
        database.close();
      }
    } catch (error) {
      console.error(`Could not open ${file} for Agent cleanup`, error);
    }
  }

  let rolloutFiles = 0;
  const sessionsRoot = path.join(codexHome, "sessions");
  for (const file of await walk(sessionsRoot)) {
    if (!file.endsWith(".jsonl")) continue;
    const matched =
      rolloutPaths.has(file) ||
      idList.some((id) => path.basename(file).includes(id));
    if (!matched) continue;
    await fs
      .unlink(file)
      .then(() => {
        rolloutFiles += 1;
      })
      .catch(() => undefined);
  }

  const historyEntries =
    (await pruneJsonl(path.join(codexHome, "session_index.jsonl"), ids)) +
    (await pruneJsonl(path.join(codexHome, "history.jsonl"), ids));

  return { threads: idList.length, rolloutFiles, historyEntries };
}
