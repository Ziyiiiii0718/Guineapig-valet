import { describe, expect, it } from "vitest";
import {
  filterHealthRecords,
  formatHealthDate,
  healthFormSchema,
  healthPageCount,
  latestHealthByPet,
  healthTitleSchema,
  healthTypeSchema,
  parseHealthFilter,
  parseHealthPage,
  sortHealthNewest,
  type HealthRecord,
} from "@/lib/health/core";

function record(
  id: string,
  type: HealthRecord["record_type"],
  date: string,
  created = `${date}T12:00:00Z`,
): HealthRecord {
  return {
    created_at: created,
    id,
    notes: null,
    pet_id: "pet-generated",
    record_date: date,
    record_type: type,
    title: `Record ${id}`,
    updated_at: created,
    user_id: "user-generated",
  };
}
describe("health validation", () => {
  const valid = {
    notes: "Observed at home.",
    recordDate: "2020-01-02",
    recordType: "general",
    title: "Routine check",
  };
  it("accepts a valid historical health record", () =>
    expect(healthFormSchema.parse(valid)).toMatchObject(valid));
  it.each(["", "   "])("rejects a blank title", (title) =>
    expect(healthTitleSchema.safeParse(title).success).toBe(false),
  );
  it("enforces title and notes limits", () => {
    expect(healthTitleSchema.safeParse("a".repeat(121)).success).toBe(false);
    expect(
      healthFormSchema.safeParse({ ...valid, notes: "n".repeat(4001) }).success,
    ).toBe(false);
  });
  it.each(["健康记录", "Routine 🐹 #2!"])(
    "supports Unicode title %s",
    (title) => expect(healthTitleSchema.parse(title)).toBe(title),
  );
  it("accepts only controlled categories", () => {
    expect(healthTypeSchema.safeParse("medication").success).toBe(true);
    expect(healthTypeSchema.safeParse("diagnosis").success).toBe(false);
  });
  it("validates and timezone-safely formats calendar dates", () => {
    expect(
      healthFormSchema.safeParse({ ...valid, recordDate: "2024-02-29" })
        .success,
    ).toBe(true);
    expect(
      healthFormSchema.safeParse({ ...valid, recordDate: "2026-02-29" })
        .success,
    ).toBe(false);
    expect(formatHealthDate("2026-08-25")).toBe("Aug 25, 2026");
  });
});
describe("health ordering, filtering, and pagination", () => {
  const rows = [
    record("a", "general", "2026-08-20"),
    record("b", "symptom", "2026-08-25", "2026-08-25T10:00:00Z"),
    record("c", "medication", "2026-08-25", "2026-08-25T11:00:00Z"),
  ];
  it("sorts newest-first with deterministic same-day ordering", () =>
    expect(sortHealthNewest(rows).map((row) => row.id)).toEqual([
      "c",
      "b",
      "a",
    ]));
  it("filters categories and falls invalid filters back to All", () => {
    expect(filterHealthRecords(rows, "symptom").map((row) => row.id)).toEqual([
      "b",
    ]);
    expect(parseHealthFilter("diagnosis")).toBeNull();
    expect(parseHealthFilter("general")).toBe("general");
  });
  it("handles empty data and pagination boundaries", () => {
    expect(filterHealthRecords([], null)).toEqual([]);
    expect(healthPageCount(0)).toBe(1);
    expect(healthPageCount(26)).toBe(2);
    expect(parseHealthPage("0")).toBe(1);
    expect(parseHealthPage("2")).toBe(2);
  });
  it("builds the Dashboard's latest record summary per pet", () => {
    const withPets = rows.map((row, index) => ({
      ...row,
      pet_id: index === 0 ? "pet-b" : "pet-a",
    }));
    const latest = latestHealthByPet(withPets, ["pet-a", "pet-b", "pet-c"]);
    expect(latest.get("pet-a")?.id).toBe("c");
    expect(latest.get("pet-b")?.id).toBe("a");
    expect(latest.get("pet-c")).toBeNull();
  });
});
