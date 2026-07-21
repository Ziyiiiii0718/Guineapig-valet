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

  const { error, pet } = await getPetForUser(parsedPetId.data, user.id);

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
          <h2 className="heading-section">Future care sections</h2>
          <p className="text-secondary mt-2 text-sm leading-6">
            Photos, reference images, weight records, and health notes are still
            planned. This page only manages the core pet profile.
          </p>
          <div className="empty-state mt-5 text-sm">
            Profile avatars use private Supabase Storage now. Full galleries and
            AI reference-photo workflows remain separate future features.
          </div>
        </Card>
      </div>

      <DeletePetForm petId={pet.id} petName={pet.name} />
    </div>
  );
}
