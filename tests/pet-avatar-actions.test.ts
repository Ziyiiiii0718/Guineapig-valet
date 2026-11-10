import { beforeEach, expect, it, vi } from "vitest";
const petId = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const path = `${owner}/${petId}/30000000-0000-4000-8000-000000000001.jpg`;
const input = {
  petId,
  expectedRevision: 0,
  size: 2 * 1024 * 1024,
  mimeType: "image/jpeg",
};
beforeEach(() => vi.resetModules());
async function setup() {
  const state = {
    user: owner as string | null,
    owned: true,
    size: input.size,
    missing: false,
    failure: false,
    path: null as string | null,
    revision: 0,
  };
  const remove = vi.fn();
  const signed = vi.fn(async () => ({ data: { token: "token" }, error: null }));
  const info = vi.fn(async () => ({
    data: state.missing
      ? null
      : { size: state.size, contentType: "image/jpeg" },
    error: null,
  }));
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data:
        state.owned && state.user === owner
          ? { id: petId, user_id: owner, avatar_revision: state.revision }
          : null,
      error: null,
    }),
  };
  const rpc = vi.fn(
    (
      _name: string,
      args: { target_avatar_path: string | null; expected_revision: number },
    ) => ({
      returns() {
        return this;
      },
      single: async () => {
        if (state.failure) return { error: {}, data: null };
        if (!state.owned || state.user !== owner)
          return { data: { outcome: "unavailable" }, error: null };
        if (args.target_avatar_path === state.path)
          return {
            data: { outcome: "saved", revision: state.revision },
            error: null,
          };
        if (args.expected_revision !== state.revision)
          return {
            data: { outcome: "conflict", revision: state.revision },
            error: null,
          };
        state.path = args.target_avatar_path;
        state.revision++;
        return {
          data: { outcome: "saved", revision: state.revision },
          error: null,
        };
      },
    }),
  );
  vi.doMock("@/lib/env", () => ({
    getPublicEnvStatus: () => ({ isConfigured: true }),
  }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      auth: {
        getUser: async () => ({
          data: { user: state.user ? { id: state.user } : null },
        }),
      },
      from: () => query,
      rpc,
      storage: {
        from: () => ({ createSignedUploadUrl: signed, info, remove }),
      },
    }),
  }));
  const actions = await import("@/app/actions/pets");
  const finalize = () =>
    actions.finalizePetAvatarUploadAction({ ...input, path });
  const clear = (revision: number) => {
    const form = new FormData();
    form.set("petId", petId);
    form.set("revision", String(revision));
    return actions.removePetAvatarAction({ status: "idle" }, form);
  };
  return { state, remove, signed, info, rpc, actions, finalize, clear };
}
it("prepares and finalizes a 2 MB upload without sending image bytes to an action", async () => {
  const t = await setup();
  expect((await t.actions.initializePetAvatarUploadAction(input)).status).toBe(
    "success",
  );
  expect(t.signed).toHaveBeenCalledWith(
    expect.stringContaining(`${owner}/${petId}/`),
    { upsert: false },
  );
  expect((await t.finalize()).status).toBe("success");
  expect(t.state.path).toBe(path);
  expect(t.remove).not.toHaveBeenCalled();
});
it.each([
  { size: 5 * 1024 * 1024 + 1 },
  { mimeType: "image/gif" },
  { size: 0 },
  { size: NaN },
])("rejects invalid metadata %j", async (change) => {
  const t = await setup();
  expect(
    (await t.actions.initializePetAvatarUploadAction({ ...input, ...change }))
      .status,
  ).toBe("error");
  expect(t.signed).not.toHaveBeenCalled();
});
it("accepts exactly 5 MB", async () => {
  const t = await setup();
  expect(
    (
      await t.actions.initializePetAvatarUploadAction({
        ...input,
        size: 5 * 1024 * 1024,
      })
    ).status,
  ).toBe("success");
});
it("retains the previous avatar on interrupted upload and database failure", async () => {
  const t = await setup();
  t.state.path = "previous";
  t.state.missing = true;
  expect((await t.finalize()).status).toBe("error");
  expect(t.rpc).not.toHaveBeenCalled();
  t.state.missing = false;
  t.state.failure = true;
  expect((await t.finalize()).status).toBe("error");
  expect(t.state.path).toBe("previous");
  expect(t.remove).not.toHaveBeenCalled();
});
it("rejects incorrect actual Storage size", async () => {
  const t = await setup();
  t.state.size++;
  expect((await t.finalize()).status).toBe("error");
  expect(t.rpc).not.toHaveBeenCalled();
});
it("retries a successful replacement and concurrent duplicate finalization safely", async () => {
  const t = await setup();
  t.state.path = "previous";
  expect(
    (await Promise.all([t.finalize(), t.finalize()])).map((r) => r.status),
  ).toEqual(["success", "success"]);
  expect((await t.finalize()).status).toBe("success");
  expect(t.state.revision).toBe(1);
  expect(t.remove).not.toHaveBeenCalled();
});
it("removes idempotently and rejects stale upload resurrection", async () => {
  const t = await setup();
  await t.finalize();
  expect((await t.clear(1)).status).toBe("success");
  expect((await t.clear(1)).status).toBe("success");
  expect((await t.finalize()).status).toBe("error");
  expect(t.state.path).toBeNull();
  expect(t.remove).not.toHaveBeenCalled();
});
it.each([null, "another-user"])(
  "blocks unauthorized operations for %s",
  async (user) => {
    const t = await setup();
    t.state.user = user;
    expect(
      (await t.actions.initializePetAvatarUploadAction(input)).status,
    ).toBe("error");
    expect((await t.finalize()).status).toBe("error");
    expect((await t.clear(0)).status).toBe("error");
    expect(t.state.path).toBeNull();
    expect(t.signed).not.toHaveBeenCalled();
    expect(t.remove).not.toHaveBeenCalled();
  },
);
it("rejects a different pet's or owner's Storage path", async () => {
  const t = await setup();
  expect(
    (
      await t.actions.finalizePetAvatarUploadAction({
        ...input,
        path: `other/${petId}/avatar.jpg`,
      })
    ).status,
  ).toBe("error");
  expect(t.info).not.toHaveBeenCalled();
});
