export type PublicEnvStatus = {
  isConfigured: boolean;
  missingKeys: string[];
  usingLegacyAnonKey: boolean;
};

const supabaseUrlKey = "NEXT_PUBLIC_SUPABASE_URL";
const supabasePublishableKey = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const legacySupabaseAnonKey = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

type EnvSource = Record<string, string | undefined>;

export function getPublicEnvStatus(
  env: EnvSource = process.env,
): PublicEnvStatus {
  const missingKeys: string[] = [];
  const hasPublishableKey = Boolean(env[supabasePublishableKey]);
  const hasLegacyAnonKey = Boolean(env[legacySupabaseAnonKey]);

  if (!env[supabaseUrlKey]) {
    missingKeys.push(supabaseUrlKey);
  }

  if (!hasPublishableKey && !hasLegacyAnonKey) {
    missingKeys.push(`${supabasePublishableKey} or ${legacySupabaseAnonKey}`);
  }

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
    usingLegacyAnonKey: !hasPublishableKey && hasLegacyAnonKey,
  };
}

export function getSupabasePublicConfig(env: EnvSource = process.env) {
  const status = getPublicEnvStatus(env);

  if (!status.isConfigured) {
    throw new Error(
      `Missing Supabase environment variables: ${status.missingKeys.join(", ")}`,
    );
  }

  return {
    url: env[supabaseUrlKey] as string,
    publishableKey: (env[supabasePublishableKey] ??
      env[legacySupabaseAnonKey]) as string,
  };
}
