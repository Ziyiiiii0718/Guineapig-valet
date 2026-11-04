import { describe, expect, it } from "vitest";
import {
  buildPredictionView,
  getDefinitivePhotoLabel,
  getSuggestionLabel,
  isPredictionProcessingStale,
  parseReviewFilter,
  removePetFromPredictionLabels,
  type PhotoPredictionRow,
} from "@/lib/ai/predictions";

const basePrediction: PhotoPredictionRow = {
  candidate_pet_ids: ["pet-a"],
  candidate_reference_counts: [3],
  candidate_scores: [0.9],
  classification_completed_at: "2026-09-09T00:00:01.000Z",
  classification_started_at: "2026-09-09T00:00:00.000Z",
  classification_version: "v1",
  configuration_version: "config-v1",
  confirmed_pet_ids: [],
  confirmed_unknown: false,
  created_at: "2026-09-09T00:00:00.000Z",
  embedding_dimension: 512,
  embedding_model: "model",
  embedding_version: "version",
  error_category: null,
  id: "prediction",
  photo_id: "photo",
  processing_status: "ready_for_review",
  review_status: "pending_review",
  suggested_pet_ids: ["pet-a"],
  suggested_unknown: false,
  updated_at: "2026-09-09T00:00:00.000Z",
  user_id: "user",
};

describe("prediction presentation helpers", () => {
  it("validates review queue filters", () => {
    expect(parseReviewFilter(undefined)).toBe("needs-review");
    expect(parseReviewFilter("corrected")).toBe("corrected");
    expect(parseReviewFilter("private-data")).toBe("needs-review");
  });

  it("keeps an unreviewed suggestion distinct from a definitive label", () => {
    const view = buildPredictionView(basePrediction, [
      { id: "pet-a", name: "Mochi" },
    ]);
    expect(getSuggestionLabel(view)).toBe("Mochi");
    expect(getDefinitivePhotoLabel(view)).toBeNull();
  });

  it("lets an interrupted processing job become retryable after five minutes", () => {
    const processing = {
      ...basePrediction,
      classification_started_at: "2026-09-09T10:00:00.000Z",
      processing_status: "processing" as const,
    };
    expect(
      isPredictionProcessingStale(
        processing,
        new Date("2026-09-09T10:04:59.999Z"),
      ),
    ).toBe(false);
    expect(
      isPredictionProcessingStale(
        processing,
        new Date("2026-09-09T10:05:00.000Z"),
      ),
    ).toBe(true);
  });

  it("renders multiple confirmed pets and Unknown truth", () => {
    const multiple = buildPredictionView(
      {
        ...basePrediction,
        confirmed_pet_ids: ["pet-a", "pet-b"],
        review_status: "corrected",
      },
      [
        { id: "pet-a", name: "Mochi" },
        { id: "pet-b", name: "Bean" },
      ],
    );
    expect(getDefinitivePhotoLabel(multiple)).toBe("Mochi + Bean");

    const unknown = buildPredictionView(
      {
        ...basePrediction,
        confirmed_unknown: true,
        review_status: "corrected",
      },
      [],
    );
    expect(getDefinitivePhotoLabel(unknown)).toBe("Unknown");
  });

  it("removes a deleted pet while keeping candidate arrays aligned", () => {
    const result = removePetFromPredictionLabels(
      {
        ...basePrediction,
        candidate_pet_ids: ["pet-a", "pet-b"],
        candidate_reference_counts: [3, 2],
        candidate_scores: [0.9, 0.8],
        confirmed_pet_ids: ["pet-a"],
        review_status: "confirmed",
      },
      "pet-a",
    );
    expect(result).toMatchObject({
      candidate_pet_ids: ["pet-b"],
      candidate_reference_counts: [2],
      candidate_scores: [0.8],
      confirmed_by_user: false,
      confirmed_pet_ids: [],
      review_status: "pending_review",
      suggested_pet_ids: [],
      suggested_unknown: true,
    });
  });
});
