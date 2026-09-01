import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getPhotoDisplayName } from "@/lib/photos/display-name";
import {
  formatPhotoCalendarDate,
  formatPhotoFileSize,
  getPhotoDisplayDate,
} from "@/lib/photos/gallery";
import type { PhotoWithSignedUrl } from "@/lib/photos/queries";

type PhotoCardProps = {
  photo: PhotoWithSignedUrl;
  priority?: boolean;
  variant?: "default" | "gallery";
};

export function PhotoCard({
  photo,
  priority = false,
  variant = "default",
}: PhotoCardProps) {
  const displayDate = getPhotoDisplayDate(photo);
  const displayName = getPhotoDisplayName(photo);
  const image = (
    <span className="photo-card-image-wrap">
      {photo.signed_url ? (
        <Image
          src={photo.signed_url}
          alt=""
          fill
          priority={priority}
          sizes={
            variant === "gallery"
              ? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              : "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          }
          className="photo-card-image"
          unoptimized
        />
      ) : (
        <span
          className="photo-card-missing"
          role="img"
          aria-label="Image unavailable"
        >
          Image unavailable
        </span>
      )}
    </span>
  );

  if (variant === "gallery") {
    return (
      <article className="photo-card photo-card-gallery">
        <Link
          href={`/photos/${photo.id}`}
          className="photo-card-gallery-image-link focus-ring"
          aria-label={`View ${displayName}`}
        >
          {image}
        </Link>
        <div className="photo-card-body photo-card-gallery-body">
          <span className="photo-card-gallery-copy">
            <Link
              className="photo-card-gallery-name focus-ring"
              href={`/photos/${photo.id}`}
              title={displayName}
            >
              {displayName}
            </Link>
            <span className="text-secondary text-sm">
              {formatPhotoCalendarDate(displayDate)} ·{" "}
              {formatPhotoFileSize(photo.file_size)}
            </span>
            {photo.signed_url_error ? (
              <Badge tone="warning">Refresh needed</Badge>
            ) : null}
          </span>
          <details className="photo-card-menu">
            <summary
              className="focus-ring"
              aria-label={`More actions for ${displayName}`}
            >
              <span aria-hidden="true">•••</span>
            </summary>
            <div className="photo-card-menu-popover">
              <Link href={`/photos/${photo.id}`}>Open photo</Link>
              <Link href={`/photos/${photo.id}`}>Rename or delete</Link>
            </div>
          </details>
        </div>
      </article>
    );
  }

  return (
    <Link
      href={`/photos/${photo.id}`}
      className="photo-card focus-ring"
      aria-label={`View ${displayName}`}
    >
      {image}
      <span className="photo-card-body">
        <span className="truncate font-bold" title={displayName}>
          {displayName}
        </span>
        <span className="text-secondary text-sm">
          {formatPhotoCalendarDate(displayDate)} ·{" "}
          {formatPhotoFileSize(photo.file_size)}
        </span>
        {photo.signed_url_error ? (
          <Badge tone="warning">Refresh needed</Badge>
        ) : null}
      </span>
    </Link>
  );
}
