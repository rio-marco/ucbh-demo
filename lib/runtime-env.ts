import { readFileSync, statSync } from "node:fs";
import path from "node:path";

type EnvCache = {
  signature: string;
  values: Record<string, string>;
};

type EnvFileName =
  | ".env"
  | ".env.local"
  | ".env.development"
  | ".env.development.local"
  | ".env.production"
  | ".env.production.local";

let cache: EnvCache | null = null;

function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalised = line.startsWith("export ") ? line.slice(7) : line;
    const separator = normalised.indexOf("=");
    if (separator === -1) continue;
    const key = normalised.slice(0, separator).trim();
    if (!key) continue;
    let value = normalised.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, "\n");
    }
    values[key] = value;
  }
  return values;
}

function statEnvFile(name: EnvFileName) {
  const cwd = process.cwd();
  switch (name) {
    case ".env":
      return statSync(path.join(cwd, ".env"));
    case ".env.local":
      return statSync(path.join(cwd, ".env.local"));
    case ".env.development":
      return statSync(path.join(cwd, ".env.development"));
    case ".env.development.local":
      return statSync(path.join(cwd, ".env.development.local"));
    case ".env.production":
      return statSync(path.join(cwd, ".env.production"));
    case ".env.production.local":
      return statSync(path.join(cwd, ".env.production.local"));
  }
}

function readEnvFile(name: EnvFileName): Record<string, string> {
  const cwd = process.cwd();
  switch (name) {
    case ".env":
      return parseEnv(readFileSync(path.join(cwd, ".env"), "utf8"));
    case ".env.local":
      return parseEnv(readFileSync(path.join(cwd, ".env.local"), "utf8"));
    case ".env.development":
      return parseEnv(
        readFileSync(path.join(cwd, ".env.development"), "utf8"),
      );
    case ".env.development.local":
      return parseEnv(
        readFileSync(path.join(cwd, ".env.development.local"), "utf8"),
      );
    case ".env.production":
      return parseEnv(readFileSync(path.join(cwd, ".env.production"), "utf8"));
    case ".env.production.local":
      return parseEnv(
        readFileSync(path.join(cwd, ".env.production.local"), "utf8"),
      );
  }
}

function envFiles(): EnvFileName[] {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  return mode === "production"
    ? [".env", ".env.production", ".env.local", ".env.production.local"]
    : [".env", ".env.development", ".env.local", ".env.development.local"];
}

function currentEnvValues(): Record<string, string> {
  const files = envFiles();
  const signature = files
    .map((file) => {
      try {
        const stat = statEnvFile(file);
        return `${file}:${stat.mtimeMs}:${stat.size}`;
      } catch {
        return `${file}:missing`;
      }
    })
    .join("|");
  if (cache && cache.signature === signature) return cache.values;

  const values: Record<string, string> = {};
  for (const file of files) {
    try {
      Object.assign(values, readEnvFile(file));
    } catch {
      continue;
    }
  }
  cache = { signature, values };
  return values;
}

export function getRuntimeEnv(name: string): string {
  const values = currentEnvValues();
  return name in values ? values[name] : process.env[name] || "";
}
