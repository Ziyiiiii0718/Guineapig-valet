import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlbumCard } from "@/components/albums/album-card";
import {
  albumDescriptionSchema,
  albumFormSchema,
  albumIdSchema,
  albumNameSchema,
  getAlbumPaginationRange,
  parseAlbumPage,
} from "@/lib/albums/validation";
import type { AlbumSummary } from "@/lib/albums/queries";

const album = {
  cover: {
    ai_status: "uploaded",
    created_at: "2026-08-25T12:00:00Z",
    display_name: "Annie's portrait",
    file_name: "IMG_1693.HEIC",
    file_size: 999000,
    height: 1200,
    id: "550e8400-e29b-41d4-a716-446655440001",
    mime_type: "image/jpeg",
    signed_url: "https://example.test/private-signed-image",
    signed_url_error: false,
    storage_path: "user-1/2026/08/photo.jpg",
    taken_at: null,
    uploaded_at: "2026-08-25T12:00:00Z",
    user_id: "user-1",
    width: 1600,
  },
  cover_photo_id: null,
  created_at: "2026-08-25T12:00:00Z",
  description: "Sunny afternoons",
  id: "550e8400-e29b-41d4-a716-446655440000",
  photo_count: 3,
  title: "安妮的夏天 🐹",
  updated_at: "2026-08-25T12:00:00Z",
  user_id: "user-1",
} satisfies AlbumSummary;

describe("album validation", () => {
  it("trims and accepts English, Chinese, emoji, punctuation, and numbers", () => {
    expect(albumNameSchema.parse("  安妮 2026 🐹！  ")).toBe("安妮 2026 🐹！");
  });

  it("rejects blank and over-80-character names", () => {
    expect(albumNameSchema.safeParse("   ").success).toBe(false);
    expect(albumNameSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(albumNameSchema.safeParse("a".repeat(81)).success).toBe(false);
  });

  it("normalizes an empty description to null and enforces 500 characters", () => {
    expect(albumDescriptionSchema.parse("   ")).toBeNull();
    expect(albumDescriptionSchema.parse("  Favorite naps  ")).toBe(
      "Favorite naps",
    );
    expect(albumDescriptionSchema.safeParse("a".repeat(501)).success).toBe(
      false,
    );
  });

  it("validates album IDs and complete album forms", () => {
    expect(albumIdSchema.safeParse(album.id).success).toBe(true);
    expect(albumIdSchema.safeParse("not-an-album").success).toBe(false);
    expect(
      albumFormSchema.parse({ description: " Notes ", name: " Favorites " }),
    ).toEqual({ description: "Notes", name: "Favorites" });
  });
});

describe("album pagination", () => {
  it("normalizes invalid pages and calculates stable inclusive boundaries", () => {
    expect(parseAlbumPage(undefined)).toBe(1);
    expect(parseAlbumPage("-2")).toBe(1);
    expect(parseAlbumPage(["3", "4"])).toBe(3);
    expect(getAlbumPaginationRange(1, 12)).toEqual({ from: 0, to: 11 });
    expect(getAlbumPaginationRange(3, 12)).toEqual({ from: 24, to: 35 });
  });
});

describe("album cards", () => {
  it("shows a private album cover, count, Unicode name, and description", () => {
    render(<AlbumCard album={album} />);
    expect(
      screen.getByRole("link", {
        name: "View album 安妮的夏天 🐹, 3 photos",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sunny afternoons")).toBeInTheDocument();
    expect(screen.getByText("Cover: Annie's portrait")).toBeInTheDocument();
    expect(
      screen.getByLabelText("More actions for 安妮的夏天 🐹"),
    ).toBeInTheDocument();
  });

  it("uses the PiggieVault placeholder for an empty album", () => {
    render(<AlbumCard album={{ ...album, cover: null, photo_count: 0 }} />);
    expect(screen.getByRole("img", { name: "Empty album" })).toHaveTextContent(
      "PV",
    );
    expect(screen.getByText("0 photos")).toBeInTheDocument();
  });

  it("distinguishes a signed-cover failure from an empty album", () => {
    render(
      <AlbumCard
        album={{
          ...album,
          cover: album.cover ? { ...album.cover, signed_url: null } : null,
        }}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Album cover unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Empty album" }),
    ).not.toBeInTheDocument();
  });
});
