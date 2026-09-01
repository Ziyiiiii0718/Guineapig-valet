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
    <div className="pets-page">
      <header className="pets-page-header">
        <div>
          <p className="section-kicker">Private pet profiles</p>
          <h1 className="pets-page-title">Your guinea pigs</h1>
          <p className="pets-page-intro">
            Keep each piggie&apos;s profile private and safe. Save photos, track
            weight, and keep health records together.
          </p>
        </div>
        <ButtonLink className="pets-create-button" href="/pets/new">
          <span aria-hidden="true">+</span> Create pet
        </ButtonLink>
      </header>

      {params?.message === "deleted" ? (
        <Alert tone="success" role="status" className="pets-page-alert text-sm">
          Pet profile deleted.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" role="alert" className="pets-page-alert">
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
        <section className="pets-composition" aria-label="Your pet profiles">
          {pets.map((pet) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
        </section>
      ) : null}

      {!error && pets.length > 0 ? (
        <aside className="pets-privacy-note">
          <span className="pets-privacy-lock" aria-hidden="true" />
          <div>
            <strong>All pet profiles are private to your account.</strong>
            <p>
              Only you can view and manage your piggies&apos; care information.
            </p>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
