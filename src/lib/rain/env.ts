/**
 * Resolve Rain credentials from Next.js env, falling back to agents/.env
 * so the workshop keys in agents/ also power the frontend booking path.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

type RainEnv = {
  apiKey: string;
  userId: string;
  contractId: string;
  baseUrl: string;
};

let cached: RainEnv | null = null;

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

function loadAgentsEnvFile(): Record<string, string> {
  const path = join(process.cwd(), "agents", ".env");
  if (!existsSync(path)) return {};
  try {
    return parseDotEnv(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function getRainEnv(): RainEnv {
  if (cached) return cached;
  const file = loadAgentsEnvFile();
  cached = {
    apiKey: process.env.RAIN_API_KEY || file.RAIN_API_KEY || "",
    userId: process.env.RAIN_USER_ID || file.RAIN_USER_ID || "",
    contractId: process.env.RAIN_CONTRACT_ID || file.RAIN_CONTRACT_ID || "",
    baseUrl: (
      process.env.RAIN_BASE_URL ||
      file.RAIN_BASE_URL ||
      "https://api-dev.raincards.xyz/v1"
    ).replace(/\/$/, ""),
  };
  return cached;
}
