import type { PublicEnvStatus } from "@/lib/env";
import { Alert } from "@/components/ui/alert";

export function ConfigNotice({ status }: { status: PublicEnvStatus }) {
  if (status.isConfigured) {
    return null;
  }

  return (
    <Alert tone={status.usingLegacyAnonKey ? "info" : "warning"} role="status">
      <h2 className="text-sm font-semibold">Supabase configuration needed</h2>
      <p className="mt-1 text-sm">
        Missing: {status.missingKeys.join(", ")}. Authentication pages are
        wired, but real login and registration need local environment values
        from a Supabase project.
      </p>
    </Alert>
  );
}
