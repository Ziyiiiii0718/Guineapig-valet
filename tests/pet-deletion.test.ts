import { beforeEach, describe, expect, it, vi } from "vitest";

const petId = "20000000-0000-4000-8000-000000000001";
const avatarPath = `user-1/${petId}/avatar.jpg`;
const redirectSignal = new Error("redirect");

async function setup() {
  const state = {
    userId: "user-1" as string | null,
    exists: true,
    failDatabase: false,
    loseResponse: false,
    failStorage: false,
    throwStorage: false,
    avatarPath: avatarPath as string | null,
  };
  const events: string[] = [];
  const rpc = vi.fn(
    (
      _name: string,
      args: { target_pet_id: string; confirmation_name: string },
    ) => ({
      returns() {
        return this;
      },
      single: async () => {
        events.push("database");
        if (state.failDatabase)
          return { data: null, error: { code: "failed" } };
        if (
          !state.exists ||
          state.userId !== "user-1" ||
          args.target_pet_id !== petId
        ) {
          return {
            data: { outcome: "absent", avatar_path: null },
            error: null,
          };
        }
        if (args.confirmation_name !== "Piggie") {
          return {
            data: { outcome: "confirmation_required", avatar_path: null },
            error: null,
          };
        }
        state.exists = false;
        if (state.loseResponse) throw new Error("Lost response after commit");
        return {
          data: { outcome: "deleted", avatar_path: state.avatarPath },
          error: null,
        };
      },
    }),
  );
  const remove = vi.fn(async () => {
    expect(state.exists).toBe(false);
    events.push("avatar");
    if (state.throwStorage) throw new Error("Storage unavailable");
    return {
      error: state.failStorage ? { message: "Storage unavailable" } : null,
    };
  });
  const storageFrom = vi.fn(() => ({ remove }));
  const from = vi.fn(() => {
    throw new Error("Action must not perform separate table writes");
  });
  const revalidatePath = vi.fn();
  vi.doMock("@/lib/env", () => ({
    getPublicEnvStatus: () => ({ isConfigured: true }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      auth: {
        getUser: async () => ({
          data: { user: state.userId ? { id: state.userId } : null },
        }),
      },
      rpc,
      from,
      storage: { from: storageFrom },
    }),
  }));
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("next/navigation", () => ({
    redirect: () => {
      throw redirectSignal;
    },
  }));
  const { deletePetAction } = await import("@/app/actions/pets");
  const run = (id = petId, name = "Piggie") => {
    const form = new FormData();
    form.set("petId", id);
    form.set("confirmName", name);
    form.set("userId", "untrusted-owner");
    form.set("avatarPath", "untrusted-path");
    return deletePetAction({ status: "idle" }, form);
  };
  return { state, rpc, from, remove, storageFrom, run, events, revalidatePath };
}

describe("transactional pet deletion action", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses one transaction and retains avatar bytes for safe cleanup", async () => {
    const { run, rpc, from, remove, storageFrom, events, revalidatePath } =
      await setup();
    await expect(run(petId, " Piggie ")).rejects.toBe(redirectSignal);
    expect(rpc).toHaveBeenCalledWith("delete_pet_transaction", {
      target_pet_id: petId,
      confirmation_name: "Piggie",
    });
    expect(events).toEqual(["database"]);
    expect(from).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalledWith("user-photos");
    expect(remove).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/photos/[id]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/review");
  });

  it("does not touch Storage or perform fallback writes when the transaction fails", async () => {
    const { run, state, from, remove } = await setup();
    state.failDatabase = true;
    expect((await run()).status).toBe("error");
    expect(state.exists).toBe(true);
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps exact name confirmation inside the transaction", async () => {
    const { run, state, remove } = await setup();
    expect(await run(petId, "wrong")).toMatchObject({
      status: "error",
      fieldErrors: { confirmName: expect.any(String) },
    });
    expect(state.exists).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs and unauthenticated requests before calling the RPC", async () => {
    const { run, state, rpc } = await setup();
    expect((await run("invalid")).status).toBe("error");
    state.userId = null;
    expect((await run()).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats another owner's ID as absent without modifying it or disclosing data", async () => {
    const { run, state, remove } = await setup();
    state.userId = "other-user";
    await expect(run()).rejects.toBe(redirectSignal);
    expect(state.exists).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("makes repeated deletion a no-op", async () => {
    const { run, remove } = await setup();
    await expect(run()).rejects.toBe(redirectSignal);
    await expect(run()).rejects.toBe(redirectSignal);
    expect(remove).not.toHaveBeenCalled();
  });

  it("handles duplicate concurrent requests without repeated avatar removal", async () => {
    const { run, remove } = await setup();
    expect(await Promise.allSettled([run(), run()])).toEqual([
      { status: "rejected", reason: redirectSignal },
      { status: "rejected", reason: redirectSignal },
    ]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("allows retry after a lost committed response without changing labels again", async () => {
    const { run, state, remove } = await setup();
    state.loseResponse = true;
    expect((await run()).status).toBe("error");
    expect(state.exists).toBe(false);
    state.loseResponse = false;
    await expect(run()).rejects.toBe(redirectSignal);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(["failStorage", "throwStorage"] as const)(
    "does not undo successful database deletion when %s",
    async (failure) => {
      const { run, state } = await setup();
      state[failure] = true;
      await expect(run()).rejects.toBe(redirectSignal);
      expect(state.exists).toBe(false);
    },
  );

  it.each([
    null,
    "other-user/pet/avatar.jpg",
    "user-1/other-pet/avatar.jpg",
    "user-1/2026/11/shared.jpg",
  ])("does not remove an unrelated avatar/photo path: %s", async (path) => {
    const { run, state, remove } = await setup();
    state.avatarPath = path;
    await expect(run()).rejects.toBe(redirectSignal);
    expect(remove).not.toHaveBeenCalled();
  });
});
