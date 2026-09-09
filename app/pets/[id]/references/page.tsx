import { notFound } from "next/navigation";
import { ReferencePhotoPickerForm } from "@/components/references/reference-photo-picker-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getPetForUser,
  requireAuthenticatedSupabase,
} from "@/lib/pets/queries";
import { listReferencePhotoPicker } from "@/lib/references/queries";
import { REFERENCE_PICKER_PAGE_SIZE } from "@/lib/references/validation";
import { parseAlbumPage } from "@/lib/albums/validation";
import { petIdSchema } from "@/lib/validation/pets";

export default async function ReferencePhotoPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const parsedPetId = petIdSchema.safeParse(id);
  if (!parsedPetId.success) notFound();
  const page = parseAlbumPage((await searchParams).page);
  const { user } = await requireAuthenticatedSupabase();
  if (!user) notFound();
  const { pet } = await getPetForUser(parsedPetId.data, user.id);
  if (!pet) notFound();
  const result = await listReferencePhotoPicker({
    page,
    petId: pet.id,
    userId: user.id,
  });
  const pageCount = Math.max(
    1,
    Math.ceil(result.count / REFERENCE_PICKER_PAGE_SIZE),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="section-kicker">{pet.name}</p>
        <h1 className="heading-page mt-1">Choose AI reference photos</h1>
        <p className="text-secondary mt-2 max-w-2xl text-sm leading-6">
          Select existing private gallery photos. PiggieVault sends their bytes
          through a secure server connection to create visual embeddings; it
          does not copy the Storage objects.
        </p>
      </div>
      {result.error ? (
        <Alert tone="error">We could not load your photo library.</Alert>
      ) : null}
      {result.count === 0 ? (
        <Card>
          <div className="empty-state text-sm">
            Your photo library is empty.
          </div>
          <div className="mt-4">
            <ButtonLink href="/photos/upload">Upload photos</ButtonLink>
          </div>
        </Card>
      ) : (
        <ReferencePhotoPickerForm
          existing={[...result.existing]}
          petId={pet.id}
          photos={result.photos}
        />
      )}
      {result.count > REFERENCE_PICKER_PAGE_SIZE ? (
        <nav
          className="flex justify-between gap-3"
          aria-label="Reference photo pages"
        >
          <p className="text-secondary text-sm">
            Page {Math.min(page, pageCount)} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <ButtonLink
                href={`/pets/${pet.id}/references?page=${page - 1}`}
                variant="secondary"
              >
                Previous
              </ButtonLink>
            ) : null}
            {page < pageCount ? (
              <ButtonLink
                href={`/pets/${pet.id}/references?page=${page + 1}`}
                variant="secondary"
              >
                Next
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
