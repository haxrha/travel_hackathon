/**
 * Server env lookup. Next.js reads `.env.local`; workshop keys may also live
 * in `agents/.env`, which this falls back to (same pattern the old Rain client used).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

let fileCache: Record<string, string> | null = null;

function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function agentsEnv(): Record<string, string> {
  if (fileCache) return fileCache;
  const path = join(process.cwd(), "agents", ".env");
  if (!existsSync(path)) {
    fileCache = {};
    return fileCache;
  }
  try {
    fileCache = parseDotEnv(readFileSync(path, "utf8"));
  } catch {
    fileCache = {};
  }
  return fileCache;
}

export function serverEnv(name: string): string {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  return (agentsEnv()[name] ?? "").trim();
}
