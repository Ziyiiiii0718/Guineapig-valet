import { describe, expect, it } from "vitest";
import { isOwnedByAuthenticatedUser } from "@/lib/pets/ownership";
import { petFormSchema } from "@/lib/validation/pets";

const validInput = {
  birthDate: "2025-04-12",
  dislikedFoods: "",
  favoriteFoods: "Romaine, cilantro",
  generalNotes: "",
  name: "Biscuit",
  personalityNotes: "Gentle and curious",
  sex: "female",
};

describe("pet profile validation", () => {
  it("accepts valid pet profile input", () => {
    const parsed = petFormSchema.safeParse(validInput);

    expect(parsed.success).toBe(true);
  });

  it("allows only schema-supported sex values", () => {
    expect(
      petFormSchema.safeParse({ ...validInput, sex: "male" }).success,
    ).toBe(true);
    expect(
      petFormSchema.safeParse({ ...validInput, sex: "unknown" }).success,
    ).toBe(true);
    expect(
      petFormSchema.safeParse({ ...validInput, sex: "nonbinary" }).success,
    ).toBe(false);
  });

  it("rejects future birth dates", () => {
    const parsed = petFormSchema.safeParse({
      ...validInput,
      birthDate: "2999-01-01",
    });

    expect(parsed.success).toBe(false);
  });

  it("normalizes optional empty fields to null", () => {
    const parsed = petFormSchema.safeParse({
      ...validInput,
      dislikedFoods: "  ",
      favoriteFoods: "",
      generalNotes: "",
      personalityNotes: "",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dislikedFoods).toBeNull();
      expect(parsed.data.favoriteFoods).toBeNull();
      expect(parsed.data.generalNotes).toBeNull();
      expect(parsed.data.personalityNotes).toBeNull();
    }
  });

  it("checks ownership with exact authenticated user IDs", () => {
    expect(isOwnedByAuthenticatedUser("user-a", "user-a")).toBe(true);
    expect(isOwnedByAuthenticatedUser("user-a", "user-b")).toBe(false);
    expect(isOwnedByAuthenticatedUser(null, "user-a")).toBe(false);
  });
});
