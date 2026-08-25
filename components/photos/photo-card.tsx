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
};

export function PhotoCard({ photo, priority = false }: PhotoCardProps) {
  const displayDate = getPhotoDisplayDate(photo);
  const displayName = getPhotoDisplayName(photo);

  return (
    <Link
      href={`/photos/${photo.id}`}
      className="photo-card focus-ring"
      aria-label={`View ${displayName}`}
    >
      <span className="photo-card-image-wrap">
        {photo.signed_url ? (
          <Image
            src={photo.signed_url}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
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
