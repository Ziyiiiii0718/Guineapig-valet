import { describe, expect, it } from "vitest";
import { authFormSchema } from "@/lib/validation/auth";

describe("auth form validation", () => {
  it("accepts a valid email and password", () => {
    const parsed = authFormSchema.safeParse({
      email: "owner@example.com",
      password: "correct-password",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid email addresses", () => {
    const parsed = authFormSchema.safeParse({
      email: "not-an-email",
      password: "correct-password",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects short passwords before calling Supabase", () => {
    const parsed = authFormSchema.safeParse({
      email: "owner@example.com",
      password: "short",
    });

    expect(parsed.success).toBe(false);
  });
});
