import { ConfigNotice } from "@/components/config-notice";
import { PetCard } from "@/components/pets/pet-card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listPetsForUser,
  requireAuthenticatedSupabase,
} from "@/lib/pets/queries";

export default async function PetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const { envStatus, user } = await requireAuthenticatedSupabase();

  if (!envStatus.isConfigured || !user) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Pets unavailable</h1>
          <p className="text-secondary mt-2 text-sm">
            Add Supabase environment variables to manage guinea pig profiles.
          </p>
        </Card>
      </div>
    );
  }

  const { error, pets } = await listPetsForUser(user.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">Private pet profiles</p>
          <h1 className="heading-page mt-2">Your guinea pigs</h1>
          <p className="text-secondary mt-2 max-w-2xl text-sm leading-6">
            Keep each piggie profile private to your account. Photos, health,
            and weight features are still planned for later phases.
          </p>
        </div>
        <ButtonLink href="/pets/new">Create pet</ButtonLink>
      </div>

      {params?.message === "deleted" ? (
        <Alert tone="success" role="status" className="text-sm">
          Pet profile deleted.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" role="alert">
          We could not load your pet profiles. Please try again.
        </Alert>
      ) : null}

      {!error && pets.length === 0 ? (
        <Card className="pet-empty-state">
          <div className="pet-empty-illustration" aria-hidden="true" />
          <h2 className="heading-section">No guinea pigs yet</h2>
          <p className="text-secondary mt-2 max-w-lg text-sm leading-6">
            Create your first private profile with a name, birth date, sex, and
            care notes. Profile photos can be added after the profile exists.
          </p>
          <div className="mt-5">
            <ButtonLink href="/pets/new">Create pet</ButtonLink>
          </div>
        </Card>
      ) : null}

      {pets.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {pets.map((pet) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
