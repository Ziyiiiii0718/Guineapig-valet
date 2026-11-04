import { beforeEach, describe, expect, it, vi } from "vitest";

const PHOTO_ID = "550e8400-e29b-41d4-a716-446655440001";
const PREDICTION_ID = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID = "550e8400-e29b-41d4-a716-446655440003";
const PET_ID = "550e8400-e29b-41d4-a716-446655440004";

function unitVector(x = 1) {
  return [x, Math.sqrt(1 - x * x), ...Array.from({ length: 510 }, () => 0)];
}

function query(result: unknown) {
  const builder = {
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => result),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

function buildSupabase({
  corrected = false,
  machineResultExists = true,
  incompatible = false,
  references = 2,
  finishOutcome = "saved",
  failFinish = false,
  loseFinishResponse = false,
}: {
  corrected?: boolean;
  machineResultExists?: boolean;
  incompatible?: boolean;
  references?: number;
  finishOutcome?: string;
  failFinish?: boolean;
  loseFinishResponse?: boolean;
} = {}) {
  const predictionUpdates: Array<Record<string, unknown>> = [];
  const photoUpdates: Array<Record<string, unknown>> = [];
  const upserts: Array<Record<string, unknown>> = [];
  const referenceRows = Array.from({ length: references }, (_, index) => ({
    embedding: JSON.stringify(unitVector(index === 0 ? 1 : 0.9)),
    embedding_dimension: 512,
    embedding_model: "ViT-B-32-quickgelu",
    embedding_version: incompatible ? "other-weights" : "openai",
    id: `reference-${index}`,
    pet_id: PET_ID,
  }));
  const from = vi.fn((table: string) => {
    if (table === "pet_reference_photos") {
      return {
        select: vi.fn(() => query({ data: referenceRows, error: null })),
      };
    }
    if (table === "photos") {
      return {
        update: vi.fn((payload: Record<string, unknown>) => {
          photoUpdates.push(payload);
          return query({ error: null });
        }),
      };
    }
    return {
      update: vi.fn((payload: Record<string, unknown>) => {
        predictionUpdates.push(payload);
        return query({ error: null });
      }),
      upsert: vi.fn((payload: Record<string, unknown>) => {
        upserts.push(payload);
        return query({
          data: {
            classification_version: machineResultExists
              ? "existing-version"
              : null,
            confirmed_pet_ids: corrected ? [PET_ID] : [],
            confirmed_unknown: false,
            id: PREDICTION_ID,
            review_status: corrected ? "corrected" : "pending_review",
          },
          error: null,
        });
      }),
    };
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "start_photo_classification") {
      upserts.push(args);
      return {
        data: {
          outcome: "started",
          prediction: {
            id: PREDICTION_ID,
            review_status: corrected ? "corrected" : "pending_review",
            confirmed_pet_ids: corrected ? [PET_ID] : [],
            confirmed_unknown: false,
            classification_version: machineResultExists
              ? "existing-version"
              : null,
          },
        },
        error: null,
      };
    }
    predictionUpdates.push({
      ...(args.machine_result as object),
      processing_status: args.result_status,
    });
    if (loseFinishResponse) throw new Error("Uncertain commit");
    return {
      data: failFinish
        ? null
        : {
            outcome: finishOutcome,
            status: args.result_status,
            category: args.result_error,
          },
      error: failFinish ? {} : null,
    };
  });
  return {
    rpc,
    from,
    photoUpdates,
    predictionUpdates,
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: new Blob(["private-image"], { type: "image/jpeg" }),
          error: null,
        })),
      })),
    },
    upserts,
  };
}

async function loadProcessor({ fail = false }: { fail?: boolean } = {}) {
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/ai/client", async () => {
    const { AiEmbeddingError } =
      await vi.importActual<typeof import("@/lib/ai/embedding")>(
        "@/lib/ai/embedding",
      );
    return {
      requestImageEmbedding: fail
        ? vi.fn(async () => {
            throw new AiEmbeddingError("service_unavailable", "offline");
          })
        : vi.fn(async () => ({
            dimension: 512,
            embedding: unitVector(1),
            model: "ViT-B-32-quickgelu",
            version: "openai",
          })),
    };
  });
  return import("@/lib/ai/photo-classification");
}

const photo = {
  id: PHOTO_ID,
  mime_type: "image/jpeg",
  storage_path: `${USER_ID}/2026/09/photo.jpg`,
  user_id: USER_ID,
};

describe("photo classification processing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "run-token" });
  });

  it("stores ranked candidates and a reviewable suggestion", async () => {
    const supabase = buildSupabase();
    const { processPhotoClassification } = await loadProcessor();
    const result = await processPhotoClassification({
      photo,
      supabase: supabase as never,
      userId: USER_ID,
    });
    expect(result.status).toBe("ready_for_review");
    expect(supabase.predictionUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidate_pet_ids: [PET_ID],
          processing_status: "ready_for_review",
          suggested_pet_ids: [PET_ID],
        }),
      ]),
    );
  });

  it.each([false, true])(
    "preserves manual labels while respecting existing machine snapshot: %s",
    async (machineResultExists) => {
      const supabase = buildSupabase({ corrected: true, machineResultExists });
      const { processPhotoClassification } = await loadProcessor();
      const result = await processPhotoClassification({
        photo,
        supabase: supabase as never,
        userId: USER_ID,
      });
      expect(result.status).toBe("ready_for_review");
      const completed = supabase.predictionUpdates.find(
        (update) => update.processing_status === "ready_for_review",
      )!;
      expect(completed).not.toHaveProperty("confirmed_pet_ids");
      expect(completed).not.toHaveProperty("review_status");
      if (machineResultExists)
        expect(completed).not.toHaveProperty("suggested_pet_ids");
      else expect(completed.suggested_pet_ids).toEqual([PET_ID]);
    },
  );

  it("records insufficient references without calling Storage", async () => {
    const supabase = buildSupabase({ references: 1 });
    const { processPhotoClassification } = await loadProcessor();
    const result = await processPhotoClassification({
      photo,
      supabase: supabase as never,
      userId: USER_ID,
    });
    expect(result.status).toBe("insufficient_references");
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("preserves a corrected truth while recording service failure", async () => {
    const supabase = buildSupabase({ corrected: true });
    const { processPhotoClassification } = await loadProcessor({ fail: true });
    const result = await processPhotoClassification({
      photo,
      supabase: supabase as never,
      userId: USER_ID,
    });
    expect(result).toMatchObject({
      category: "service_unavailable",
      status: "failed",
    });
    expect(supabase.upserts[0]).not.toHaveProperty("confirmed_pet_ids");
    expect(supabase.upserts[0]).not.toHaveProperty("review_status");
    expect(supabase.photoUpdates).toEqual([]);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "finish_photo_classification",
      expect.objectContaining({
        attempt_token: "run-token",
        result_status: "failed",
      }),
    );
  });

  it("fails honestly when ready references use incompatible model metadata", async () => {
    const supabase = buildSupabase({ incompatible: true });
    const { processPhotoClassification } = await loadProcessor();
    const result = await processPhotoClassification({
      photo,
      supabase: supabase as never,
      userId: USER_ID,
    });
    expect(result).toMatchObject({
      category: "model_mismatch",
      status: "failed",
    });
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it.each(["ready", "failure"])(
  "reports superseded %s attempts without separate status writes",
  async (mode) => {
    const supabase = buildSupabase({ finishOutcome: "superseded" });
    const { processPhotoClassification } = await loadProcessor({
      fail: mode === "failure",
    });
    expect(
      (
        await processPhotoClassification({
          photo,
          supabase: supabase as never,
          userId: USER_ID,
        })
      ).status,
    ).toBe("superseded");
    expect(supabase.photoUpdates).toEqual([]);
  },
);
it.each(["fail", "lost"])(
  "does not issue a fallback failure update after %s persistence response",
  async (mode) => {
    const supabase = buildSupabase({
      failFinish: mode === "fail",
      loseFinishResponse: mode === "lost",
    });
    const { processPhotoClassification } = await loadProcessor();
    expect(
      await processPhotoClassification({
        photo,
        supabase: supabase as never,
        userId: USER_ID,
      }),
    ).toMatchObject({ status: "failed", category: "database_failure" });
    expect(
      supabase.rpc.mock.calls.filter(
        ([name]) => name === "finish_photo_classification",
      ),
    ).toHaveLength(1);
    expect(supabase.photoUpdates).toEqual([]);
  },
);
it("rejects mismatched ownership before starting an attempt", async () => {
  const supabase = buildSupabase();
  const { processPhotoClassification } = await loadProcessor();
  expect(
    (
      await processPhotoClassification({
        photo,
        supabase: supabase as never,
        userId: "other",
      })
    ).status,
  ).toBe("failed");
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(supabase.storage.from).not.toHaveBeenCalled();
});
