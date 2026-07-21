import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { ConfigNotice } from "@/components/config-notice";
import { PetAvatar } from "@/components/pets/pet-avatar";
import { PlaceholderSection } from "@/components/placeholder-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublicEnvStatus } from "@/lib/env";
import { formatPetAge } from "@/lib/pets/age";
import type { PetWithAvatarUrl } from "@/lib/pets/avatar-urls";
import { listPetsForUser } from "@/lib/pets/queries";
import { formatPetSex } from "@/lib/pets/view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sections = [
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

function DashboardPetSummary({
  count,
  error,
  pets,
}: {
  count: number;
  error: unknown;
  pets: PetWithAvatarUrl[];
}) {
  const recentPets = pets.slice(0, 3);

  return (
    <Card className="md:col-span-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="heading-section">Pets</h2>
            <Badge tone={count > 0 ? "success" : "neutral"}>
              {count} total
            </Badge>
          </div>
          <p className="text-secondary mt-2 text-sm leading-6">
            Real pet profiles from your private Supabase data.
          </p>
        </div>
        <ButtonLink
          href={count > 0 ? "/pets" : "/pets/new"}
          variant="secondary"
        >
          {count > 0 ? "View all pets" : "Create pet"}
        </ButtonLink>
      </div>

      {error ? (
        <Alert tone="error" role="alert" className="mt-5 text-sm">
          We could not load your pet summary. Please try again.
        </Alert>
      ) : null}

      {!error && count === 0 ? (
        <div className="empty-state mt-5 text-sm">
          No guinea pig profiles yet. Create one to replace this empty state
          with real profile cards.
        </div>
      ) : null}

      {!error && recentPets.length > 0 ? (
        <div className="dashboard-pet-grid mt-5">
          {recentPets.map((pet) => (
            <Link
              key={pet.id}
              className="dashboard-pet-mini dashboard-pet-link focus-ring"
              href={`/pets/${pet.id}`}
            >
              <PetAvatar name={pet.name} src={pet.profile_photo_url} />
              <div className="min-w-0">
                <h3 className="font-bold">{pet.name}</h3>
                <p className="text-secondary text-sm">
                  {formatPetSex(pet.sex)} · {formatPetAge(pet.birth_date)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

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

  const petSummary = await listPetsForUser(user.id);

  return (
    <div className="space-y-8">
      <div className="dashboard-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="relative z-10">
          <h1 className="heading-page">Dashboard</h1>
          <p className="text-secondary mt-2 text-sm">
            Signed in as {user.email}. Pet profiles are live; photo galleries,
            AI, weight, and health remain planned.
          </p>
        </div>
        <form action={logoutAction} className="relative z-10">
          <Button type="submit" variant="secondary">
            Log out
          </Button>
        </form>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <DashboardPetSummary
          count={petSummary.count}
          error={petSummary.error}
          pets={petSummary.pets}
        />
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
