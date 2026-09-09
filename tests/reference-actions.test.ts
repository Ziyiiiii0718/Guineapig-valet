import { beforeEach, describe, expect, it, vi } from "vitest";

const PET_ID = "550e8400-e29b-41d4-a716-446655440000";
const PHOTO_ID = "550e8400-e29b-41d4-a716-446655440001";
const REFERENCE_ID = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID = "user-1";

type Scenario = {
  aiErrorCategory?: "service_unavailable";
  existingPhotoIds?: string[];
  existingQueryError?: { code: string; message: string };
  insertError?: { code: string; message: string };
  ownedPet?: boolean;
  ownedPhotos?: boolean;
  ownedReference?: boolean;
};

function query(result: unknown) {
  const value = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn(),
    select: vi.fn(),
    then: (resolve: (data: unknown) => void) => resolve(result),
  };
  value.eq.mockReturnValue(value);
  value.in.mockReturnValue(value);
  value.order.mockReturnValue(value);
  value.select.mockReturnValue(value);
  return value;
}

function buildSupabase({
  existingPhotoIds = [],
  existingQueryError,
  insertError,
  ownedPet = true,
  ownedPhotos = true,
  ownedReference = true,
}: Scenario = {}) {
  const updates: unknown[] = [];
  const inserts: unknown[] = [];
  const deletes: unknown[] = [];
  const from = vi.fn((table: string) => {
    if (table === "pets") {
      return {
        select: vi.fn(() =>
          query({
            data: ownedPet ? { id: PET_ID, user_id: USER_ID } : null,
            error: null,
          }),
        ),
      };
    }
    if (table === "photos") {
      return {
        select: vi.fn(() => {
          const result = ownedPhotos
            ? {
                data: [
                  {
                    id: PHOTO_ID,
                    mime_type: "image/jpeg",
                    storage_path: `${USER_ID}/2026/09/photo.jpg`,
                    user_id: USER_ID,
                  },
                ],
                error: null,
              }
            : { data: [], error: null };
          const builder = query(result);
          builder.maybeSingle.mockResolvedValue(
            ownedPhotos
              ? { data: result.data[0], error: null }
              : { data: null, error: null },
          );
          return builder;
        }),
      };
    }

    return {
      delete: vi.fn(() => {
        deletes.push({ table });
        return query({ error: null });
      }),
      insert: vi.fn((rows: unknown) => {
        inserts.push(rows);
        return query({
          data: insertError ? null : [{ id: REFERENCE_ID, photo_id: PHOTO_ID }],
          error: insertError ?? null,
        });
      }),
      select: vi.fn((columns: string) => {
        if (columns === "photo_id") {
          return query({
            data: existingQueryError
              ? null
              : existingPhotoIds.map((photo_id) => ({ photo_id })),
            error: existingQueryError ?? null,
          });
        }
        return query({
          data: ownedReference
            ? {
                id: REFERENCE_ID,
                pet_id: PET_ID,
                photo_id: PHOTO_ID,
                user_id: USER_ID,
              }
            : null,
          error: null,
        });
      }),
      update: vi.fn((payload: unknown) => {
        updates.push(payload);
        return query({ error: null });
      }),
    };
  });
  const download = vi.fn(async () => ({
    data: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
    error: null,
  }));
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
    deletes,
    from,
    inserts,
    storage: { from: vi.fn(() => ({ download })) },
    updates,
  };
}

async function loadActions(
  supabase: ReturnType<typeof buildSupabase>,
  scenario: Scenario = {},
) {
  vi.doMock("@/lib/env", () => ({
    getPublicEnvStatus: () => ({ isConfigured: true }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: vi.fn(async () => supabase),
  }));
  vi.doMock("@/lib/ai/client", async () => {
    const { AiEmbeddingError } =
      await vi.importActual<typeof import("@/lib/ai/embedding")>(
        "@/lib/ai/embedding",
      );
    return {
      requestImageEmbedding: scenario.aiErrorCategory
        ? vi.fn(async () => {
            throw new AiEmbeddingError(
              scenario.aiErrorCategory!,
              "unavailable",
            );
          })
        : vi.fn(async () => ({
            dimension: 512,
            embedding: [1, ...Array.from({ length: 511 }, () => 0)],
            model: "ViT-B-32-quickgelu",
            version: "openai",
          })),
    };
  });
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  return import("@/app/actions/references");
}

function addForm() {
  const form = new FormData();
  form.set("petId", PET_ID);
  form.append("photoIds", PHOTO_ID);
  return form;
}

function referenceForm() {
  const form = new FormData();
  form.set("petId", PET_ID);
  form.set("referenceId", REFERENCE_ID);
  return form;
}

describe("reference photo actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("adds an owned photo, transitions processing state, and stores model metadata", async () => {
    const supabase = buildSupabase();
    const { addReferencePhotosAction } = await loadActions(supabase);
    const result = await addReferencePhotosAction(
      { status: "idle" },
      addForm(),
    );
    expect(result.status).toBe("success");
    expect(supabase.inserts).toEqual([
      [
        expect.objectContaining({
          pet_id: PET_ID,
          photo_id: PHOTO_ID,
          user_id: USER_ID,
        }),
      ],
    ]);
    expect(supabase.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ embedding_status: "processing" }),
        expect.objectContaining({
          embedding_dimension: 512,
          embedding_model: "ViT-B-32-quickgelu",
          embedding_status: "ready",
          embedding_version: "openai",
        }),
      ]),
    );
  });

  it("rejects a missing or cross-user pet before inserting", async () => {
    const supabase = buildSupabase({ ownedPet: false });
    const { addReferencePhotosAction } = await loadActions(supabase);
    const result = await addReferencePhotosAction(
      { status: "idle" },
      addForm(),
    );
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/pet profile/i);
    expect(supabase.inserts).toHaveLength(0);
  });

  it("rejects missing or cross-user photos", async () => {
    const supabase = buildSupabase({ ownedPhotos: false });
    const { addReferencePhotosAction } = await loadActions(supabase);
    const result = await addReferencePhotosAction(
      { status: "idle" },
      addForm(),
    );
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/unavailable/i);
    expect(supabase.inserts).toHaveLength(0);
  });

  it("prevents a duplicate pet-photo reference", async () => {
    const supabase = buildSupabase({ existingPhotoIds: [PHOTO_ID] });
    const { addReferencePhotosAction } = await loadActions(supabase);
    const result = await addReferencePhotosAction(
      { status: "idle" },
      addForm(),
    );
    expect(result.message).toMatch(/already references/i);
    expect(supabase.inserts).toHaveLength(0);
  });

  it("reports a missing reference-photo migration instead of ignoring the query error", async () => {
    const supabase = buildSupabase({
      existingQueryError: {
        code: "PGRST204",
        message: "Could not find the photo_id column in the schema cache",
      },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { addReferencePhotosAction } = await loadActions(supabase);
    const result = await addReferencePhotosAction(
      { status: "idle" },
      addForm(),
    );

    expect(result.status).toBe("error");
    expect(supabase.inserts).toHaveLength(0);
    expect(info).toHaveBeenCalledWith(
      "[reference-add] REFERENCE_ADD_DB_ERROR_CODE=PGRST204",
    );
    expect(info).toHaveBeenCalledWith(
      "[reference-add] REFERENCE_ADD_ERROR_CATEGORY=MIGRATION_MISSING",
    );
    expect(info).toHaveBeenCalledWith(
      "[reference-add] REFERENCE_ADD_DB_OPERATION=EXISTING_REFERENCE_QUERY",
    );
    info.mockRestore();
  });

  it("categorizes an insert rejected by RLS without logging database details", async () => {
    const supabase = buildSupabase({
      insertError: {
        code: "42501",
        message: "new row violates row-level security policy",
      },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { addReferencePhotosAction } = await loadActions(supabase);
    const result = await addReferencePhotosAction(
      { status: "idle" },
      addForm(),
    );

    expect(result.status).toBe("error");
    expect(info).toHaveBeenCalledWith(
      "[reference-add] REFERENCE_ADD_DB_ERROR_CODE=42501",
    );
    expect(info).toHaveBeenCalledWith(
      "[reference-add] REFERENCE_ADD_ERROR_CATEGORY=RLS_DENIED",
    );
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining("new row"));
    info.mockRestore();
  });

  it("keeps the relationship and marks failure when the AI service is unavailable", async () => {
    const scenario = { aiErrorCategory: "service_unavailable" as const };
    const supabase = buildSupabase(scenario);
    const { addReferencePhotosAction } = await loadActions(supabase, scenario);
    const result = await addReferencePhotosAction(
      { status: "idle" },
      addForm(),
    );
    expect(result.status).toBe("error");
    expect(supabase.inserts).toHaveLength(1);
    expect(supabase.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          embedding_error_category: "service_unavailable",
          embedding_status: "failed",
        }),
      ]),
    );
  });

  it("rejects retry of another user's or missing reference", async () => {
    const supabase = buildSupabase({ ownedReference: false });
    const { retryReferenceEmbeddingAction } = await loadActions(supabase);
    const result = await retryReferenceEmbeddingAction(
      { status: "idle" },
      referenceForm(),
    );
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/reference/i);
  });

  it("removes only reference metadata and preserves photo and Storage", async () => {
    const supabase = buildSupabase();
    const { removeReferencePhotoAction } = await loadActions(supabase);
    const result = await removeReferencePhotoAction(
      { status: "idle" },
      referenceForm(),
    );
    expect(result.status).toBe("success");
    expect(result.message).toMatch(/original photo is still/i);
    expect(supabase.deletes).toEqual([{ table: "pet_reference_photos" }]);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });
});
