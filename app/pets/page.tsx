import { ConfigNotice } from "@/components/config-notice";
import { PetCard } from "@/components/pets/pet-card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GardenArt } from "@/components/ui/garden-art";
import { OutlineIcon } from "@/components/ui/outline-icon";
import { safeDisplayName } from "@/lib/pets/profile-view";
import { listWeightsForPet } from "@/lib/weights/queries";
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
  const latestWeights = new Map(
    await Promise.all(
      pets.map(async (pet) => {
        const result = await listWeightsForPet(pet.id, user.id);
        return [
          pet.id,
          result.error ? undefined : result.summary.latest?.weight_grams,
        ] as const;
      }),
    ),
  );
  const name = safeDisplayName(user.user_metadata);

  return (
    <div className="pet-lifestyle pet-index">
      <header className="pet-index-header">
        <div>
          <p className="pet-index-greeting">
            {name ? `Welcome back, ${name}!` : "Welcome back!"}
          </p>
          <h1>
            My Pets <OutlineIcon name="heart" />
          </h1>
          <p className="pet-index-intro">Little lives, a whole lot of love.</p>
        </div>
        <ButtonLink href="/pets/new">
          <span aria-hidden="true">+</span> Add Pet
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
        <section className="pet-index-grid" aria-label="Your pet profiles">
          {pets.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              latestWeight={latestWeights.get(pet.id)}
            />
          ))}
        </section>
      ) : null}

      {!error && pets.length > 0 ? (
        <p className="pet-index-privacy">
          A private little world. Only you can see your pets and their memories.
        </p>
      ) : null}
      <div className="pet-garden-footer">
        <GardenArt />
        <p aria-hidden="true">Small paws, happy days ♡</p>
      </div>
    </div>
  );
}
