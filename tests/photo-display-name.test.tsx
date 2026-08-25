import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoCard } from "@/components/photos/photo-card";
import {
  getPhotoDisplayName,
  photoDisplayNameSchema,
} from "@/lib/photos/display-name";
import type { PhotoWithSignedUrl } from "@/lib/photos/queries";

const photo = {
  ai_status: "uploaded",
  created_at: "2026-08-20T12:00:00.000Z",
  display_name: "Annie eating hay",
  file_name: "IMG_3847.HEIC",
  file_size: 2048,
  height: 900,
  id: "550e8400-e29b-41d4-a716-446655440000",
  mime_type: "image/jpeg",
  signed_url: null,
  signed_url_error: true,
  storage_path: "user-1/2026/08/photo-id.jpg",
  taken_at: "2026-08-19T12:00:00.000Z",
  uploaded_at: "2026-08-20T12:00:00.000Z",
  user_id: "user-1",
  width: 1200,
} satisfies PhotoWithSignedUrl;

describe("photo display names", () => {
  it("prefers a trimmed custom display name", () => {
    expect(
      getPhotoDisplayName({
        display_name: "  Annie eating hay  ",
        file_name: "IMG_3847.HEIC",
      }),
    ).toBe("Annie eating hay");
  });

  it("falls back to the original filename without its extension", () => {
    expect(
      getPhotoDisplayName({
        display_name: null,
        file_name: "IMG_3847.HEIC",
      }),
    ).toBe("IMG_3847");
  });

  it("uses a safe fallback when no useful filename exists", () => {
    expect(getPhotoDisplayName({ display_name: null, file_name: null })).toBe(
      "Untitled photo",
    );
    expect(getPhotoDisplayName({ display_name: " ", file_name: ".HEIC" })).toBe(
      "Untitled photo",
    );
  });

  it("accepts trimmed Chinese, emoji, punctuation, and the 80-character boundary", () => {
    expect(photoDisplayNameSchema.parse("  安妮吃干草 🐹！  ")).toBe(
      "安妮吃干草 🐹！",
    );
    expect(photoDisplayNameSchema.safeParse("a".repeat(80)).success).toBe(true);
  });

  it("rejects blank and over-80-character names", () => {
    expect(photoDisplayNameSchema.safeParse("   ").success).toBe(false);
    expect(photoDisplayNameSchema.safeParse("a".repeat(81)).success).toBe(
      false,
    );
  });

  it("renders the custom name in the shared gallery and dashboard card", () => {
    render(<PhotoCard photo={photo} />);

    expect(
      screen.getByRole("link", { name: "View Annie eating hay" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Annie eating hay")).toBeInTheDocument();
    expect(screen.queryByText("IMG_3847.HEIC")).not.toBeInTheDocument();
  });
});
