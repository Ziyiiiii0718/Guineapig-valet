import { describe, expect, it } from "vitest";
import { calculatePetAge, formatPetAge } from "@/lib/pets/age";

describe("pet age calculation", () => {
  it("calculates completed years and months after the birthday day passes", () => {
    expect(calculatePetAge("2024-01-15", "2026-03-16")).toEqual({
      months: 2,
      years: 2,
    });
  });

  it("does not count the current month before the birthday day", () => {
    expect(calculatePetAge("2024-01-15", "2026-03-14")).toEqual({
      months: 1,
      years: 2,
    });
  });

  it("handles pets younger than one year", () => {
    expect(formatPetAge("2026-01-20", "2026-07-20")).toBe("6 months old");
  });

  it("handles pets younger than one month", () => {
    expect(formatPetAge("2026-07-05", "2026-07-20")).toBe(
      "Less than 1 month old",
    );
  });

  it("avoids timezone drift by using date-only UTC parts", () => {
    expect(calculatePetAge("2025-12-31", "2026-01-01")).toEqual({
      months: 0,
      years: 0,
    });
  });
});
