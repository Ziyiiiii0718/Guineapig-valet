import { notFound } from "next/navigation";
import { AlbumEditor } from "@/components/albums/album-editor";
import { DeleteAlbumForm } from "@/components/albums/delete-album-form";
import { RemovePhotoFromAlbumForm } from "@/components/albums/remove-photo-form";
import { PhotoCard } from "@/components/photos/photo-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ALBUM_PHOTO_PAGE_SIZE,
  getAlbumForUser,
  listAlbumPhotosForUser,
} from "@/lib/albums/queries";
import { albumIdSchema, parseAlbumPage } from "@/lib/albums/validation";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

export default async function AlbumDetailPage({
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
  const { album, error } = await getAlbumForUser(parsedId.data, user.id);
  if (!album) notFound();
  const result = await listAlbumPhotosForUser({
    albumId: album.id,
    page,
    userId: user.id,
  });
  const pageCount = Math.max(
    1,
    Math.ceil(result.count / ALBUM_PHOTO_PAGE_SIZE),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <AlbumEditor
          albumId={album.id}
          description={album.description}
          name={album.title}
        />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/albums" variant="ghost">
            All albums
          </ButtonLink>
          <ButtonLink href={`/albums/${album.id}/photos`}>
            Add photos
          </ButtonLink>
        </div>
      </div>
      <Badge tone={result.count ? "success" : "neutral"}>
        {result.count} {result.count === 1 ? "photo" : "photos"}
      </Badge>
      {error || result.error ? (
        <Alert tone="error">Some album details could not be loaded.</Alert>
      ) : null}
      {result.count === 0 ? (
        <Card>
          <div className="empty-state text-sm">
            This album is empty. Add photos from your existing private library.
          </div>
          <div className="mt-4 flex gap-2">
            <ButtonLink href={`/albums/${album.id}/photos`}>
              Add photos
            </ButtonLink>
            <ButtonLink href="/photos/upload" variant="secondary">
              Upload photos
            </ButtonLink>
          </div>
        </Card>
      ) : null}
      {result.photos.length > 0 ? (
        <div className="album-photo-grid">
          {result.photos.map((photo) => (
            <div key={photo.id} className="min-w-0">
              <PhotoCard photo={photo} />
              <RemovePhotoFromAlbumForm albumId={album.id} photoId={photo.id} />
            </div>
          ))}
        </div>
      ) : null}
      {result.count > 0 ? (
        <nav
          aria-label="Album photo pages"
          className="flex justify-between gap-3"
        >
          <p className="text-secondary text-sm">
            Page {Math.min(page, pageCount)} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <ButtonLink
                href={`/albums/${album.id}?page=${page - 1}`}
                variant="secondary"
              >
                Previous
              </ButtonLink>
            ) : null}
            {page < pageCount ? (
              <ButtonLink
                href={`/albums/${album.id}?page=${page + 1}`}
                variant="secondary"
              >
                Next
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      ) : null}
      <DeleteAlbumForm albumId={album.id} name={album.title} />
    </div>
  );
}
