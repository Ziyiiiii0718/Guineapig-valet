import { z } from "zod";

export const AI_EMBEDDING_DIMENSION = 512;
export const AI_MODEL_NAME = "ViT-B-32-quickgelu";
export const AI_MODEL_VERSION = "openai";

const embeddingResponseSchema = z.object({
  dimension: z.number().int().positive(),
  embedding: z.array(z.number()),
  model: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(120),
});

export type AiEmbedding = z.infer<typeof embeddingResponseSchema>;

export type EmbeddingErrorCategory =
  | "service_unavailable"
  | "model_unavailable"
  | "invalid_image"
  | "invalid_response"
  | "inference_failed";

export class AiEmbeddingError extends Error {
  constructor(
    public readonly category: EmbeddingErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = "AiEmbeddingError";
  }
}

export function parseAiEmbeddingResponse(value: unknown): AiEmbedding {
  const parsed = embeddingResponseSchema.safeParse(value);

  if (!parsed.success) {
    throw new AiEmbeddingError(
      "invalid_response",
      "The embedding service returned an invalid response.",
    );
  }

  const result = parsed.data;
  if (
    result.dimension !== AI_EMBEDDING_DIMENSION ||
    result.embedding.length !== result.dimension ||
    result.embedding.some((entry) => !Number.isFinite(entry))
  ) {
    throw new AiEmbeddingError(
      "invalid_response",
      "The embedding service returned an unexpected vector dimension.",
    );
  }

  const magnitude = Math.sqrt(
    result.embedding.reduce((sum, entry) => sum + entry * entry, 0),
  );
  if (!Number.isFinite(magnitude) || Math.abs(magnitude - 1) > 0.001) {
    throw new AiEmbeddingError(
      "invalid_response",
      "The embedding service returned a vector that was not normalized.",
    );
  }

  return result;
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("Cosine similarity requires equal non-empty vectors.");
  }

  return left.reduce((sum, entry, index) => sum + entry * right[index]!, 0);
}

export function parseStoredEmbedding(value: unknown): number[] | null {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== AI_EMBEDDING_DIMENSION ||
    parsed.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    return null;
  }

  return parsed as number[];
}
