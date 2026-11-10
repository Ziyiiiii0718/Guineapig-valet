import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewPredictionForm } from "@/components/ai/review-prediction-form";
import type { PhotoPredictionView } from "@/lib/ai/predictions";

vi.mock("@/app/actions/classification", () => ({
  reviewPhotoPredictionAction: vi.fn(),
}));

const prediction: PhotoPredictionView = {
  candidate_pet_ids: ["pet-a", "pet-b"],
  candidate_reference_counts: [3, 2],
  candidate_scores: [0.9, 0.84],
  candidates: [
    { id: "pet-a", name: "Mochi", referenceCount: 3, score: 0.9 },
    { id: "pet-b", name: "Bean", referenceCount: 2, score: 0.84 },
  ],
  classification_completed_at: "2026-09-09T00:00:01.000Z",
  classification_started_at: "2026-09-09T00:00:00.000Z",
  classification_version: "v1",
  configuration_version: "config-v1",
  confirmed_pet_ids: [],
  confirmed_unknown: false,
  confirmedPets: [],
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
  suggestedPets: [{ id: "pet-a", name: "Mochi" }],
  updated_at: "2026-09-09T00:00:00.000Z",
  user_id: "user",
};

describe("review prediction controls", () => {
  it("offers confirm, keyboard-native pet checkboxes, Unknown, and Skip", () => {
    render(
      <ReviewPredictionForm
        pets={[
          { id: "pet-a", name: "Mochi" },
          { id: "pet-b", name: "Bean" },
        ]}
        photoId="photo"
        prediction={prediction}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Confirm suggestion" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Mochi" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Unknown / none of these" }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeVisible();
  });

  it("makes Unknown mutually exclusive with selected pets", () => {
    render(
      <ReviewPredictionForm
        pets={[
          { id: "pet-a", name: "Mochi" },
          { id: "pet-b", name: "Bean" },
        ]}
        photoId="photo"
        prediction={prediction}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Unknown / none of these" }),
    );
    expect(screen.getByRole("checkbox", { name: "Mochi" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Unknown / none of these" }),
    ).toBeChecked();
  });
});

describe("manual photo labels", () => {
  it.each([
    null,
    "pending",
    "processing",
    "failed",
    "insufficient_references",
  ] as const)("allows labels when AI state is %s", (status) => {
    render(
      <ReviewPredictionForm
        manual
        pets={[{ id: "pet-a", name: "Mochi" }]}
        photoId="photo"
        prediction={
          status ? { ...prediction, processing_status: status } : null
        }
      />,
    );
    expect(screen.getByRole("button", { name: "Save labels" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Mochi" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Unknown / none of these" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Confirm suggestion" }),
    ).not.toBeInTheDocument();
  });

  it("loads existing manual selections and offers removal without requiring AI", () => {
    render(
      <ReviewPredictionForm
        manual
        pets={[
          { id: "pet-a", name: "Mochi" },
          { id: "pet-b", name: "Bean" },
        ]}
        photoId="photo"
        prediction={{
          ...prediction,
          processing_status: "failed",
          review_status: "corrected",
          confirmed_pet_ids: ["pet-a", "pet-b"],
          labels_revision: 3,
        }}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Mochi" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bean" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Remove labels" })).toBeEnabled();
  });

  it("permits explicit Unknown even when no pets exist", () => {
    render(
      <ReviewPredictionForm
        manual
        pets={[]}
        photoId="photo"
        prediction={null}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Unknown / none of these" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Unknown / none of these" }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Save labels" })).toBeEnabled();
  });
});
