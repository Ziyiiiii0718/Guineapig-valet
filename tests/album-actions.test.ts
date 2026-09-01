import { beforeEach, describe, expect, it, vi } from "vitest";

const ALBUM_ID = "550e8400-e29b-41d4-a716-446655440000";
const PHOTO_A = "550e8400-e29b-41d4-a716-446655440001";
const PHOTO_B = "550e8400-e29b-41d4-a716-446655440002";

type MockOptions = {
  album?: { id: string; user_id: string } | null;
  ownedPhotoIds?: string[];
  operationError?: unknown;
};

function thenable(value: unknown) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => value),
    select: vi.fn(),
    single: vi.fn(async () => value),
    then: (resolve: (value: unknown) => void) => resolve(value),
  };
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function buildSupabaseMock({
  album = { id: ALBUM_ID, user_id: "user-1" },
  operationError = null,
  ownedPhotoIds = [PHOTO_A, PHOTO_B],
}: MockOptions = {}) {
  const upsert = vi.fn(async () => ({ error: operationError }));
  const deleteMembership = vi.fn(() => thenable({ error: operationError }));
  const updateAlbum = vi.fn(() => thenable({ error: null }));
  const deleteAlbum = vi.fn(() => thenable({ error: operationError }));
  const from = vi.fn((table: string) => {
    if (table === "albums") {
      return {
        delete: deleteAlbum,
        select: vi.fn(() => thenable({ data: album, error: null })),
        update: updateAlbum,
      };
    }
    if (table === "photos") {
      return {
        select: vi.fn(() =>
          thenable({
            data: ownedPhotoIds.map((id) => ({ id })),
            error: null,
          }),
        ),
      };
    }
    return { delete: deleteMembership, upsert };
  });
  return { deleteAlbum, deleteMembership, from, updateAlbum, upsert };
}

async function loadActions(
  supabase: ReturnType<typeof buildSupabaseMock>,
  userId: string | null = "user-1",
) {
  vi.doMock("@/lib/env", () => ({
    getPublicEnvStatus: () => ({ isConfigured: true }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: userId ? { id: userId } : null },
        })),
      },
      from: supabase.from,
    })),
  }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
  return import("@/app/actions/albums");
}

function membershipForm(photoIds = [PHOTO_A, PHOTO_B]) {
  const form = new FormData();
  form.set("albumId", ALBUM_ID);
  photoIds.forEach((id) => form.append("photoIds", id));
  return form;
}

describe("album membership actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("adds multiple owned photos with authenticated user ownership", async () => {
    const supabase = buildSupabaseMock();
    const { addPhotosToAlbumAction } = await loadActions(supabase);
    const result = await addPhotosToAlbumAction(
      { status: "idle" },
      membershipForm(),
    );
    expect(result.status).toBe("success");
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          album_id: ALBUM_ID,
          photo_id: PHOTO_A,
          user_id: "user-1",
        }),
        expect.objectContaining({
          album_id: ALBUM_ID,
          photo_id: PHOTO_B,
          user_id: "user-1",
        }),
      ]),
      { ignoreDuplicates: true, onConflict: "album_id,photo_id" },
    );
  });

  it("rejects cross-user or missing photos before membership insertion", async () => {
    const supabase = buildSupabaseMock({ ownedPhotoIds: [PHOTO_A] });
    const { addPhotosToAlbumAction } = await loadActions(supabase);
    const result = await addPhotosToAlbumAction(
      { status: "idle" },
      membershipForm(),
    );
    expect(result).toMatchObject({
      message: "One or more selected photos are unavailable.",
      status: "error",
    });
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it("rejects another user's or missing album without revealing it", async () => {
    const supabase = buildSupabaseMock({ album: null });
    const { addPhotosToAlbumAction } = await loadActions(supabase);
    const result = await addPhotosToAlbumAction(
      { status: "idle" },
      membershipForm([PHOTO_A]),
    );
    expect(result).toMatchObject({
      message: "We could not find that album.",
      status: "error",
    });
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it("removes only the membership row, not a photo or Storage object", async () => {
    const supabase = buildSupabaseMock();
    const { removePhotoFromAlbumAction } = await loadActions(supabase);
    const form = new FormData();
    form.set("albumId", ALBUM_ID);
    form.set("photoId", PHOTO_A);
    const result = await removePhotoFromAlbumAction({ status: "idle" }, form);
    expect(result.status).toBe("success");
    expect(supabase.deleteMembership).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalledWith("storage.objects");
    expect(supabase.from).not.toHaveBeenCalledWith("photos");
  });

  it("requires an authenticated session", async () => {
    const supabase = buildSupabaseMock();
    const { addPhotosToAlbumAction } = await loadActions(supabase, null);
    const result = await addPhotosToAlbumAction(
      { status: "idle" },
      membershipForm([PHOTO_A]),
    );
    expect(result).toMatchObject({
      message: "Please log in to manage albums.",
      status: "error",
    });
    expect(supabase.upsert).not.toHaveBeenCalled();
  });
});

describe("album deletion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it("deletes only the owned album and relies on membership cascade", async () => {
    const supabase = buildSupabaseMock();
    const { deleteAlbumAction } = await loadActions(supabase);
    const form = new FormData();
    form.set("albumId", ALBUM_ID);
    await deleteAlbumAction({ status: "idle" }, form);
    expect(supabase.deleteAlbum).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalledWith("photos");
    expect(supabase.from).not.toHaveBeenCalledWith("storage.objects");
  });
});
