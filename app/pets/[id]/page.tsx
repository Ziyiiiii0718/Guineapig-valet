import { notFound } from "next/navigation";
import { DeletePetForm } from "@/components/pets/delete-pet-form";
import { PetAvatar } from "@/components/pets/pet-avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPetAge } from "@/lib/pets/age";
import {
  getPetForUser,
  requireAuthenticatedSupabase,
} from "@/lib/pets/queries";
import { displayOptional, formatPetSex } from "@/lib/pets/view";
import { petIdSchema } from "@/lib/validation/pets";
import { listWeightsForPet } from "@/lib/weights/queries";
import { WeightSection } from "@/components/weights/weight-section";
import { HealthSummary } from "@/components/health/health-summary";
import { listHealthForPet } from "@/lib/health/queries";

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="pet-detail-item">
      <dt>{label}</dt>
      <dd>{displayOptional(value)}</dd>
    </div>
  );
}

export default async function PetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ message?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedPetId = petIdSchema.safeParse(id);

  if (!parsedPetId.success) {
    notFound();
  }

  const { user } = await requireAuthenticatedSupabase();

  if (!user) {
    notFound();
  }

  const [{ error, pet }, weights, health] = await Promise.all([
    getPetForUser(parsedPetId.data, user.id),
    listWeightsForPet(parsedPetId.data, user.id),
    listHealthForPet(parsedPetId.data, user.id, { limit: 3 }),
  ]);

  if (error || !pet) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {query?.message === "created" ? (
        <div className="alert alert-success text-sm" role="status">
          Pet profile created.
        </div>
      ) : null}
      {query?.message === "updated" ? (
        <div className="alert alert-success text-sm" role="status">
          Pet profile updated.
        </div>
      ) : null}

      <Card className="pet-profile-hero">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <PetAvatar
              name={pet.name}
              src={pet.profile_photo_url}
              className="pet-avatar-large"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="heading-page">{pet.name}</h1>
                <Badge tone="success">{formatPetSex(pet.sex)}</Badge>
              </div>
              <p className="text-secondary mt-2 text-sm">
                {formatPetAge(pet.birth_date)} · born {pet.birth_date}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={`/pets/${pet.id}/edit`} variant="secondary">
              Edit profile
            </ButtonLink>
            <ButtonLink href="/pets" variant="ghost">
              All pets
            </ButtonLink>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <h2 className="heading-section">Profile notes</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <DetailItem label="Favorite foods" value={pet.favorite_foods} />
            <DetailItem label="Disliked foods" value={pet.disliked_foods} />
            <DetailItem label="Personality" value={pet.personality_notes} />
            <DetailItem label="General notes" value={pet.general_notes} />
          </dl>
        </Card>

        <Card soft>
          <h2 className="heading-section">Private care workspace</h2>
          <p className="text-secondary mt-2 text-sm leading-6">
            Reference images and AI classification remain planned. Photos,
            albums, weight tracking, and health records are available now.
          </p>
          <div className="empty-state mt-5 text-sm">
            Profile avatars and photos use private Supabase Storage. AI
            reference-photo workflows remain a separate future feature.
          </div>
        </Card>
      </div>

      <Card>
        <WeightSection
          petId={pet.id}
          petName={pet.name}
          records={weights.records}
        />
      </Card>

      <Card>
        <HealthSummary petId={pet.id} records={health.records} />
      </Card>

      <DeletePetForm petId={pet.id} petName={pet.name} />
    </div>
  );
}
