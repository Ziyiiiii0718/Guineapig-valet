import { beforeEach, describe, expect, it, vi } from "vitest";
const PET = "550e8400-e29b-41d4-a716-446655440000";
const RECORD = "7c9ecf1f-8147-4965-a14a-b4bfab33d7e8";
function query(value: unknown) {
  const q = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => value),
    then: (resolve: (v: unknown) => void) => resolve(value),
  };
  q.eq.mockReturnValue(q);
  return q;
}
function mockDb(
  pet: { id: string; user_id: string } | null = { id: PET, user_id: "user-1" },
  record: { id: string } | null = { id: RECORD },
) {
  const insert = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => query({ error: null }));
  const remove = vi.fn(() => query({ error: null }));
  const from = vi.fn((table: string) =>
    table === "pets"
      ? { select: vi.fn(() => query({ data: pet, error: null })) }
      : table === "weight_records"
        ? {
            insert,
            select: vi.fn(() => query({ data: record, error: null })),
            update,
            delete: remove,
          }
        : {},
  );
  return { from, insert, update, remove };
}
async function load(
  db: ReturnType<typeof mockDb>,
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
      from: db.from,
    })),
  }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  return import("@/app/actions/weights");
}
function form() {
  const f = new FormData();
  f.set("petId", PET);
  f.set("weightGrams", "1400");
  f.set("measuredAt", "2026-08-25");
  return f;
}
function recordForm() {
  const f = form();
  f.set("recordId", RECORD);
  return f;
}
describe("weight actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it("adds only to an owned pet using authenticated ownership", async () => {
    const db = mockDb();
    const { createWeightAction } = await load(db);
    expect((await createWeightAction({ status: "idle" }, form())).status).toBe(
      "success",
    );
    expect(db.insert).toHaveBeenCalledWith({
      pet_id: PET,
      recorded_at: "2026-08-25",
      user_id: "user-1",
      weight_grams: 1400,
    });
  });
  it("rejects a cross-user or missing pet", async () => {
    const db = mockDb(null);
    const { createWeightAction } = await load(db);
    expect(await createWeightAction({ status: "idle" }, form())).toMatchObject({
      message: "We could not find that pet.",
      status: "error",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("rejects expired sessions", async () => {
    const db = mockDb();
    const { createWeightAction } = await load(db, null);
    expect((await createWeightAction({ status: "idle" }, form())).status).toBe(
      "error",
    );
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("updates only an owned record and scopes the write to its owner", async () => {
    const db = mockDb();
    const { updateWeightAction } = await load(db);
    expect(
      (await updateWeightAction({ status: "idle" }, recordForm())).status,
    ).toBe("success");
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        recorded_at: "2026-08-25",
        weight_grams: 1400,
      }),
    );
  });
  it("rejects an update when the record is not owned or does not exist", async () => {
    const db = mockDb(undefined, null);
    const { updateWeightAction } = await load(db);
    expect(
      await updateWeightAction({ status: "idle" }, recordForm()),
    ).toMatchObject({
      message: "We could not find that measurement.",
      status: "error",
    });
    expect(db.update).not.toHaveBeenCalled();
  });
  it("deletes one owned record through an owner- and pet-scoped query", async () => {
    const db = mockDb();
    const { deleteWeightAction } = await load(db);
    expect(
      (await deleteWeightAction({ status: "idle" }, recordForm())).status,
    ).toBe("success");
    expect(db.remove).toHaveBeenCalledOnce();
  });
});
