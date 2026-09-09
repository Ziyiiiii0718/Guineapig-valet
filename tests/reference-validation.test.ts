import { describe, expect, it } from "vitest";
import {
  parseReferenceSelection,
  REFERENCE_ADD_BATCH_LIMIT,
} from "@/lib/references/validation";

const PET_ID = "550e8400-e29b-41d4-a716-446655440000";

function form(photoIds: string[], petId = PET_ID) {
  const value = new FormData();
  value.set("petId", petId);
  photoIds.forEach((id) => value.append("photoIds", id));
  return value;
}

describe("reference photo input validation", () => {
  it("accepts and de-duplicates valid IDs", () => {
    const photoId = "550e8400-e29b-41d4-a716-446655440001";
    expect(parseReferenceSelection(form([photoId, photoId]))).toEqual({
      error: null,
      value: { petId: PET_ID, photoIds: [photoId] },
    });
  });

  it("rejects missing, malformed, and oversized selections", () => {
    expect(parseReferenceSelection(form([])).error).toMatch(/at least one/i);
    expect(parseReferenceSelection(form(["not-a-photo"])).error).toMatch(
      /valid photos/i,
    );
    const tooMany = Array.from(
      { length: REFERENCE_ADD_BATCH_LIMIT + 1 },
      (_, index) =>
        `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`,
    );
    expect(parseReferenceSelection(form(tooMany)).error).toMatch(/no more/i);
    expect(
      parseReferenceSelection(form(tooMany.slice(0, 1), "bad")).error,
    ).toMatch(/pet profile/i);
  });
});
