import { AlbumCard } from "@/components/albums/album-card";
import { ConfigNotice } from "@/components/config-notice";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ALBUM_PAGE_SIZE, listAlbumsForUser } from "@/lib/albums/queries";
import { parseAlbumPage } from "@/lib/albums/validation";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

export default async function AlbumsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = parseAlbumPage(params.page);
  const { envStatus, user } = await requireAuthenticatedSupabase();
  if (!envStatus.isConfigured || !user)
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Albums unavailable</h1>
        </Card>
      </div>
    );
  const result = await listAlbumsForUser({ page, userId: user.id });
  const pageCount = Math.max(1, Math.ceil(result.count / ALBUM_PAGE_SIZE));
  return (
    <div className="albums-page">
      <header className="albums-page-header">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="heading-page">Albums</h1>
            <Badge tone={result.count ? "success" : "neutral"}>
              {result.count} private
            </Badge>
          </div>
          <p className="albums-page-intro">
            Organize your private photos into albums that celebrate the little
            moments with your piggies.
          </p>
        </div>
        <ButtonLink className="albums-create-button" href="/albums/new">
          <span aria-hidden="true">+</span> Create album
        </ButtonLink>
      </header>
      {params.message === "deleted" ? (
        <Alert tone="success" className="albums-page-alert">
          Album deleted. Its photos remain in your library.
        </Alert>
      ) : null}
      {result.error ? (
        <Alert tone="error" role="alert" className="albums-page-alert">
          We could not load your albums. Please try again.
        </Alert>
      ) : null}
      {!result.error && result.count === 0 ? (
        <div className="albums-empty-state">
          <div className="text-sm">
            No albums yet. Create one to organize photos already in your private
            library.
          </div>
          <div className="mt-4">
            <ButtonLink href="/albums/new">Create album</ButtonLink>
          </div>
        </div>
      ) : null}
      {!result.error && page > pageCount ? (
        <Alert tone="warning">That album page does not exist.</Alert>
      ) : null}
      {result.albums.length > 0 ? (
        <>
          <div className="album-grid">
            {result.albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
          <nav aria-label="Album pages" className="albums-pagination">
            <p className="text-secondary text-sm">
              Page {Math.min(page, pageCount)} of {pageCount}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <ButtonLink
                  href={`/albums?page=${page - 1}`}
                  variant="secondary"
                >
                  Previous
                </ButtonLink>
              ) : null}
              {page < pageCount ? (
                <ButtonLink
                  href={`/albums?page=${page + 1}`}
                  variant="secondary"
                >
                  Next
                </ButtonLink>
              ) : null}
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}
