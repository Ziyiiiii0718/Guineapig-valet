import { describe, expect, it } from "vitest";
import {
  comparePhotosByDisplayDate,
  formatPhotoDimensions,
  formatPhotoFileSize,
  getPhotoDisplayDate,
  getPhotoPaginationRange,
  groupPhotosByTimelineMonth,
  isOwnedUserPhotoPath,
  parsePhotoPage,
  parsePhotoSort,
  photoIdSchema,
  sortPhotosByDisplayDate,
} from "@/lib/photos/gallery";

const basePhoto = {
  created_at: "2026-01-01T00:00:00.000Z",
  taken_at: null,
  uploaded_at: "2026-01-02T00:00:00.000Z",
};

describe("photo gallery date helpers", () => {
  it("uses taken_at before uploaded_at and created_at", () => {
    const displayDate = getPhotoDisplayDate({
      ...basePhoto,
      created_at: "2026-03-01T00:00:00.000Z",
      taken_at: "2026-01-15T12:00:00.000Z",
      uploaded_at: "2026-02-01T00:00:00.000Z",
    });

    expect(displayDate?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  it("falls back to uploaded_at and then created_at", () => {
    expect(
      getPhotoDisplayDate({
        created_at: "2026-04-01T00:00:00.000Z",
        taken_at: null,
        uploaded_at: "2026-03-01T00:00:00.000Z",
      })?.toISOString(),
    ).toBe("2026-03-01T00:00:00.000Z");

    expect(
      getPhotoDisplayDate({
        created_at: "2026-04-01T00:00:00.000Z",
        taken_at: null,
        uploaded_at: null,
      })?.toISOString(),
    ).toBe("2026-04-01T00:00:00.000Z");
  });

  it("uses UTC month boundaries for timeline grouping", () => {
    const groups = groupPhotosByTimelineMonth([
      {
        ...basePhoto,
        id: "a",
        taken_at: "2026-07-01T00:30:00.000Z",
      },
      {
        ...basePhoto,
        id: "b",
        taken_at: "2026-06-30T23:30:00.000Z",
      },
    ]);

    expect(groups.map((group) => group.id)).toEqual(["2026-07", "2026-06"]);
    expect(groups.map((group) => group.label)).toEqual([
      "July 2026",
      "June 2026",
    ]);
  });
});

describe("photo gallery sorting and grouping", () => {
  const photos = [
    { ...basePhoto, id: "b", taken_at: "2026-02-01T00:00:00.000Z" },
    { ...basePhoto, id: "a", taken_at: "2026-02-01T00:00:00.000Z" },
    { ...basePhoto, id: "c", taken_at: "2026-03-01T00:00:00.000Z" },
  ];

  it("sorts newest first with a deterministic id tie-breaker", () => {
    expect(
      sortPhotosByDisplayDate(photos, "newest").map((photo) => photo.id),
    ).toEqual(["c", "b", "a"]);
  });

  it("sorts oldest first with a deterministic id tie-breaker", () => {
    expect(
      sortPhotosByDisplayDate(photos, "oldest").map((photo) => photo.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("compares equal timestamps using the secondary ordering", () => {
    expect(
      comparePhotosByDisplayDate(photos[0], photos[1], "newest"),
    ).toBeLessThan(0);
    expect(
      comparePhotosByDisplayDate(photos[0], photos[1], "oldest"),
    ).toBeGreaterThan(0);
  });

  it("groups consecutive photos by month and preserves order", () => {
    const groups = groupPhotosByTimelineMonth(
      sortPhotosByDisplayDate(photos, "newest"),
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.id).toBe("2026-03");
    expect(groups[0]?.photos.map((photo) => photo.id)).toEqual(["c"]);
    expect(groups[1]?.id).toBe("2026-02");
    expect(groups[1]?.photos.map((photo) => photo.id)).toEqual(["b", "a"]);
  });
});

describe("photo gallery query parameter helpers", () => {
  it("defaults invalid sort parameters safely", () => {
    expect(parsePhotoSort(undefined)).toBe("newest");
    expect(parsePhotoSort("oldest")).toBe("oldest");
    expect(parsePhotoSort("sideways")).toBe("newest");
    expect(parsePhotoSort(["oldest", "newest"])).toBe("oldest");
  });

  it("normalizes invalid page parameters", () => {
    expect(parsePhotoPage(undefined)).toBe(1);
    expect(parsePhotoPage("3")).toBe(3);
    expect(parsePhotoPage("0")).toBe(1);
    expect(parsePhotoPage("-2")).toBe(1);
    expect(parsePhotoPage("abc")).toBe(1);
  });

  it("calculates stable page ranges", () => {
    expect(getPhotoPaginationRange(1, 24)).toEqual({ from: 0, to: 23 });
    expect(getPhotoPaginationRange(2, 24)).toEqual({ from: 24, to: 47 });
  });
});

describe("photo gallery security and formatting helpers", () => {
  it("validates private storage path ownership", () => {
    expect(isOwnedUserPhotoPath("user-a/2026/07/photo.png", "user-a")).toBe(
      true,
    );
    expect(isOwnedUserPhotoPath("user-b/2026/07/photo.png", "user-a")).toBe(
      false,
    );
    expect(isOwnedUserPhotoPath(null, "user-a")).toBe(false);
  });

  it("validates photo detail and delete IDs as UUIDs", () => {
    expect(photoIdSchema.safeParse("abc").success).toBe(false);
    expect(
      photoIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success,
    ).toBe(true);
  });

  it("formats file sizes and empty metadata fallbacks", () => {
    expect(formatPhotoFileSize(512)).toBe("512 B");
    expect(formatPhotoFileSize(2048)).toBe("2 KB");
    expect(formatPhotoFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatPhotoFileSize(null)).toBe("Unknown size");
    expect(formatPhotoDimensions(1179, 2556)).toBe("1179 x 2556");
    expect(formatPhotoDimensions(null, 2556)).toBe("Unknown dimensions");
  });
});
