import Link from "next/link";
import { ConfigNotice } from "@/components/config-notice";
import { PhotoCard } from "@/components/photos/photo-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  groupPhotosByTimelineMonth,
  parsePhotoPage,
  parsePhotoSort,
  PHOTO_GALLERY_PAGE_SIZE,
  type PhotoSort,
} from "@/lib/photos/gallery";
import { listPhotosForUser } from "@/lib/photos/queries";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

type PhotosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sortHref(sort: PhotoSort) {
  return `/photos?sort=${sort}`;
}

function pageHref(page: number, sort: PhotoSort) {
  return `/photos?sort=${sort}&page=${page}`;
}

function SortControls({ sort }: { sort: PhotoSort }) {
  return (
    <div className="photo-sort" aria-label="Photo sort order">
      <Link
        href={sortHref("newest")}
        className="photo-sort-option focus-ring"
        aria-current={sort === "newest" ? "true" : undefined}
      >
        Newest first
      </Link>
      <Link
        href={sortHref("oldest")}
        className="photo-sort-option focus-ring"
        aria-current={sort === "oldest" ? "true" : undefined}
      >
        Oldest first
      </Link>
    </div>
  );
}

function Pagination({
  count,
  page,
  sort,
}: {
  count: number;
  page: number;
  sort: PhotoSort;
}) {
  const pageCount = Math.max(1, Math.ceil(count / PHOTO_GALLERY_PAGE_SIZE));
  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Photo gallery pages"
    >
      <p className="text-secondary text-sm">
        Page {Math.min(page, pageCount)} of {pageCount}
      </p>
      <div className="flex flex-wrap gap-2">
        {hasPrevious ? (
          <ButtonLink href={pageHref(page - 1, sort)} variant="secondary">
            Previous
          </ButtonLink>
        ) : (
          <span className="btn btn-secondary opacity-50" aria-disabled="true">
            Previous
          </span>
        )}
        {hasNext ? (
          <ButtonLink href={pageHref(page + 1, sort)} variant="secondary">
            Next
          </ButtonLink>
        ) : (
          <span className="btn btn-secondary opacity-50" aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

export default async function PhotosPage({ searchParams }: PhotosPageProps) {
  const params = await searchParams;
  const sort = parsePhotoSort(params.sort);
  const page = parsePhotoPage(params.page);
  const { envStatus, user } = await requireAuthenticatedSupabase();

  if (!envStatus.isConfigured || !user) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Photos unavailable</h1>
          <p className="text-secondary mt-2 text-sm">
            Add Supabase environment variables to enable your private gallery.
          </p>
        </Card>
      </div>
    );
  }

  const gallery = await listPhotosForUser({ page, sort, userId: user.id });
  const pageCount = Math.max(1, Math.ceil(gallery.count / gallery.pageSize));
  const groups = groupPhotosByTimelineMonth(gallery.photos);

  return (
    <div className="space-y-6">
      <div className="dashboard-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="heading-page">Photos</h1>
            <Badge tone={gallery.count > 0 ? "success" : "neutral"}>
              {gallery.count} private
            </Badge>
          </div>
          <p className="text-secondary mt-2 max-w-2xl text-sm leading-6">
            Browse your uploaded photos by UTC calendar month. Signed image URLs
            are created only for this page of results and expire after about 10
            minutes.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2">
          <SortControls sort={sort} />
          <ButtonLink href="/photos/upload">Upload photos</ButtonLink>
        </div>
      </div>

      {params.message === "deleted" ? (
        <Alert tone="success" className="text-sm">
          Photo deleted.
        </Alert>
      ) : null}

      {gallery.error ? (
        <Alert tone="error" role="alert" className="text-sm">
          We could not load your private photos. Please try again.
        </Alert>
      ) : null}

      {!gallery.error && gallery.count === 0 ? (
        <Card>
          <div className="empty-state text-sm">
            No uploaded photos yet. Upload a few private guinea-pig photos to
            start your timeline.
          </div>
          <div className="mt-4">
            <ButtonLink href="/photos/upload">Upload photos</ButtonLink>
          </div>
        </Card>
      ) : null}

      {!gallery.error && gallery.count > 0 && page > pageCount ? (
        <Alert tone="warning" role="alert" className="text-sm">
          That gallery page does not exist yet. Use the pagination controls to
          return to your photos.
        </Alert>
      ) : null}

      {!gallery.error && groups.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`photos-${group.id}`}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 id={`photos-${group.id}`} className="heading-section">
                  {group.label}
                </h2>
                <Badge tone="neutral">
                  {group.photos.length}{" "}
                  {group.photos.length === 1 ? "photo" : "photos"}
                </Badge>
              </div>
              <div className="photo-gallery-grid">
                {group.photos.map((photo, index) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    priority={page === 1 && index < 4}
                  />
                ))}
              </div>
            </section>
          ))}
          <Pagination count={gallery.count} page={page} sort={sort} />
        </div>
      ) : null}
    </div>
  );
}
