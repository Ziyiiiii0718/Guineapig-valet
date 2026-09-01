import { beforeEach, describe, expect, it, vi } from "vitest";
const PET = "550e8400-e29b-41d4-a716-446655440000";
const RECORD = "7c9ecf1f-8147-4965-a14a-b4bfab33d7e8";
function query(value: unknown) {
  const q = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => value),
    then: (resolve: (value: unknown) => void) => resolve(value),
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
      : {
          delete: remove,
          insert,
          select: vi.fn(() => query({ data: record, error: null })),
          update,
        },
  );
  return { from, insert, remove, update };
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
  return import("@/app/actions/health");
}
function form(withRecord = false) {
  const data = new FormData();
  data.set("petId", PET);
  data.set("recordType", "general");
  data.set("recordDate", "2026-08-25");
  data.set("title", "Routine check 🐹");
  data.set("notes", "Generated notes.");
  if (withRecord) data.set("recordId", RECORD);
  return data;
}
describe("health actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it("creates for an owned pet using the authenticated user", async () => {
    const db = mockDb();
    const { createHealthAction } = await load(db);
    expect((await createHealthAction({ status: "idle" }, form())).status).toBe(
      "success",
    );
    expect(db.insert).toHaveBeenCalledWith({
      notes: "Generated notes.",
      pet_id: PET,
      record_date: "2026-08-25",
      record_type: "general",
      title: "Routine check 🐹",
      user_id: "user-1",
    });
  });
  it("rejects cross-user or missing pets and expired sessions", async () => {
    const missing = mockDb(null);
    const missingActions = await load(missing);
    expect(
      (await missingActions.createHealthAction({ status: "idle" }, form()))
        .status,
    ).toBe("error");
    expect(missing.insert).not.toHaveBeenCalled();
    vi.resetModules();
    const expired = mockDb();
    const expiredActions = await load(expired, null);
    expect(
      (await expiredActions.createHealthAction({ status: "idle" }, form()))
        .status,
    ).toBe("error");
  });
  it("edits only existing owner-scoped records", async () => {
    const db = mockDb();
    const { updateHealthAction } = await load(db);
    expect(
      (await updateHealthAction({ status: "idle" }, form(true))).status,
    ).toBe("success");
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Routine check 🐹" }),
    );
  });
  it("rejects unauthorized record mutation", async () => {
    const db = mockDb(undefined, null);
    const { updateHealthAction } = await load(db);
    expect(
      (await updateHealthAction({ status: "idle" }, form(true))).status,
    ).toBe("error");
    expect(db.update).not.toHaveBeenCalled();
  });
  it("deletes only one owner- and pet-scoped record", async () => {
    const db = mockDb();
    const { deleteHealthAction } = await load(db);
    expect(
      (await deleteHealthAction({ status: "idle" }, form(true))).status,
    ).toBe("success");
    expect(db.remove).toHaveBeenCalledOnce();
  });
});
