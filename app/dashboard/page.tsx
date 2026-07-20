import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { ConfigNotice } from "@/components/config-notice";
import { PlaceholderSection } from "@/components/placeholder-section";
import { Button } from "@/components/ui/button";
import { getPublicEnvStatus } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sections = [
  {
    title: "Pets",
    description:
      "Pet profile CRUD begins in Phase 1B. No pet records are loaded in Phase 1A.",
    iconTone: "green" as const,
  },
  {
    title: "Recent photos",
    description:
      "Private image upload and gallery pages are planned for later phases.",
    iconTone: "olive" as const,
  },
  {
    title: "Photos needing review",
    description:
      "AI prediction review depends on the future Python/FastAPI embedding service.",
    iconTone: "accent" as const,
  },
  {
    title: "Latest weight records",
    description:
      "Weight tracking and charts are planned after pet profiles exist.",
    iconTone: "olive" as const,
  },
  {
    title: "Recent health records",
    description:
      "Health notes will be personal tracking only and will not provide medical advice.",
    iconTone: "green" as const,
  },
];

export default async function DashboardPage() {
  const envStatus = getPublicEnvStatus();

  if (!envStatus.isConfigured) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <PlaceholderSection
          title="Dashboard unavailable"
          description="Add Supabase environment variables to enable authenticated dashboard access."
        />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?message=Please%20log%20in%20to%20view%20your%20dashboard.",
    );
  }

  return (
    <div className="space-y-8">
      <div className="dashboard-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="relative z-10">
          <h1 className="heading-page">Dashboard</h1>
          <p className="text-secondary mt-2 text-sm">
            Signed in as {user.email}. Phase 1A shows honest placeholders only.
          </p>
        </div>
        <form action={logoutAction} className="relative z-10">
          <Button type="submit" variant="secondary">
            Log out
          </Button>
        </form>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {sections.map((section) => (
          <PlaceholderSection
            key={section.title}
            title={section.title}
            description={section.description}
            iconTone={section.iconTone}
          />
        ))}
      </div>
    </div>
  );
}
