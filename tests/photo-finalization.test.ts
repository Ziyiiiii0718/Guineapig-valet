import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoUploadFinalizeInput } from "@/app/actions/photos";

const input: PhotoUploadFinalizeInput = {
  clientId: "client-1",
  path: "user-1/2026/07/photo-id.jpg",
  originalFileName: "photo.jpg",
  mimeType: "image/jpeg",
  size: 2048,
  width: 800,
  height: 600,
  takenAt: null,
};

// In-memory database boundary: atomic unique-key insert, owner-filtered reads,
// and controllable transport failures. No real Supabase connections.
async function setup() {
  const rows = new Map<string, Record<string, unknown>>();
  const state = {
    authenticated: true,
    insertFails: false,
    loseInsertResponse: false,
    readFails: false,
    readThrows: false,
    beforeInsert: async () => {},
  };
  const remove = vi.fn();
  const read = vi.fn(async (filters: Record<string, string>) => {
    if (state.readThrows) throw new Error("Network unavailable");
    if (state.readFails) return { data: null, error: { code: "unavailable" } };
    const row = rows.get(`${filters.user_id}:${filters.storage_path}`);
    return { data: row ? { id: row.id } : null, error: null };
  });
  const insert = vi.fn((row: Record<string, unknown>) => ({
    select: () => ({
      single: async () => {
        await state.beforeInsert();
        if (state.insertFails) return { data: null, error: { code: "failed" } };
        const key = `${row.user_id}:${row.storage_path}`;
        if (rows.has(key)) return { data: null, error: { code: "23505" } };
        const saved = { ...row, id: "saved-photo" };
        rows.set(key, saved);
        if (state.loseInsertResponse)
          throw new Error("Response lost after commit");
        return { data: { id: saved.id }, error: null };
      },
    }),
  }));
  const from = vi.fn(() => ({
    insert,
    select: () => {
      const filters: Record<string, string> = {};
      const query = {
        eq: (column: string, value: string) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: () => read(filters),
      };
      return query;
    },
  }));
  vi.doMock("@/lib/env", () => ({
    getPublicEnvStatus: () => ({ isConfigured: true }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      auth: {
        getUser: async () => ({
          data: { user: state.authenticated ? { id: "user-1" } : null },
        }),
      },
      from,
      storage: { from: () => ({ remove }) },
    }),
  }));
  const { finalizePhotoUploadAction: finalize } =
    await import("@/app/actions/photos");
  return { finalize, rows, state, remove, insert, read, from };
}

describe("idempotent photo finalization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  });

  it("saves a normal upload with the authenticated owner", async () => {
    const { finalize, rows, remove, insert } = await setup();
    expect(await finalize(input)).toMatchObject({
      status: "uploaded",
      photoId: "saved-photo",
    });
    expect(rows.size).toBe(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        storage_path: input.path,
        ai_status: "uploaded",
      }),
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns the existing photo on repetition without overwriting metadata or AI state", async () => {
    const { finalize, rows, read, remove } = await setup();
    const first = await finalize(input);
    const saved = rows.get(`user-1:${input.path}`)!;
    saved.ai_status = "specific_pet";
    saved.display_name = "My piggie";
    const snapshot = { ...saved };
    expect(
      await finalize({
        ...input,
        clientId: "retry",
        originalFileName: "changed.jpg",
      }),
    ).toEqual({ ...first, clientId: "retry" });
    expect([...rows.values()]).toEqual([snapshot]);
    expect(read).toHaveBeenCalledWith({
      user_id: "user-1",
      storage_path: input.path,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("recovers a committed insert with a lost database response", async () => {
    const { finalize, state, remove } = await setup();
    state.loseInsertResponse = true;
    expect(await finalize(input)).toMatchObject({
      status: "uploaded",
      photoId: "saved-photo",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("safely retries after both the insert response and reconciliation are unavailable", async () => {
    const { finalize, state, rows, remove } = await setup();
    state.loseInsertResponse = true;
    state.readFails = true;
    expect((await finalize(input)).status).toBe("failed");
    state.readFails = false;
    expect((await finalize(input)).photoId).toBe("saved-photo");
    expect(rows.size).toBe(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns the same photo when the successful action response is lost and retried", async () => {
    const { finalize, rows, remove } = await setup();
    await finalize(input); // The caller never receives this successful result.
    expect((await finalize(input)).photoId).toBe("saved-photo");
    expect(rows.size).toBe(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("retains the object on failed insertion and allows a later retry", async () => {
    const { finalize, state, rows, remove } = await setup();
    state.insertFails = true;
    expect((await finalize(input)).status).toBe("failed");
    expect(rows.size).toBe(0);
    expect(remove).not.toHaveBeenCalled();
    state.insertFails = false;
    expect((await finalize(input)).status).toBe("uploaded");
  });

  it("arbitrates concurrent duplicates through the unique key", async () => {
    const { finalize, state, rows, remove, insert } = await setup();
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrivals = 0;
    state.beforeInsert = async () => {
      if (++arrivals === 2) release();
      await bothArrived;
    };
    const results = await Promise.all([
      finalize(input),
      finalize({ ...input, clientId: "duplicate" }),
    ]);
    expect(results.map((result) => [result.status, result.photoId])).toEqual([
      ["uploaded", "saved-photo"],
      ["uploaded", "saved-photo"],
    ]);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("never cleans up an already referenced object on invalid metadata or read failure", async () => {
    const { finalize, state, rows, remove } = await setup();
    await finalize(input);
    expect((await finalize({ ...input, size: 0 })).status).toBe("failed");
    state.readThrows = true;
    expect((await finalize(input)).status).toBe("failed");
    expect(rows.size).toBe(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and cross-owner finalization without touching data", async () => {
    const { finalize, state, from, remove } = await setup();
    state.authenticated = false;
    expect((await finalize(input)).status).toBe("failed");
    state.authenticated = true;
    expect(
      (await finalize({ ...input, path: "user-2/2026/07/photo-id.jpg" }))
        .status,
    ).toBe("failed");
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
