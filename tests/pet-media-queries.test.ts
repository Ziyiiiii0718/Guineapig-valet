import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "owner-a";
const PET_A = "550e8400-e29b-41d4-a716-446655440001";
const PET_B = "550e8400-e29b-41d4-a716-446655440002";
const signed = vi.hoisted(() =>
  vi.fn(async (_client: unknown, path: string) => `signed:${path}`),
);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/photos/queries", () => ({ createUserPhotoSignedUrl: signed }));

// This small query double applies the requested filters to mixed-owner fixtures.
// It also records every predicate, so missing ownership or human-truth filters
// cannot silently pass because a fixture already contains only eligible rows.
function prediction(
  status: string,
  ids: string[],
  owner = USER,
  unknown = false,
) {
  return {
    user_id: owner,
    review_status: status,
    confirmed_pet_ids: ids,
    confirmed_unknown: unknown,
    suggested_pet_ids: [PET_A],
    // Manual truth must remain visible without successful AI processing.
    processing_status:
      status === "corrected" ? "failed" : "insufficient_references",
  };
}
function photo(id: string, p: ReturnType<typeof prediction>, owner = USER) {
  return {
    id,
    user_id: owner,
    storage_path: `${owner}/${id}.jpg`,
    prediction: p,
    file_name: `${id}.jpg`,
  };
}
const photos = [
  photo("confirmed", prediction("confirmed", [PET_A])),
  photo("multi", prediction("corrected", [PET_A, PET_B])),
  photo("suggestion", prediction("pending_review", [])),
  photo("skipped", prediction("skipped", [PET_A])),
  photo("unknown", prediction("corrected", [], USER, true)),
  photo("other-pet", prediction("confirmed", [PET_B])),
  photo("foreign", prediction("confirmed", [PET_A], "owner-b"), "owner-b"),
  photo("foreign-prediction", prediction("confirmed", [PET_A], "owner-b")),
];

function buildClient({ owned = true, failTable = "" } = {}) {
  const albums = [
    {
      id: "album-a",
      user_id: USER,
      title: "Memories",
      membership: { user_id: USER, photo: photos[0] },
    },
    {
      id: "suggested-album",
      user_id: USER,
      title: "Unreviewed",
      membership: { user_id: USER, photo: photos[2] },
    },
    {
      id: "foreign-album",
      user_id: "owner-b",
      title: "Private",
      membership: { user_id: "owner-b", photo: photos[6] },
    },
  ];
  const rows: Record<string, unknown[]> = {
    pets: owned
      ? [
          { id: PET_A, user_id: USER },
          { id: PET_B, user_id: USER },
        ]
      : [],
    photos,
    albums,
    album_photos: [
      { album_id: "album-a", user_id: USER, photo_id: "confirmed" },
      { album_id: "album-a", user_id: USER, photo_id: "multi" },
    ],
  };
  const calls: Array<{
    table: string;
    filters: Array<[string, string, unknown]>;
    selection: string;
  }> = [];
  const from = vi.fn((table: string) => {
    const call = {
      table,
      filters: [] as Array<[string, string, unknown]>,
      selection: "",
    };
    calls.push(call);
    let start = 0,
      end = Infinity,
      single = false;
    const result = () => {
      if (table === failTable)
        return { data: null, count: null, error: { code: "TEST_ERROR" } };
      const data = (rows[table] || []).filter((row) =>
        call.filters.every(([operation, key, value]) => {
          const actual = key
            .split(".")
            .reduce(
              (current: unknown, part) =>
                (current as Record<string, unknown>)?.[part],
              row,
            );
          if (operation === "eq") return actual === value;
          if (operation === "in") return (value as unknown[]).includes(actual);
          return (
            Array.isArray(actual) &&
            (value as unknown[]).every((item) => actual.includes(item))
          );
        }),
      );
      return {
        data: single ? (data[0] ?? null) : data.slice(start, end + 1),
        count: data.length,
        error: null,
      };
    };
    const builder = {
      select: vi.fn((selection: string) => {
        call.selection = selection;
        return builder;
      }),
      eq: vi.fn((key: string, value: unknown) => {
        call.filters.push(["eq", key, value]);
        return builder;
      }),
      in: vi.fn((key: string, value: unknown) => {
        call.filters.push(["in", key, value]);
        return builder;
      }),
      contains: vi.fn((key: string, value: unknown) => {
        call.filters.push(["contains", key, value]);
        return builder;
      }),
      order: vi.fn(() => builder),
      range: vi.fn((from: number, to: number) => {
        start = from;
        end = to;
        return builder;
      }),
      limit: vi.fn((limit: number) => {
        end = limit - 1;
        return builder;
      }),
      maybeSingle: vi.fn(() => {
        single = true;
        return Promise.resolve(result());
      }),
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve(result()).then(resolve),
    };
    return builder;
  });
  return { from, calls };
}
let client = buildClient();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => client,
}));
import {
  listConfirmedPhotosForPet,
  listAlbumsFeaturingPet,
} from "@/lib/pets/media-queries";

describe("owner-scoped pet media", () => {
  beforeEach(() => {
    client = buildClient();
    signed.mockClear();
  });

  it("shows only confirmed/corrected human truth, never an AI suggestion or Unknown", async () => {
    const result = await listConfirmedPhotosForPet(PET_A, USER);
    expect(result.photos.map((row) => row.id)).toEqual(["confirmed", "multi"]);
    expect(result.count).toBe(2);
    expect(
      client.calls.find((call) => call.table === "photos")?.selection,
    ).toContain("photo_pet_predictions_photo_owner_fkey!inner");
    expect(signed.mock.calls.map((call) => call[1])).toEqual([
      "owner-a/confirmed.jpg",
      "owner-a/multi.jpg",
    ]);
  });

  it("includes the same multi-pet reviewed photo for each confirmed pet", async () => {
    const a = await listConfirmedPhotosForPet(PET_A, USER);
    const b = await listConfirmedPhotosForPet(PET_B, USER);
    expect(a.photos.map((row) => row.id)).toContain("multi");
    expect(b.photos.map((row) => row.id)).toEqual(["multi", "other-pet"]);
  });

  it("rejects a missing/foreign pet before querying photos or signing images", async () => {
    client = buildClient({ owned: false });
    const result = await listConfirmedPhotosForPet(PET_A, USER);
    expect(result.error).toBeTruthy();
    expect(client.calls.map((call) => call.table)).toEqual(["pets"]);
    expect(signed).not.toHaveBeenCalled();
  });

  it("paginates before signing and retains the exact total", async () => {
    const result = await listConfirmedPhotosForPet(PET_A, USER, {
      limit: 1,
      page: 2,
    });
    expect(result.photos.map((row) => row.id)).toEqual(["multi"]);
    expect(result.count).toBe(2);
    expect(signed).toHaveBeenCalledTimes(1);
  });

  it("derives albums only through owned memberships and reviewed photos", async () => {
    const result = await listAlbumsFeaturingPet(PET_A, USER);
    expect(result.albums.map((album) => album.id)).toEqual(["album-a"]);
    expect(result.albums[0].photo_count).toBe(2);
    expect(result.albums[0].cover?.id).toBe("confirmed");
    const call = client.calls.find((call) => call.table === "albums")!;
    expect(call.selection).toContain("album_photos_album_owner_fkey!inner");
    expect(call.selection).toContain("album_photos_photo_owner_fkey!inner");
    for (const field of [
      "user_id",
      "membership.user_id",
      "membership.photo.user_id",
      "membership.photo.prediction.user_id",
    ])
      expect(call.filters).toContainEqual(["eq", field, USER]);
  });

  it("does not turn query failures into a misleading empty success", async () => {
    client = buildClient({ failTable: "photos" });
    const result = await listConfirmedPhotosForPet(PET_A, USER);
    expect(result.error).toBeTruthy();
    expect(result.photos).toEqual([]);
    expect(signed).not.toHaveBeenCalled();
  });

  it("reports album count/cover lookup failure without fabricated zero counts", async () => {
    client = buildClient({ failTable: "album_photos" });
    const result = await listAlbumsFeaturingPet(PET_A, USER);
    expect(result.error).toBeTruthy();
    expect(result.albums).toEqual([]);
  });
});
