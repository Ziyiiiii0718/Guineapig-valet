import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReferencePhotoPickerForm } from "@/components/references/reference-photo-picker-form";
import { ReferencePhotosSection } from "@/components/references/reference-photos-section";
import type { PhotoRow } from "@/lib/photos/queries";
import type { ReferencePhotoView } from "@/lib/references/queries";

vi.mock("@/app/actions/references", () => ({
  addReferencePhotosAction: vi.fn(),
  removeReferencePhotoAction: vi.fn(),
  retryReferenceEmbeddingAction: vi.fn(),
}));

const photo = {
  ai_status: "uploaded",
  created_at: "2026-09-09T12:00:00.000Z",
  display_name: "Clear side view",
  file_name: "IMG_1693.HEIC",
  file_size: 999_000,
  height: 1200,
  id: "550e8400-e29b-41d4-a716-446655440001",
  mime_type: "image/jpeg",
  signed_url: "https://example.test/private-signed-image",
  storage_path: "user-1/2026/09/photo.jpg",
  taken_at: "2026-09-08T12:00:00.000Z",
  uploaded_at: "2026-09-09T12:00:00.000Z",
  user_id: "user-1",
  width: 1600,
} satisfies PhotoRow & { signed_url: string };

const reference = {
  created_at: "2026-09-09T12:00:00.000Z",
  embedding_dimension: 512,
  embedding_error_category: null,
  embedding_model: "ViT-B-32-quickgelu",
  embedding_status: "ready",
  embedding_version: "openai",
  id: "550e8400-e29b-41d4-a716-446655440002",
  pet_id: "550e8400-e29b-41d4-a716-446655440000",
  photo,
  photo_id: photo.id,
  updated_at: "2026-09-09T12:00:00.000Z",
  user_id: "user-1",
} satisfies ReferencePhotoView;

describe("private reference thumbnails", () => {
  it("eagerly loads pet-detail thumbnails without Next.js LCP URL warnings", () => {
    render(
      <ReferencePhotosSection
        aiConfigured
        petId={reference.pet_id}
        petName="A pet"
        references={[reference]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Clear side view" }),
    ).toHaveAttribute("loading", "eager");
  });

  it("eagerly loads picker thumbnails without Next.js LCP URL warnings", () => {
    const { container } = render(
      <ReferencePhotoPickerForm
        existing={[]}
        petId={reference.pet_id}
        photos={[photo]}
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
  });
});
