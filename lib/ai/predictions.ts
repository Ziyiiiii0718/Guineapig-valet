import type {
  PhotoAiProcessingStatus,
  PhotoAiReviewStatus,
} from "@/lib/ai/types";

export const REVIEW_FILTERS = [
  "needs-review",
  "confirmed",
  "corrected",
  "failed",
  "all",
] as const;

export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export type PhotoPredictionRow = {
  labels_revision?: number;
  candidate_pet_ids: string[];
  candidate_reference_counts: number[];
  candidate_scores: number[];
  classification_completed_at: string | null;
  classification_started_at: string | null;
  classification_version: string | null;
  configuration_version: string | null;
  confirmed_pet_ids: string[];
  confirmed_unknown: boolean;
  created_at: string;
  embedding_dimension: number | null;
  embedding_model: string | null;
  embedding_version: string | null;
  error_category: string | null;
  id: string;
  photo_id: string;
  processing_status: PhotoAiProcessingStatus;
  review_status: PhotoAiReviewStatus;
  suggested_pet_ids: string[];
  suggested_unknown: boolean;
  updated_at: string;
  user_id: string;
};

export type PetLabel = { id: string; name: string };

export type PhotoPredictionView = PhotoPredictionRow & {
  candidates: Array<PetLabel & { referenceCount: number; score: number }>;
  confirmedPets: PetLabel[];
  suggestedPets: PetLabel[];
};

export function parseReviewFilter(
  value: string | string[] | undefined,
): ReviewFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return REVIEW_FILTERS.includes(candidate as ReviewFilter)
    ? (candidate as ReviewFilter)
    : "needs-review";
}

export function buildPredictionView(
  prediction: PhotoPredictionRow,
  pets: PetLabel[],
): PhotoPredictionView {
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  return {
    ...prediction,
    candidates: prediction.candidate_pet_ids.flatMap((petId, index) => {
      const pet = petsById.get(petId);
      return pet
        ? [
            {
              ...pet,
              referenceCount: prediction.candidate_reference_counts[index] ?? 0,
              score: prediction.candidate_scores[index] ?? 0,
            },
          ]
        : [];
    }),
    confirmedPets: prediction.confirmed_pet_ids.flatMap((id) => {
      const pet = petsById.get(id);
      return pet ? [pet] : [];
    }),
    suggestedPets: prediction.suggested_pet_ids.flatMap((id) => {
      const pet = petsById.get(id);
      return pet ? [pet] : [];
    }),
  };
}

export function formatPetLabels(pets: PetLabel[], unknown = false) {
  if (unknown) return "Unknown";
  return pets.length > 0 ? pets.map((pet) => pet.name).join(" + ") : null;
}

export function getDefinitivePhotoLabel(
  prediction: PhotoPredictionView | null,
) {
  if (
    !prediction ||
    (prediction.review_status !== "confirmed" &&
      prediction.review_status !== "corrected")
  ) {
    return null;
  }
  return formatPetLabels(
    prediction.confirmedPets,
    prediction.confirmed_unknown,
  );
}

export function getSuggestionLabel(prediction: PhotoPredictionView | null) {
  if (!prediction || prediction.processing_status !== "ready_for_review") {
    return null;
  }
  return formatPetLabels(
    prediction.suggestedPets,
    prediction.suggested_unknown,
  );
}

const STALE_PROCESSING_MILLISECONDS = 5 * 60 * 1000;

export function isPredictionProcessingStale(
  prediction: Pick<
    PhotoPredictionRow,
    "classification_started_at" | "processing_status"
  >,
  now = new Date(),
) {
  if (
    prediction.processing_status !== "processing" ||
    !prediction.classification_started_at
  ) {
    return false;
  }

  const startedAt = new Date(prediction.classification_started_at).getTime();
  return (
    Number.isFinite(startedAt) &&
    now.getTime() - startedAt >= STALE_PROCESSING_MILLISECONDS
  );
}

export function removePetFromPredictionLabels(
  prediction: Pick<
    PhotoPredictionRow,
    | "candidate_pet_ids"
    | "candidate_reference_counts"
    | "candidate_scores"
    | "confirmed_pet_ids"
    | "confirmed_unknown"
    | "review_status"
    | "suggested_pet_ids"
    | "suggested_unknown"
  >,
  petId: string,
) {
  const keptCandidateIndexes = prediction.candidate_pet_ids.flatMap(
    (candidateId, index) => (candidateId === petId ? [] : [index]),
  );
  const suggestedPetIds = prediction.suggested_pet_ids.filter(
    (candidateId) => candidateId !== petId,
  );
  const confirmedPetIds = prediction.confirmed_pet_ids.filter(
    (candidateId) => candidateId !== petId,
  );
  const lostOnlyConfirmedPet =
    ["confirmed", "corrected"].includes(prediction.review_status) &&
    !prediction.confirmed_unknown &&
    confirmedPetIds.length === 0;

  return {
    candidate_pet_ids: keptCandidateIndexes.map(
      (index) => prediction.candidate_pet_ids[index]!,
    ),
    candidate_reference_counts: keptCandidateIndexes.map(
      (index) => prediction.candidate_reference_counts[index]!,
    ),
    candidate_scores: keptCandidateIndexes.map(
      (index) => prediction.candidate_scores[index]!,
    ),
    confirmed_by_user: lostOnlyConfirmedPet ? false : undefined,
    confirmed_pet_ids: confirmedPetIds,
    review_status: lostOnlyConfirmedPet
      ? ("pending_review" as const)
      : prediction.review_status,
    reviewed_at: lostOnlyConfirmedPet ? null : undefined,
    suggested_pet_ids: suggestedPetIds,
    suggested_unknown:
      prediction.suggested_unknown ||
      (prediction.suggested_pet_ids.length > 0 && suggestedPetIds.length === 0),
  };
}
