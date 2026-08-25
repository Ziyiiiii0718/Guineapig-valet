import { beforeEach, describe, expect, it, vi } from "vitest";

const PHOTO_ID = "550e8400-e29b-41d4-a716-446655440000";

function renameFormData({
  displayName = "Annie eating hay",
  intent = "save",
  photoId = PHOTO_ID,
} = {}) {
  const formData = new FormData();
  formData.set("displayName", displayName);
  formData.set("intent", intent);
  formData.set("photoId", photoId);
  return formData;
}

function buildSupabaseMock({
  photo = {
    id: PHOTO_ID,
    storage_path: "user-1/2026/08/photo-id.jpg",
    user_id: "user-1",
  },
  readError = null,
  updateError = null,
}: {
  photo?: { id: string; storage_path: string; user_id: string } | null;
  readError?: unknown;
  updateError?: unknown;
} = {}) {
  const maybeSingle = vi.fn(async () => ({ data: photo, error: readError }));
  const readQuery = {
    eq: vi.fn(() => readQuery),
    maybeSingle,
  };
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    then: (resolve: (value: { error: unknown }) => void) =>
      resolve({ error: updateError }),
  };
  const update = vi.fn(() => updateQuery);
  const from = vi.fn(() => ({
    select: vi.fn(() => readQuery),
    update,
  }));

  return { from, update };
}

async function loadRenameAction(
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

  return import("@/app/actions/photos");
}

describe("photo display-name server action", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: () => "result-id",
    });
  });

  it("trims and updates only editable metadata for the owned photo", async () => {
    const supabase = buildSupabaseMock();
    const { updatePhotoDisplayNameAction } = await loadRenameAction(supabase);
    const result = await updatePhotoDisplayNameAction(
      { status: "idle" },
      renameFormData({ displayName: "  安妮吃干草 🐹  " }),
    );

    expect(result.status).toBe("success");
    expect(supabase.update).toHaveBeenCalledWith({
      display_name: "安妮吃干草 🐹",
      updated_at: expect.any(String),
    });
    expect(supabase.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ storage_path: expect.anything() }),
    );
    expect(supabase.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ file_name: expect.anything() }),
    );
  });

  it("resets the custom name to the original filename fallback", async () => {
    const supabase = buildSupabaseMock();
    const { updatePhotoDisplayNameAction } = await loadRenameAction(supabase);
    const result = await updatePhotoDisplayNameAction(
      { status: "idle" },
      renameFormData({ displayName: "", intent: "reset" }),
    );

    expect(result.status).toBe("success");
    expect(supabase.update).toHaveBeenCalledWith({
      display_name: null,
      updated_at: expect.any(String),
    });
  });

  it("rejects invalid IDs and blank or overlong names before database access", async () => {
    const supabase = buildSupabaseMock();
    const { updatePhotoDisplayNameAction } = await loadRenameAction(supabase);

    await expect(
      updatePhotoDisplayNameAction(
        { status: "idle" },
        renameFormData({ photoId: "not-a-photo" }),
      ),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      updatePhotoDisplayNameAction(
        { status: "idle" },
        renameFormData({ displayName: "   " }),
      ),
    ).resolves.toMatchObject({
      message: "Enter a photo name.",
      status: "error",
    });
    await expect(
      updatePhotoDisplayNameAction(
        { status: "idle" },
        renameFormData({ displayName: "a".repeat(81) }),
      ),
    ).resolves.toMatchObject({ status: "error" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does not rename a missing or another user's photo", async () => {
    const supabase = buildSupabaseMock({
      photo: {
        id: PHOTO_ID,
        storage_path: "user-2/2026/08/photo-id.jpg",
        user_id: "user-2",
      },
    });
    const { updatePhotoDisplayNameAction } = await loadRenameAction(supabase);
    const result = await updatePhotoDisplayNameAction(
      { status: "idle" },
      renameFormData(),
    );

    expect(result).toMatchObject({
      message: "We could not find that photo.",
      status: "error",
    });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the session has expired", async () => {
    const supabase = buildSupabaseMock();
    const { updatePhotoDisplayNameAction } = await loadRenameAction(
      supabase,
      null,
    );
    const result = await updatePhotoDisplayNameAction(
      { status: "idle" },
      renameFormData(),
    );

    expect(result).toMatchObject({
      message: "Please log in to manage photos.",
      status: "error",
    });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the database update fails", async () => {
    const supabase = buildSupabaseMock({
      updateError: { message: "raw database details" },
    });
    const { updatePhotoDisplayNameAction } = await loadRenameAction(supabase);
    const result = await updatePhotoDisplayNameAction(
      { status: "idle" },
      renameFormData(),
    );

    expect(result).toEqual({
      fieldValue: "Annie eating hay",
      message: "We could not update this photo name. Please try again.",
      status: "error",
    });
  });
});
