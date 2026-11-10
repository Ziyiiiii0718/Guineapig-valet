/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { OutlineIcon } from "@/components/ui/outline-icon";
import { getPhotoDisplayName } from "@/lib/photos/display-name";
import type { PhotoWithSignedUrl } from "@/lib/photos/queries";
import type { AlbumSummary } from "@/lib/albums/queries";

export function PetMediaPagination({
  petId,
  view,
  page,
  count,
  pageSize,
}: {
  petId: string;
  view: "photos" | "albums";
  page: number;
  count: number;
  pageSize: number;
}) {
  if (count <= pageSize) return null;
  const pages = Math.ceil(count / pageSize);
  return (
    <nav className="pagination" aria-label={`Pet ${view} pages`}>
      {page > 1 ? (
        <Link href={`/pets/${petId}?view=${view}&page=${page - 1}#pet-${view}`}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={`/pets/${petId}?view=${view}&page=${page + 1}#pet-${view}`}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function RecentPetPhotos({
  petId,
  petName,
  photos,
  count,
  error,
  expanded = false,
}: {
  petId: string;
  petName: string;
  photos: PhotoWithSignedUrl[];
  count: number;
  error: unknown;
  expanded?: boolean;
}) {
  return (
    <section
      id="pet-photos"
      className="pet-media-section"
      aria-labelledby="pet-photos-title"
    >
      <div className="pet-section-heading">
        <h2 id="pet-photos-title">
          {expanded ? `Photos of ${petName}` : "Recent Photos"}
        </h2>
        {!expanded ? (
          <Link href={`/pets/${petId}?view=photos#pet-photos`}>
            View all photos <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span>
            {count} confirmed {count === 1 ? "photo" : "photos"}
          </span>
        )}
      </div>
      {error ? (
        <p className="alert alert-warning" role="alert">
          Photos could not be loaded. Please try again.
        </p>
      ) : photos.length ? (
        <div
          className={`pet-photo-strip ${expanded ? "pet-photo-expanded" : ""}`}
        >
          {photos.map((photo) => (
            <Link
              key={photo.id}
              href={`/photos/${photo.id}`}
              className="pet-photo-tile focus-ring"
              aria-label={`Open ${getPhotoDisplayName(photo)}`}
            >
              {photo.signed_url ? (
                <img
                  src={photo.signed_url}
                  alt={getPhotoDisplayName(photo)}
                  loading="eager"
                />
              ) : (
                <OutlineIcon name="photos" />
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="pet-media-empty">
          <OutlineIcon name="camera" />
          <h3>Little moments belong here</h3>
          <p>Confirm {petName} in a photo review and it will appear here.</p>
          <Link href="/review" className="link-primary">
            Open Review Queue →
          </Link>
        </div>
      )}
    </section>
  );
}

export function PetAlbumsSection({
  petId,
  petName,
  albums,
  error,
  expanded = false,
}: {
  petId: string;
  petName: string;
  albums: AlbumSummary[];
  error: unknown;
  expanded?: boolean;
}) {
  return (
    <section
      id="pet-albums"
      className="pet-media-section"
      aria-labelledby="pet-albums-title"
    >
      <div className="pet-section-heading">
        <h2 id="pet-albums-title">Albums featuring {petName}</h2>
        {!expanded ? (
          <Link href={`/pets/${petId}?view=albums#pet-albums`}>
            View all albums <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
      {error ? (
        <p className="alert alert-warning" role="alert">
          Albums could not be loaded. Please try again.
        </p>
      ) : albums.length ? (
        <div className="pet-album-grid">
          {albums.map((album) => (
            <Link
              key={album.id}
              href={`/albums/${album.id}`}
              className="pet-album-tile focus-ring"
            >
              <div>
                {album.cover?.signed_url ? (
                  <img src={album.cover.signed_url} alt="" loading="eager" />
                ) : (
                  <OutlineIcon name="albums" />
                )}
              </div>
              <h3>{album.title}</h3>
              <p>
                {album.photo_count}{" "}
                {album.photo_count === 1 ? "photo" : "photos"} in album
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="pet-media-empty pet-albums-empty">
          <OutlineIcon name="albums" />
          <h3>A home for shared memories</h3>
          <p>
            Albums containing a photo confirmed as {petName} will appear here.
          </p>
          <Link href="/albums" className="link-primary">
            Browse your albums →
          </Link>
        </div>
      )}
    </section>
  );
}
