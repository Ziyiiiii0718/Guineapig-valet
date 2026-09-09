import { describe, expect, it } from "vitest";
import {
  AI_EMBEDDING_DIMENSION,
  AiEmbeddingError,
  cosineSimilarity,
  parseAiEmbeddingResponse,
} from "@/lib/ai/embedding";

function unitVector() {
  return [1, ...Array.from({ length: AI_EMBEDDING_DIMENSION - 1 }, () => 0)];
}

describe("AI embedding contract", () => {
  it("accepts a finite normalized 512-value response with model metadata", () => {
    expect(
      parseAiEmbeddingResponse({
        dimension: AI_EMBEDDING_DIMENSION,
        embedding: unitVector(),
        model: "ViT-B-32-quickgelu",
        version: "openai",
      }),
    ).toMatchObject({
      dimension: AI_EMBEDDING_DIMENSION,
      model: "ViT-B-32-quickgelu",
      version: "openai",
    });
  });

  it.each([
    { dimension: 3, embedding: [1, 0, 0], model: "model", version: "v1" },
    {
      dimension: AI_EMBEDDING_DIMENSION,
      embedding: Array.from({ length: AI_EMBEDDING_DIMENSION }, () => 1),
      model: "model",
      version: "v1",
    },
    {
      dimension: AI_EMBEDDING_DIMENSION,
      embedding: [Number.NaN, ...unitVector().slice(1)],
      model: "model",
      version: "v1",
    },
  ])(
    "rejects malformed, wrong-sized, or unnormalized responses",
    (response) => {
      expect(() => parseAiEmbeddingResponse(response)).toThrow(
        AiEmbeddingError,
      );
    },
  );

  it("prepares normalized-vector cosine similarity without classification rules", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow();
  });
});
