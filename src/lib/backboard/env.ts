import { serverEnv } from "../server-env";

export type BackboardEnv = {
  apiKey: string;
  baseUrl: string;
  llmProvider: string;
  modelName: string;
};

export function getBackboardEnv(): BackboardEnv {
  return {
    apiKey: serverEnv("BACKBOARD_API_KEY"),
    baseUrl: (serverEnv("BACKBOARD_BASE_URL") || "https://app.backboard.io/api").replace(/\/$/, ""),
    llmProvider: serverEnv("BACKBOARD_LLM_PROVIDER") || "openai",
    modelName: serverEnv("BACKBOARD_MODEL_NAME") || "gpt-4o",
  };
}

export function isBackboardConfigured(): boolean {
  return Boolean(getBackboardEnv().apiKey);
}
