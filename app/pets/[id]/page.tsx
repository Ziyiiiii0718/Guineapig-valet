import { notFound } from "next/navigation";
import { DeletePetForm } from "@/components/pets/delete-pet-form";
import { Card } from "@/components/ui/card";
import { GardenArt } from "@/components/ui/garden-art";
import { PetProfileHero } from "@/components/pets/pet-profile-hero";
import { PetProfileAside } from "@/components/pets/pet-profile-aside";
import { PetCareOverview } from "@/components/pets/pet-care-overview";
import { AiRecognitionSetup } from "@/components/pets/ai-recognition-setup";
import {
  RecentPetPhotos,
  PetAlbumsSection,
  PetMediaPagination,
} from "@/components/pets/pet-media-sections";
import {
  getPetForUser,
  requireAuthenticatedSupabase,
} from "@/lib/pets/queries";
import {
  parsePetProfileView,
  parsePetMediaPage,
} from "@/lib/pets/profile-view";
import {
  listConfirmedPhotosForPet,
  listAlbumsFeaturingPet,
} from "@/lib/pets/media-queries";
import { petIdSchema } from "@/lib/validation/pets";
import { listWeightsForPet } from "@/lib/weights/queries";
import { WeightSection } from "@/components/weights/weight-section";
import { listHealthForPet } from "@/lib/health/queries";
import { isAiServiceConfigured } from "@/lib/ai/config";
import { listReferencesForPet } from "@/lib/references/queries";

export default async function PetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ message?: string; view?: string; page?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedPetId = petIdSchema.safeParse(id);
  if (!parsedPetId.success) notFound();
  const { user } = await requireAuthenticatedSupabase();
  if (!user) notFound();
  const { error, pet } = await getPetForUser(parsedPetId.data, user.id);
  if (error || !pet) notFound();
  const view = parsePetProfileView(query?.view);
  const page = parsePetMediaPage(query?.page);
  const [weights, health, references, photos, albums] = await Promise.all([
    listWeightsForPet(pet.id, user.id),
    listHealthForPet(pet.id, user.id, { limit: 3 }),
    listReferencesForPet(pet.id, user.id),
    listConfirmedPhotosForPet(pet.id, user.id, {
      page: view === "photos" ? page : 1,
      limit: view === "photos" ? 24 : 5,
    }),
    listAlbumsFeaturingPet(pet.id, user.id, {
      page: view === "albums" ? page : 1,
      limit: view === "albums" ? 12 : 4,
    }),
  ]);
  const latestWeight = weights.error
    ? undefined
    : weights.summary.latest?.weight_grams;
  return (
    <div className="pet-lifestyle pet-home">
      {query?.message === "created" || query?.message === "updated" ? (
        <div className="alert alert-success mb-4 text-sm" role="status">
          Pet profile {query.message}.
        </div>
      ) : null}
      <PetProfileHero
        pet={pet}
        coverUrl={photos.photos.find((photo) => photo.signed_url)?.signed_url}
        latestWeight={latestWeight}
        view={view}
      />
      <div className="pet-home-columns">
        <div className="pet-main-column">
          {view === "overview" || view === "photos" ? (
            <Card className="pet-memories-card">
              <RecentPetPhotos
                petId={pet.id}
                petName={pet.name}
                photos={photos.photos}
                count={photos.count}
                error={photos.error}
                expanded={view === "photos"}
              />
              {view === "photos" ? (
                <PetMediaPagination
                  petId={pet.id}
                  view="photos"
                  page={page}
                  count={photos.count}
                  pageSize={24}
                />
              ) : (
                <PetAlbumsSection
                  petId={pet.id}
                  petName={pet.name}
                  albums={albums.albums}
                  error={albums.error}
                />
              )}
            </Card>
          ) : null}
          {view === "albums" ? (
            <Card className="pet-memories-card">
              <PetAlbumsSection
                petId={pet.id}
                petName={pet.name}
                albums={albums.albums}
                error={albums.error}
                expanded
              />
              <PetMediaPagination
                petId={pet.id}
                view="albums"
                page={page}
                count={albums.count}
                pageSize={12}
              />
            </Card>
          ) : null}
          {view === "overview" ? (
            <PetCareOverview
              petId={pet.id}
              weights={weights.records}
              health={health.records}
              weightError={weights.error}
              healthError={health.error}
            />
          ) : null}
          {view === "weight" ? (
            <Card id="pet-weight">
              {weights.error ? (
                <p role="alert">
                  Weight records could not be loaded. Please try again.
                </p>
              ) : (
                <WeightSection
                  petId={pet.id}
                  petName={pet.name}
                  records={weights.records}
                />
              )}
            </Card>
          ) : null}
        </div>
        <PetProfileAside
          pet={pet}
          latestWeight={latestWeight}
          readyReferences={
            references.error
              ? null
              : references.references.filter(
                  (reference) => reference.embedding_status === "ready",
                ).length
          }
        />
      </div>
      <AiRecognitionSetup
        petId={pet.id}
        petName={pet.name}
        references={references.references}
        aiConfigured={isAiServiceConfigured()}
        error={references.error}
      />
      <DeletePetForm petId={pet.id} petName={pet.name} />
      <div className="pet-garden-footer">
        <GardenArt />
        <p aria-hidden="true">Same piggies, brighter days ♡</p>
      </div>
    </div>
  );
}
