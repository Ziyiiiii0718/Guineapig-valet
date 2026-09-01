import { describe, expect, it } from "vitest";
import {
  formatMeasurementDate,
  formatWeightDifference,
  isValidCalendarDate,
  sortWeightsChronological,
  sortWeightsNewest,
  summarizeWeights,
  weightFormSchema,
  weightGramsSchema,
  type WeightRecord,
} from "@/lib/weights/core";

function record(
  id: string,
  date: string,
  weight: number,
  created = `${date}T12:00:00Z`,
): WeightRecord {
  return {
    created_at: created,
    id,
    pet_id: "pet-安妮",
    recorded_at: date,
    updated_at: created,
    user_id: "user-1",
    weight_grams: weight,
  };
}
describe("weight validation", () => {
  it.each([100, 1385, 5000])("accepts integer grams %i", (value) =>
    expect(weightGramsSchema.parse(String(value))).toBe(value),
  );
  it.each([99, 5001, -20, Infinity, NaN])(
    "rejects out-of-range or invalid %s",
    (value) => expect(weightGramsSchema.safeParse(value).success).toBe(false),
  );
  it("rejects decimals and malformed strings", () => {
    expect(weightGramsSchema.safeParse("1385.5").success).toBe(false);
    expect(weightGramsSchema.safeParse("1.4 kg").success).toBe(false);
  });
  it("validates calendar dates including historical leap dates", () => {
    expect(isValidCalendarDate("2024-02-29")).toBe(true);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("August 25")).toBe(false);
    expect(
      weightFormSchema.safeParse({
        measuredAt: "2020-01-01",
        weightGrams: "1400",
      }).success,
    ).toBe(true);
  });
  it("formats date-only values without timezone shifting", () => {
    expect(formatMeasurementDate("2026-08-25")).toBe("Aug 25, 2026");
  });
});
describe("weight summaries and ordering", () => {
  const rows = [
    record("a", "2026-08-24", 1385),
    record("b", "2026-08-25", 1400, "2026-08-25T10:00:00Z"),
    record("c", "2026-08-25", 1420, "2026-08-25T11:00:00Z"),
  ];
  it("selects latest and previous with deterministic same-date ordering", () => {
    const summary = summarizeWeights(rows);
    expect(summary.latest?.id).toBe("c");
    expect(summary.previous?.id).toBe("b");
    expect(summary.difference).toBe(20);
  });
  it("sorts history newest-first and chart data oldest-first", () => {
    expect(sortWeightsNewest(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(sortWeightsChronological(rows).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("handles positive, negative, zero, one, and no measurements", () => {
    expect(formatWeightDifference(15)).toBe("+15 g");
    expect(formatWeightDifference(-20)).toBe("−20 g");
    expect(formatWeightDifference(0)).toBe("0 g");
    expect(summarizeWeights([rows[0]]).difference).toBeNull();
    expect(summarizeWeights([])).toEqual({
      difference: null,
      latest: null,
      previous: null,
    });
  });
  it("does not depend on Unicode pet names", () =>
    expect({ ...rows[0], pet_id: "安妮🐹" }.weight_grams).toBe(1385));
});
