import { beforeEach, describe, expect, it, vi } from "vitest";

const photoId = "550e8400-e29b-41d4-a716-446655440000";
const owner = "user-1";
const path = `${owner}/2026/11/photo.jpg`;
const redirected = new Error("redirect");

async function setup() {
  const state = {
    userId: owner as string | null,
    livePhoto: true,
    objectExists: true,
    job: null as null | {
      photo_id: string;
      user_id: string;
      storage_path: string;
      storage_deleted_at: string | null;
    },
    databaseFails: false,
    lostDatabaseResponse: false,
    storageFails: false,
    storageThrows: false,
    acknowledgementFails: false,
    lostAcknowledgementResponse: false,
    storageNoOp: false,
    recreateBeforeAcknowledgement: false,
    acknowledgementResult: "acknowledged" as string | null,
  };
  const events: string[] = [];
  const acknowledge = vi.fn(async () => {
    events.push("acknowledge");
    if (state.acknowledgementFails)
      return { data: null, error: { code: "failed" } };
    if (state.recreateBeforeAcknowledgement) state.objectExists = true;
    if (state.objectExists) return { data: "storage_present", error: null };
    if (state.acknowledgementResult !== "acknowledged")
      return { data: state.acknowledgementResult, error: null };
    state.job!.storage_deleted_at ??= new Date().toISOString();
    if (state.lostAcknowledgementResponse) throw new Error("response lost");
    return { data: "acknowledged", error: null };
  });
  const rpc = vi.fn((name: string, args: { target_photo_id: string }) => {
    expect(args).toEqual({ target_photo_id: photoId });
    if (name === "acknowledge_photo_deletion") return acknowledge();
    expect(name).toBe("begin_photo_deletion");
    return {
      returns() {
        return this;
      },
      maybeSingle: async () => {
        events.push("database");
        if (state.databaseFails)
          return { data: null, error: { code: "failed" } };
        if (state.userId !== owner) return { data: null, error: null };
        if (state.livePhoto) {
          state.livePhoto = false;
          state.job = {
            photo_id: photoId,
            user_id: owner,
            storage_path: path,
            storage_deleted_at: null,
          };
        }
        if (state.lostDatabaseResponse) throw new Error("response lost");
        return { data: state.job ? { ...state.job } : null, error: null };
      },
    };
  });
  const remove = vi.fn(async (paths: string[]) => {
    events.push("storage");
    expect(state.livePhoto).toBe(false);
    expect(paths).toEqual([path]);
    if (state.storageThrows) throw new Error("Storage unavailable");
    if (state.storageFails)
      return { error: { message: "Storage unavailable" } };
    if (!state.storageNoOp) state.objectExists = false;
    return { error: null };
  });
  const from = vi.fn(() => {
    throw new Error("Direct table writes forbidden");
  });
  const redirect = vi.fn(() => {
    throw redirected;
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
      storage: { from: () => ({ remove }) },
    }),
  }));
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("next/cache", () => ({ revalidatePath }));
  const { deletePhotoAction } = await import("@/app/actions/photos");
  const run = (id = photoId) => {
    const form = new FormData();
    form.set("photoId", id);
    form.set("storagePath", "attacker-supplied-path");
    return deletePhotoAction({ status: "idle" }, form);
  };
  return {
    state,
    rpc,
    remove,
    acknowledge,
    from,
    run,
    events,
    revalidatePath,
    redirect,
  };
}

describe("recoverable photo deletion action", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("commits metadata deletion before Storage and acknowledges completion", async () => {
    const { run, state, events, rpc, redirect, revalidatePath } = await setup();
    await expect(run()).rejects.toBe(redirected);
    expect(events).toEqual(["database", "storage", "acknowledge"]);
    expect(rpc).toHaveBeenCalledWith("begin_photo_deletion", {
      target_photo_id: photoId,
    });
    expect(state.livePhoto).toBe(false);
    expect(state.objectExists).toBe(false);
    expect(state.job?.storage_deleted_at).toEqual(expect.any(String));
    expect(redirect).toHaveBeenCalledWith("/photos?message=deleted");
    expect(revalidatePath).toHaveBeenCalledWith("/albums/[id]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/pets/[id]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/review");
  });

  it("preserves the object and live record if the database transaction fails", async () => {
    const { run, state, remove } = await setup();
    state.databaseFails = true;
    expect((await run()).status).toBe("error");
    expect(state.livePhoto).toBe(true);
    expect(state.objectExists).toBe(true);
    expect(state.job).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(["storageFails", "storageThrows"] as const)(
    "retains a durable retry when %s",
    async (failure) => {
      const { run, state, acknowledge } = await setup();
      state[failure] = true;
      expect(await run()).toMatchObject({
        status: "error",
        message: expect.stringContaining("cleanup is still pending"),
      });
      expect(state.livePhoto).toBe(false);
      expect(state.objectExists).toBe(true);
      expect(state.job?.storage_deleted_at).toBeNull();
      expect(acknowledge).not.toHaveBeenCalled();
      state[failure] = false;
      await expect(run()).rejects.toBe(redirected);
      expect(state.objectExists).toBe(false);
    },
  );

  it("rechecks Storage on repeated successful deletion", async () => {
    const { run, remove } = await setup();
    await expect(run()).rejects.toBe(redirected);
    await expect(run()).rejects.toBe(redirected);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("safely handles simultaneous requests observing the same pending job", async () => {
    const { run, state } = await setup();
    const results = await Promise.allSettled([run(), run()]);
    expect(results).toEqual([
      { status: "rejected", reason: redirected },
      { status: "rejected", reason: redirected },
    ]);
    expect(state.livePhoto).toBe(false);
    expect(state.objectExists).toBe(false);
    expect(state.job?.storage_deleted_at).not.toBeNull();
  });

  it("recovers a committed database transaction whose response was lost", async () => {
    const { run, state, remove } = await setup();
    state.lostDatabaseResponse = true;
    expect((await run()).status).toBe("error");
    expect(state.job).not.toBeNull();
    expect(remove).not.toHaveBeenCalled();
    state.lostDatabaseResponse = false;
    await expect(run()).rejects.toBe(redirected);
  });

  it("retries removal of an absent object after acknowledgement failure", async () => {
    const { run, state, remove } = await setup();
    state.acknowledgementFails = true;
    expect((await run()).status).toBe("error");
    expect(state.objectExists).toBe(false);
    expect(state.job?.storage_deleted_at).toBeNull();
    state.acknowledgementFails = false;
    await expect(run()).rejects.toBe(redirected);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("removes a delayed signed-upload replay after prior completion", async () => {
    const { run, state, remove, from } = await setup();
    await expect(run()).rejects.toBe(redirected);
    state.objectExists = true;
    await expect(run()).rejects.toBe(redirected);
    expect(state.objectExists).toBe(false);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["storageNoOp", "recreateBeforeAcknowledgement"] as const)(
    "keeps cleanup pending when %s leaves an object present",
    async (scenario) => {
      const { run, state } = await setup();
      await expect(run()).rejects.toBe(redirected);
      state.objectExists = true;
      state[scenario] = true;
      expect((await run()).message).toContain("cleanup is still pending");
      expect(state.job?.storage_deleted_at).not.toBeNull();
      state[scenario] = false;
      await expect(run()).rejects.toBe(redirected);
      expect(state.objectExists).toBe(false);
    },
  );

  it.each(["storage_present", "unavailable", "unexpected", null])(
    "fails closed for acknowledgment result %s",
    async (result) => {
      const { run, state, redirect } = await setup();
      state.acknowledgementResult = result;
      expect((await run()).message).toContain("cleanup is still pending");
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("rechecks after a committed acknowledgment response is lost", async () => {
    const { run, state, remove, acknowledge } = await setup();
    state.lostAcknowledgementResponse = true;
    expect((await run()).status).toBe("error");
    expect(state.job?.storage_deleted_at).not.toBeNull();
    state.lostAcknowledgementResponse = false;
    await expect(run()).rejects.toBe(redirected);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(acknowledge).toHaveBeenCalledTimes(2);
  });

  it("allows concurrent cleanup to recover after one acknowledgment fails", async () => {
    const { run, state, acknowledge, remove } = await setup();
    acknowledge.mockRejectedValueOnce(new Error("lost response"));
    const results = await Promise.allSettled([run(), run()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      { status: "rejected", reason: redirected },
    ]);
    expect(state.livePhoto).toBe(false);
    expect(state.objectExists).toBe(false);
    await expect(run()).rejects.toBe(redirected);
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("rejects unauthenticated and malformed requests before database access", async () => {
    const { run, state, rpc, remove } = await setup();
    expect((await run("invalid")).status).toBe("error");
    state.userId = null;
    expect((await run()).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not disclose or delete another owner's photo", async () => {
    const { run, state, remove } = await setup();
    state.userId = "other-user";
    expect((await run()).status).toBe("error");
    expect(state.livePhoto).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses cleanup when the durable record has an unsafe path", async () => {
    const { run, state, remove } = await setup();
    state.livePhoto = false;
    state.job = {
      photo_id: photoId,
      user_id: owner,
      storage_path: "other-user/private.jpg",
      storage_deleted_at: null,
    };
    expect((await run()).status).toBe("error");
    expect(remove).not.toHaveBeenCalled();
  });
});
