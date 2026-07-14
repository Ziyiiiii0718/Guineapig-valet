import { describe, expect, it } from "vitest";
import { getPublicEnvStatus, getSupabasePublicConfig } from "@/lib/env";

describe("environment validation", () => {
  it("reports missing public Supabase keys", () => {
    const status = getPublicEnvStatus({});

    expect(status.isConfigured).toBe(false);
    expect(status.missingKeys).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("accepts complete public Supabase configuration", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    };

    expect(getPublicEnvStatus(env).isConfigured).toBe(true);
    expect(getSupabasePublicConfig(env)).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon",
    });
  });

  it("throws a clear error before creating Supabase clients when keys are missing", () => {
    expect(() => getSupabasePublicConfig({})).toThrow(
      "Missing Supabase environment variables",
    );
  });
});
