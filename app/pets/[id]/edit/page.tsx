import { notFound } from "next/navigation";
import { PetAvatarForm } from "@/components/pets/pet-avatar-form";
import { PetForm } from "@/components/pets/pet-form";
import { Alert } from "@/components/ui/alert";
import {
  getPetForUser,
  requireAuthenticatedSupabase,
} from "@/lib/pets/queries";
import { petToFormFields } from "@/lib/pets/view";
import { petIdSchema } from "@/lib/validation/pets";

export default async function EditPetPage({
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="section-kicker">Edit profile</p>
        <h1 className="heading-page mt-2">Update {pet.name}</h1>
        <p className="text-secondary mt-2 text-sm leading-6">
          Changes are saved only to your private pet profile.
        </p>
      </div>
      {query?.message === "avatar-updated" ? (
        <Alert tone="success" role="status" className="text-sm">
          Profile photo updated.
        </Alert>
      ) : null}
      {query?.message === "avatar-removed" ? (
        <Alert tone="success" role="status" className="text-sm">
          Profile photo removed. The fallback avatar is back.
        </Alert>
      ) : null}
      <PetAvatarForm
        avatarUrl={pet.profile_photo_url}
        petId={pet.id}
        petName={pet.name}
      />
      <PetForm
        cancelHref={`/pets/${pet.id}`}
        initialFields={petToFormFields(pet)}
        mode="edit"
        petId={pet.id}
      />
    </div>
  );
}
