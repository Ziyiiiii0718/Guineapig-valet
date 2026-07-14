import type { PublicEnvStatus } from "@/lib/env";

export function ConfigNotice({ status }: { status: PublicEnvStatus }) {
  if (status.isConfigured) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-4"
      role="status"
    >
      <h2 className="text-sm font-semibold text-amber-950">
        Supabase configuration needed
      </h2>
      <p className="mt-1 text-sm text-amber-900">
        Missing: {status.missingKeys.join(", ")}. Authentication pages are
        wired, but real login and registration need local environment values
        from a Supabase project.
      </p>
    </section>
  );
}
