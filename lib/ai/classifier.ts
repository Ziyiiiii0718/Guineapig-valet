import { cosineSimilarity } from "@/lib/ai/embedding";
import {
  PHOTO_CLASSIFICATION_CONFIG,
  type PhotoClassificationConfig,
} from "@/lib/ai/classification-config";

export type ClassificationReference = {
  embedding: number[];
  petId: string;
  referenceId: string;
};

export type PetCandidateScore = {
  petId: string;
  referenceCount: number;
  score: number;
};

export type PhotoClassificationResult = {
  candidates: PetCandidateScore[];
  eligiblePetCount: number;
  outcome:
    "single_pet" | "multiple_pets" | "unknown" | "insufficient_references";
  suggestedPetIds: string[];
  suggestedUnknown: boolean;
};

function assertFiniteVector(vector: number[], expectedDimension?: number) {
  if (
    vector.length === 0 ||
    (expectedDimension !== undefined && vector.length !== expectedDimension) ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      "Classification vectors must have equal finite dimensions.",
    );
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (Math.abs(magnitude - 1) > 0.001) {
    throw new Error("Classification vectors must be normalized.");
  }
}

export function aggregatePetSimilarities(
  queryEmbedding: number[],
  referenceEmbeddings: number[][],
  topK: number,
) {
  assertFiniteVector(queryEmbedding);
  if (referenceEmbeddings.length === 0 || !Number.isInteger(topK) || topK < 1) {
    throw new Error(
      "At least one reference and a positive top-k are required.",
    );
  }

  const similarities = referenceEmbeddings
    .map((embedding) => {
      assertFiniteVector(embedding, queryEmbedding.length);
      return cosineSimilarity(queryEmbedding, embedding);
    })
    .sort((left, right) => right - left)
    .slice(0, topK);

  return (
    similarities.reduce((sum, similarity) => sum + similarity, 0) /
    similarities.length
  );
}

function compareCandidates(left: PetCandidateScore, right: PetCandidateScore) {
  const scoreDifference = right.score - left.score;
  return scoreDifference === 0
    ? left.petId.localeCompare(right.petId)
    : scoreDifference;
}

export function classifyPhotoEmbedding({
  config = PHOTO_CLASSIFICATION_CONFIG,
  queryEmbedding,
  references,
}: {
  config?: PhotoClassificationConfig;
  queryEmbedding: number[];
  references: ClassificationReference[];
}): PhotoClassificationResult {
  assertFiniteVector(queryEmbedding);
  const byPet = new Map<string, number[][]>();

  for (const reference of references) {
    assertFiniteVector(reference.embedding, queryEmbedding.length);
    const existing = byPet.get(reference.petId) ?? [];
    existing.push(reference.embedding);
    byPet.set(reference.petId, existing);
  }

  const candidates = [...byPet.entries()]
    .filter(
      ([, embeddings]) => embeddings.length >= config.minimumReadyReferences,
    )
    .map(([petId, embeddings]) => ({
      petId,
      referenceCount: embeddings.length,
      score: aggregatePetSimilarities(
        queryEmbedding,
        embeddings,
        config.topKReferences,
      ),
    }))
    .sort(compareCandidates)
    .slice(0, config.candidateLimit);

  if (candidates.length === 0) {
    return {
      candidates: [],
      eligiblePetCount: 0,
      outcome: "insufficient_references",
      suggestedPetIds: [],
      suggestedUnknown: false,
    };
  }

  const best = candidates[0]!;
  const second = candidates[1];
  const plausibleMultiple = candidates.filter(
    (candidate) =>
      candidate.score >= config.multiPetThreshold &&
      best.score - candidate.score <= config.ambiguityMargin,
  );

  if (plausibleMultiple.length >= 2) {
    return {
      candidates,
      eligiblePetCount: candidates.length,
      outcome: "multiple_pets",
      suggestedPetIds: plausibleMultiple.map((candidate) => candidate.petId),
      suggestedUnknown: false,
    };
  }

  if (
    best.score >= config.singlePetThreshold &&
    (!second || best.score - second.score > config.ambiguityMargin)
  ) {
    return {
      candidates,
      eligiblePetCount: candidates.length,
      outcome: "single_pet",
      suggestedPetIds: [best.petId],
      suggestedUnknown: false,
    };
  }

  return {
    candidates,
    eligiblePetCount: candidates.length,
    outcome: "unknown",
    suggestedPetIds: [],
    suggestedUnknown: true,
  };
}
