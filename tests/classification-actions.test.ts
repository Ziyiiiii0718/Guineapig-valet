import { beforeEach, describe, expect, it, vi } from "vitest";

const PHOTO_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const PET_A = "550e8400-e29b-41d4-a716-446655440003";
const PET_B = "550e8400-e29b-41d4-a716-446655440004";

function query(result: unknown) {
  const builder = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

function buildSupabase({ ownedPhoto = true } = {}) {
  const predictionUpdates: Array<Record<string, unknown>> = [];
  const photoUpdates: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "photos") {
      return {
        select: vi.fn(() =>
          query({
            data: ownedPhoto
              ? {
                  id: PHOTO_ID,
                  mime_type: "image/jpeg",
                  storage_path: `${USER_ID}/2026/09/photo.jpg`,
                  user_id: USER_ID,
                }
              : null,
            error: null,
          }),
        ),
        update: vi.fn((payload: Record<string, unknown>) => {
          photoUpdates.push(payload);
          return query({ error: null });
        }),
      };
    }
    if (table === "pets") {
      return {
        select: vi.fn(() => {
          let result = { data: [{ id: PET_A }, { id: PET_B }], error: null };
          const builder = query(result);
          builder.in.mockImplementation((_column: string, ids: string[]) => {
            result = {
              data: [{ id: PET_A }, { id: PET_B }].filter((pet) =>
                ids.includes(pet.id),
              ),
              error: null,
            };
            builder.then = (resolve: (value: unknown) => void) =>
              resolve(result);
            return builder;
          });
          return builder;
        }),
      };
    }
    return {
      select: vi.fn(() =>
        query({
          data: {
            id: "prediction-1",
            photo_id: PHOTO_ID,
            processing_status: "ready_for_review",
            review_status: "pending_review",
            suggested_pet_ids: [PET_A],
            suggested_unknown: false,
            user_id: USER_ID,
          },
          error: null,
        }),
      ),
      update: vi.fn((payload: Record<string, unknown>) => {
        predictionUpdates.push(payload);
        return query({ error: null });
      }),
    };
  });
  return {
    rpc: vi.fn(() => ({
      returns() {
        return this;
      },
      single: async () => ({
        data: { outcome: "saved", revision: 1 },
        error: null,
      }),
    })),
    auth: {
      getUser: vi.fn(
        async (): Promise<{ data: { user: { id: string } | null } }> => ({
          data: { user: { id: USER_ID } },
        }),
      ),
    },
    from,
    photoUpdates,
    predictionUpdates,
  };
}

async function loadActions(supabase: ReturnType<typeof buildSupabase>) {
  const processPhotoClassification = vi.fn(async () => ({
    category: null,
    predictionId: "prediction-1",
    status: "ready_for_review",
  }));
  vi.doMock("@/lib/env", () => ({
    getPublicEnvStatus: () => ({ isConfigured: true }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: vi.fn(async () => supabase),
  }));
  vi.doMock("@/lib/ai/photo-classification", () => ({
    processPhotoClassification,
  }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  const actions = await import("@/app/actions/classification");
  return { ...actions, processPhotoClassification };
}

function reviewForm(values: {
  intent?: "confirm" | "save" | "skip" | "clear";
  petIds?: string[];
  unknown?: boolean;
}) {
  const form = new FormData();
  form.set("photoId", PHOTO_ID);
  form.set("revision", "0");
  form.set("intent", values.intent ?? "save");
  for (const petId of values.petIds ?? []) form.append("petIds", petId);
  if (values.unknown) form.set("unknown", "true");
  return form;
}

describe("classification actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("classifies an owned photo", async () => {
    const supabase = buildSupabase();
    const { analyzeUploadedPhotoAction, processPhotoClassification } =
      await loadActions(supabase);
    const result = await analyzeUploadedPhotoAction(PHOTO_ID);
    expect(result.status).toBe("success");
    expect(processPhotoClassification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("does not announce success for a superseded attempt", async () => {
    const supabase = buildSupabase();
    const actions = await loadActions(supabase);
    actions.processPhotoClassification.mockResolvedValue({
      category: null,
      predictionId: "prediction-1",
      status: "superseded",
    });
    expect(await actions.analyzeUploadedPhotoAction(PHOTO_ID)).toMatchObject({
      status: "error",
      message: expect.stringContaining("newer analysis"),
    });
  });

  it("rejects a missing or cross-user photo before classification", async () => {
    const supabase = buildSupabase({ ownedPhoto: false });
    const { analyzeUploadedPhotoAction, processPhotoClassification } =
      await loadActions(supabase);
    const result = await analyzeUploadedPhotoAction(PHOTO_ID);
    expect(result.status).toBe("error");
    expect(processPhotoClassification).not.toHaveBeenCalled();
  });

  it.each([
    ["save", [PET_A], false],
    ["save", [PET_A, PET_B], false],
    ["save", [], true],
    ["confirm", [PET_A], false],
    ["clear", [], false],
    ["skip", [], false],
  ] as const)(
    "saves %s through the transactional RPC without an AI read",
    async (intent, ids, unknown) => {
      const supabase = buildSupabase();
      const { reviewPhotoPredictionAction } = await loadActions(supabase);
      const result = await reviewPhotoPredictionAction(
        { status: "idle" },
        reviewForm({ intent, petIds: [...ids], unknown }),
      );
      expect(result.status).toBe("success");
      expect(result.revision).toBe(1);
      expect(supabase.rpc).toHaveBeenCalledWith("set_photo_labels", {
        target_photo_id: PHOTO_ID,
        expected_revision: 0,
        label_intent: intent,
        label_pet_ids: [...ids],
        label_unknown: unknown,
      });
      expect(supabase.from).not.toHaveBeenCalled();
    },
  );

  it.each(["unavailable", "conflict"])(
    "reports %s without a fallback write",
    async (outcome) => {
      const supabase = buildSupabase();
      supabase.rpc.mockReturnValue({
        returns() {
          return this;
        },
        single: async () => ({ data: { outcome, revision: 2 }, error: null }),
      });
      const { reviewPhotoPredictionAction } = await loadActions(supabase);
      const result = await reviewPhotoPredictionAction(
        { status: "idle" },
        reviewForm({ petIds: [PET_A] }),
      );
      expect(result.status).toBe("error");
      expect(supabase.from).not.toHaveBeenCalled();
    },
  );

  it("handles an uncertain response safely", async () => {
    const supabase = buildSupabase();
    supabase.rpc.mockImplementation(() => {
      throw new Error("network");
    });
    const { reviewPhotoPredictionAction } = await loadActions(supabase);
    expect(
      (
        await reviewPhotoPredictionAction(
          { status: "idle" },
          reviewForm({ petIds: [PET_A] }),
        )
      ).status,
    ).toBe("error");
  });

  it("rejects unauthenticated labeling", async () => {
    const supabase = buildSupabase();
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const { reviewPhotoPredictionAction } = await loadActions(supabase);
    expect(
      (
        await reviewPhotoPredictionAction(
          { status: "idle" },
          reviewForm({ petIds: [PET_A] }),
        )
      ).status,
    ).toBe("error");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects contradictory or malformed labels and missing revisions", async () => {
    const supabase = buildSupabase();
    const { reviewPhotoPredictionAction } = await loadActions(supabase);
    const forms = [
      reviewForm({ petIds: [PET_A], unknown: true }),
      reviewForm({}),
      reviewForm({ petIds: ["invalid"] }),
      reviewForm({ intent: "clear", petIds: [PET_A] }),
    ];
    const stale = reviewForm({ petIds: [PET_A] });
    stale.delete("revision");
    forms.push(stale);
    for (const form of forms)
      expect(
        (await reviewPhotoPredictionAction({ status: "idle" }, form)).status,
      ).toBe("error");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
