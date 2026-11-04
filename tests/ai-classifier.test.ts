import { describe, expect, it } from "vitest";
import {
  aggregatePetSimilarities,
  classifyPhotoEmbedding,
  type ClassificationReference,
} from "@/lib/ai/classifier";
import type { PhotoClassificationConfig } from "@/lib/ai/classification-config";

const config: PhotoClassificationConfig = {
  aggregation: "top_k_mean",
  ambiguityMargin: 0.05,
  candidateLimit: 5,
  classificationVersion: "test-v1",
  configurationVersion: "test-config-v1",
  minimumReadyReferences: 2,
  multiPetThreshold: 0.8,
  singlePetThreshold: 0.85,
  topKReferences: 2,
};

const unitFromX = (x: number) => [x, Math.sqrt(1 - x * x)];
const query = [1, 0];

function references(
  petId: string,
  embeddings: number[][],
): ClassificationReference[] {
  return embeddings.map((embedding, index) => ({
    embedding,
    petId,
    referenceId: `${petId}-${index}`,
  }));
}

describe("AI photo classifier", () => {
  it("aggregates the top-k similarities instead of one outlier", () => {
    expect(
      aggregatePetSimilarities(
        query,
        [unitFromX(1), unitFromX(0.9), unitFromX(-1)],
        2,
      ),
    ).toBeCloseTo(0.95);
  });

  it("orders pet scores and returns one strong separated candidate", () => {
    const result = classifyPhotoEmbedding({
      config,
      queryEmbedding: query,
      references: [
        ...references("annie", [unitFromX(1), unitFromX(0.9)]),
        ...references("potato", [unitFromX(0.5), unitFromX(0.4)]),
      ],
    });

    expect(result.outcome).toBe("single_pet");
    expect(result.suggestedPetIds).toEqual(["annie"]);
    expect(result.candidates.map((candidate) => candidate.petId)).toEqual([
      "annie",
      "potato",
    ]);
  });

  it("returns Unknown when no score reaches the provisional threshold", () => {
    const result = classifyPhotoEmbedding({
      config,
      queryEmbedding: query,
      references: references("annie", [unitFromX(0.5), unitFromX(0.45)]),
    });
    expect(result.outcome).toBe("unknown");
    expect(result.suggestedUnknown).toBe(true);
  });

  it("treats close strong scores as a heuristic multiple-pet suggestion", () => {
    const result = classifyPhotoEmbedding({
      config,
      queryEmbedding: query,
      references: [
        ...references("annie", [unitFromX(0.91), unitFromX(0.9)]),
        ...references("potato", [unitFromX(0.89), unitFromX(0.88)]),
      ],
    });
    expect(result.outcome).toBe("multiple_pets");
    expect(result.suggestedPetIds).toEqual(["annie", "potato"]);
  });

  it("returns Unknown for an ambiguous pair below the multi-pet threshold", () => {
    const result = classifyPhotoEmbedding({
      config,
      queryEmbedding: query,
      references: [
        ...references("annie", [unitFromX(0.79), unitFromX(0.78)]),
        ...references("potato", [unitFromX(0.78), unitFromX(0.77)]),
      ],
    });
    expect(result.outcome).toBe("unknown");
  });

  it("excludes pets with insufficient references", () => {
    const result = classifyPhotoEmbedding({
      config,
      queryEmbedding: query,
      references: references("annie", [unitFromX(1)]),
    });
    expect(result.outcome).toBe("insufficient_references");
    expect(result.candidates).toEqual([]);
  });

  it("breaks equal-score ties by pet id for deterministic output", () => {
    const result = classifyPhotoEmbedding({
      config,
      queryEmbedding: query,
      references: [
        ...references("potato", [unitFromX(0.9), unitFromX(0.9)]),
        ...references("annie", [unitFromX(0.9), unitFromX(0.9)]),
      ],
    });
    expect(result.candidates.map((candidate) => candidate.petId)).toEqual([
      "annie",
      "potato",
    ]);
  });

  it("rejects invalid dimensions and non-finite values", () => {
    expect(() =>
      classifyPhotoEmbedding({
        config,
        queryEmbedding: query,
        references: references("annie", [[1], [1]]),
      }),
    ).toThrow(/dimensions/i);
    expect(() =>
      classifyPhotoEmbedding({
        config,
        queryEmbedding: [Number.NaN, 0],
        references: references("annie", [unitFromX(1), unitFromX(1)]),
      }),
    ).toThrow(/finite/i);
    expect(() =>
      classifyPhotoEmbedding({
        config,
        queryEmbedding: [0.5, 0.5],
        references: references("annie", [unitFromX(1), unitFromX(1)]),
      }),
    ).toThrow(/normalized/i);
  });

  it("produces identical output for identical input", () => {
    const input = {
      config,
      queryEmbedding: query,
      references: [
        ...references("annie", [unitFromX(1), unitFromX(0.9)]),
        ...references("potato", [unitFromX(0.4), unitFromX(0.5)]),
      ],
    };
    expect(classifyPhotoEmbedding(input)).toEqual(
      classifyPhotoEmbedding(input),
    );
  });
});
