import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPublicEnvStatus, getSupabasePublicConfig } from "@/lib/env";

describe("environment validation", () => {
  it("reports missing public Supabase keys", () => {
    const status = getPublicEnvStatus({});

    expect(status.isConfigured).toBe(false);
    expect(status.missingKeys).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("accepts complete public Supabase configuration", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    };

    expect(getPublicEnvStatus(env).isConfigured).toBe(true);
    expect(getSupabasePublicConfig(env)).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "publishable",
    });
  });

  it("keeps a legacy anon-key fallback for existing local setups", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon",
    };

    expect(getPublicEnvStatus(env)).toEqual({
      isConfigured: true,
      missingKeys: [],
      usingLegacyAnonKey: true,
    });
    expect(getSupabasePublicConfig(env).publishableKey).toBe("legacy-anon");
  });

  it("throws a clear error before creating Supabase clients when keys are missing", () => {
    expect(() => getSupabasePublicConfig({})).toThrow(
      "Missing Supabase environment variables",
    );
  });

  it("keeps browser Supabase config on static NEXT_PUBLIC references", () => {
    const clientEnvSource = readFileSync("lib/env-client.ts", "utf8");
    const browserClientSource = readFileSync("lib/supabase/client.ts", "utf8");

    expect(clientEnvSource).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(clientEnvSource).toContain(
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
    expect(clientEnvSource).toContain(
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
    expect(clientEnvSource).not.toContain("process.env[");
    expect(browserClientSource).not.toContain('from "@/lib/env"');
    expect(browserClientSource).not.toContain("from '@/lib/env'");
  });
});
