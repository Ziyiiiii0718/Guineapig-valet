import "server-only";

export type AiServiceConfig = {
  token: string;
  url: string;
};

export function getAiServiceConfig(
  env: Record<string, string | undefined> = process.env,
): AiServiceConfig | null {
  const url = env.AI_SERVICE_URL?.trim();
  const token = env.AI_SERVICE_TOKEN?.trim();

  if (!url || !token) return null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return { token, url: parsedUrl.toString() };
  } catch {
    return null;
  }
}

export function isAiServiceConfigured() {
  return getAiServiceConfig() !== null;
}
