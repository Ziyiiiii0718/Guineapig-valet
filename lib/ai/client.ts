import "server-only";

import {
  AiEmbeddingError,
  parseAiEmbeddingResponse,
  type AiEmbedding,
} from "@/lib/ai/embedding";
import { getAiServiceConfig } from "@/lib/ai/config";

const AI_REQUEST_TIMEOUT_MS = 60_000;

export async function requestImageEmbedding({
  bytes,
  mimeType,
}: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<AiEmbedding> {
  const config = getAiServiceConfig();
  if (!config) {
    throw new AiEmbeddingError(
      "service_unavailable",
      "The embedding service is not configured.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  try {
    const response = await fetch(new URL("/embed", config.url), {
      body,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": mimeType,
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      let category: "invalid_image" | "model_unavailable" | "inference_failed" =
        "inference_failed";
      if (response.status === 415 || response.status === 422) {
        category = "invalid_image";
      } else if (response.status === 503) {
        category = "model_unavailable";
      }
      throw new AiEmbeddingError(
        category,
        "The embedding service could not process this image.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiEmbeddingError(
        "invalid_response",
        "The embedding service returned unreadable data.",
      );
    }
    return parseAiEmbeddingResponse(payload);
  } catch (error) {
    if (error instanceof AiEmbeddingError) throw error;
    throw new AiEmbeddingError(
      "service_unavailable",
      "The embedding service is currently unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
