import { notFound } from "next/navigation";
import { AddPhotosForm } from "@/components/albums/add-photos-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ALBUM_PICKER_PAGE_SIZE,
  getAlbumForUser,
  listPhotoPickerForAlbum,
} from "@/lib/albums/queries";
import { albumIdSchema, parseAlbumPage } from "@/lib/albums/validation";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

export default async function AlbumPhotoPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const parsedId = albumIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const page = parseAlbumPage((await searchParams).page);
  const { user } = await requireAuthenticatedSupabase();
  if (!user) notFound();
  const { album } = await getAlbumForUser(parsedId.data, user.id);
  if (!album) notFound();
  const result = await listPhotoPickerForAlbum({
    albumId: album.id,
    page,
    userId: user.id,
  });
  const pageCount = Math.max(
    1,
    Math.ceil(result.count / ALBUM_PICKER_PAGE_SIZE),
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="section-kicker">{album.title}</p>
        <h1 className="heading-page mt-1">Add existing photos</h1>
        <p className="text-secondary mt-2 text-sm">
          Choose up to 20 photos from this page. Already-added photos are marked
          and cannot be duplicated.
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
        <AddPhotosForm
          albumId={album.id}
          existing={[...result.existing]}
          photos={result.photos}
        />
      )}
      {result.count > ALBUM_PICKER_PAGE_SIZE ? (
        <nav
          className="flex justify-between gap-3"
          aria-label="Photo picker pages"
        >
          <p className="text-secondary text-sm">
            Page {Math.min(page, pageCount)} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <ButtonLink
                href={`/albums/${album.id}/photos?page=${page - 1}`}
                variant="secondary"
              >
                Previous
              </ButtonLink>
            ) : null}
            {page < pageCount ? (
              <ButtonLink
                href={`/albums/${album.id}/photos?page=${page + 1}`}
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
