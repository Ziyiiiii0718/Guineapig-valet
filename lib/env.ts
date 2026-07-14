export type PublicEnvStatus = {
  isConfigured: boolean;
  missingKeys: string[];
};

const publicSupabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

type EnvSource = Record<string, string | undefined>;

export function getPublicEnvStatus(
  env: EnvSource = process.env,
): PublicEnvStatus {
  const missingKeys = publicSupabaseKeys.filter((key) => !env[key]);

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
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
    url: env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}
