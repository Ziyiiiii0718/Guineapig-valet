import { beforeEach, expect, it, vi } from "vitest";
import { parseReviewCursor, reviewPageHref } from "@/lib/ai/review-pagination";
import type { PhotoPredictionRow } from "@/lib/ai/predictions";
vi.mock("server-only", () => ({}));
const signed = vi.hoisted(() => vi.fn(async () => "signed"));
vi.mock("@/lib/photos/queries", () => ({ createUserPhotoSignedUrl: signed }));
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function prediction(n: number): PhotoPredictionRow {
  return {
    id: id(n),
    photo_id: id(n),
    user_id: "owner",
    created_at: "2026-01-01T00:00:00.123456+00:00",
    updated_at: "2026-01-01T00:00:00Z",
    processing_status: "ready_for_review",
    review_status: "pending_review",
    candidate_pet_ids: [],
    candidate_scores: [],
    candidate_reference_counts: [],
    suggested_pet_ids: [],
    suggested_unknown: true,
    confirmed_pet_ids: [],
    confirmed_unknown: false,
    classification_completed_at: null,
    classification_started_at: null,
    classification_version: null,
    configuration_version: null,
    embedding_dimension: null,
    embedding_model: null,
    embedding_version: null,
    error_category: null,
  };
}
beforeEach(() => {
  vi.resetModules();
  signed.mockClear();
});
async function setup() {
  const predictions = Array.from({ length: 65 }, (_, i) => prediction(i + 1));
  const photos = predictions.map((p) => ({
    id: p.photo_id,
    user_id: p.user_id,
    storage_path: `owner/${p.id}`,
  }));
  const state = { fail: "" };
  const calls: {
    table: string;
    filters: [string, unknown][];
    limit: number;
    order: string[];
  }[] = [];
  const client = {
    from(table: string) {
      const call = {
        table,
        filters: [] as [string, unknown][],
        limit: Infinity,
        order: [] as string[],
      };
      calls.push(call);
      let single = false,
        ascending = false,
        cursor = "";
      const builder = {
        select() {
          return builder;
        },
        eq(key: string, value: unknown) {
          call.filters.push([key, value]);
          return builder;
        },
        in(key: string, value: unknown[]) {
          call.filters.push([key, value]);
          return builder;
        },
        or(value: string) {
          cursor = value;
          return builder;
        },
        order(key: string, options: { ascending: boolean }) {
          call.order.push(key);
          ascending = options.ascending;
          return builder;
        },
        limit(value: number) {
          call.limit = value;
          return builder;
        },
        maybeSingle() {
          single = true;
          return builder;
        },
        then(resolve: (result: unknown) => unknown) {
          const source =
            table === "photo_pet_predictions"
              ? predictions
              : table === "photos"
                ? photos
                : [];
          let rows = source.filter((row) =>
            call.filters.every(([key, value]) => {
              const actual = (row as unknown as Record<string, unknown>)[key];
              return Array.isArray(value)
                ? value.includes(actual)
                : value === actual;
            }),
          );
          if (cursor) {
            const match = cursor.match(
              /^created_at\.(lt|gt)\.(.*),and\(created_at.eq\.(.*),id\.(lt|gt)\.(.*)\)$/,
            )!;
            expect(match).not.toBeNull();
            expect(match[2]).toBe(match[3]);
            expect(match[1]).toBe(match[4]);
            rows = rows.filter((row) => {
              const p = row as PhotoPredictionRow;
              const compare =
                p.created_at.localeCompare(match[2]) ||
                p.id.localeCompare(match[5]);
              return match[1] === "lt" ? compare < 0 : compare > 0;
            });
          }
          rows.sort((a, b) => {
            const pa = a as PhotoPredictionRow,
              pb = b as PhotoPredictionRow;
            const compare =
              (pa.created_at ?? "").localeCompare(pb.created_at ?? "") ||
              pa.id.localeCompare(pb.id);
            return ascending ? compare : -compare;
          });
          const data = rows.slice(0, call.limit);
          return Promise.resolve(
            resolve({
              data:
                state.fail === table ? null : single ? (data[0] ?? null) : data,
              error: state.fail === table ? { message: "failure" } : null,
            }),
          );
        },
      };
      return builder;
    },
  };
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => client,
  }));
  return {
    ...(await import("@/lib/ai/prediction-queries")),
    predictions,
    photos,
    state,
    calls,
  };
}
it("paginates 65 tied timestamps across first, middle and last pages and back", async () => {
  const t = await setup();
  const first = await t.listReviewQueue("owner", "all");
  const middle = await t.listReviewQueue("owner", "all", first.nextCursor);
  const last = await t.listReviewQueue("owner", "all", middle.nextCursor);
  expect([first.items.length, middle.items.length, last.items.length]).toEqual([
    24, 24, 17,
  ]);
  expect(first.previousCursor).toBeNull();
  expect(last.nextCursor).toBeNull();
  const ids = [...first.items, ...middle.items, ...last.items].map(
    (i) => i.photo.id,
  );
  expect(new Set(ids).size).toBe(65);
  expect(ids[0]).toBe(id(65));
  expect(ids.at(-1)).toBe(id(1));
  const back = await t.listReviewQueue("owner", "all", last.previousCursor);
  expect(back.items.map((i) => i.photo.id)).toEqual(
    middle.items.map((i) => i.photo.id),
  );
  expect(
    t.calls
      .filter((c) => c.table === "photo_pet_predictions")
      .every(
        (c) =>
          c.limit === 25 &&
          c.order.join() === "created_at,id" &&
          c.filters.some(([k, v]) => k === "user_id" && v === "owner"),
      ),
  ).toBe(true);
});
it("does not shift pages when new records arrive or timestamps/statuses update", async () => {
  const t = await setup();
  const first = await t.listReviewQueue("owner", "all");
  t.predictions.push({ ...prediction(66), created_at: "2026-02-01T00:00:00Z" });
  t.photos.push({ id: id(66), user_id: "owner", storage_path: "owner/new" });
  t.predictions[64].updated_at = "2026-03-01T00:00:00Z";
  t.predictions[64].review_status = "corrected";
  const second = await t.listReviewQueue("owner", "all", first.nextCursor);
  expect(second.items[0].photo.id).toBe(id(41));
  expect(second.items).toHaveLength(24);
  expect(
    second.items.some((i) =>
      first.items.some((f) => f.photo.id === i.photo.id),
    ),
  ).toBe(false);
});
it("finds an older photo directly regardless of filter, and handles no prediction", async () => {
  const t = await setup();
  t.predictions[0].review_status = "corrected";
  t.predictions[0].processing_status = "failed";
  const result = await t.getReviewForPhoto(id(1), "owner");
  expect(result.photo?.id).toBe(id(1));
  expect(result.prediction?.review_status).toBe("corrected");
  t.predictions.shift();
  expect((await t.getReviewForPhoto(id(1), "owner")).prediction).toBeNull();
  expect((await t.getReviewForPhoto(id(1), "owner")).photo?.id).toBe(id(1));
});
it("isolates unauthorized photos, predictions and signed URLs", async () => {
  const t = await setup();
  expect((await t.getReviewForPhoto(id(1), "other")).photo).toBeNull();
  expect((await t.listReviewQueue("other", "all")).items).toEqual([]);
  expect(signed).not.toHaveBeenCalled();
  expect((await t.getReviewForPhoto("invalid", "owner")).photo).toBeNull();
});
it("includes manual labels and processing states without conflating AI and confirmed labels", async () => {
  const t = await setup();
  t.predictions[64].review_status = "corrected";
  t.predictions[64].processing_status = "failed";
  t.predictions[64].confirmed_unknown = true;
  t.predictions[64].suggested_unknown = false;
  t.predictions[63].review_status = "confirmed";
  t.predictions[62].processing_status = "pending";
  t.predictions[61].review_status = "skipped";
  for (const filter of ["corrected", "confirmed", "failed"] as const)
    expect((await t.listReviewQueue("owner", filter)).items).toHaveLength(1);
  const manual = (await t.listReviewQueue("owner", "corrected")).items[0]
    .prediction;
  expect(manual.confirmed_unknown).toBe(true);
  expect(manual.suggested_unknown).toBe(false);
  const pending = await t.listReviewQueue("owner", "needs-review");
  expect(
    pending.items.some((i) => i.prediction.processing_status === "pending"),
  ).toBe(true);
  expect(
    pending.items.every((i) => i.prediction.review_status === "pending_review"),
  ).toBe(true);
});
it("reports query failures rather than an empty success", async () => {
  const t = await setup();
  t.state.fail = "photo_pet_predictions";
  expect((await t.listReviewQueue("owner", "all")).error).toBeTruthy();
  expect((await t.getReviewForPhoto(id(1), "owner")).error).toBeTruthy();
});
it("validates untrusted cursors and preserves timestamp precision", () => {
  const cursor = {
    created_at: "2026-01-01T00:00:00.123456+00:00",
    id: id(1),
    direction: "older" as const,
  };
  expect(
    parseReviewCursor(
      new URL(
        reviewPageHref("failed", cursor),
        "http://local",
      ).searchParams.get("cursor"),
    ),
  ).toEqual(cursor);
  for (const value of [
    "bad",
    "{}",
    JSON.stringify({ ...cursor, id: "x),user_id.neq.owner" }),
    JSON.stringify({ ...cursor, created_at: "invalid" }),
    [JSON.stringify(cursor)],
  ])
    expect(parseReviewCursor(value)).toBeNull();
});
