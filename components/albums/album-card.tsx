import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AlbumSummary } from "@/lib/albums/queries";
import { getPhotoDisplayName } from "@/lib/photos/display-name";

export function AlbumCard({ album }: { album: AlbumSummary }) {
  const countLabel = `${album.photo_count} ${album.photo_count === 1 ? "photo" : "photos"}`;
  return (
    <article className="album-card album-card-editorial">
      <Link
        href={`/albums/${album.id}`}
        className="album-card-main-link focus-ring"
        aria-label={`View album ${album.title}, ${countLabel}`}
      />
      <div className="album-cover-wrap">
        {album.cover?.signed_url ? (
          <Image
            src={album.cover.signed_url}
            alt=""
            fill
            sizes="(min-width: 900px) 50vw, 100vw"
            className="album-cover-image"
            unoptimized
          />
        ) : (
          <span
            className="album-cover-placeholder"
            role="img"
            aria-label={album.cover ? "Album cover unavailable" : "Empty album"}
          >
            PV
          </span>
        )}
        <details className="album-card-menu">
          <summary
            className="focus-ring"
            aria-label={`More actions for ${album.title}`}
          >
            <span aria-hidden="true">•••</span>
          </summary>
          <div className="album-card-menu-popover">
            <Link href={`/albums/${album.id}`}>Open album</Link>
            <Link href={`/albums/${album.id}`}>Edit or delete</Link>
          </div>
        </details>
      </div>
      <div className="album-card-body">
        <span className="album-card-info">
          <span className="min-w-0">
            <span className="album-card-title" title={album.title}>
              {album.title}
            </span>
            {album.description ? (
              <span className="text-secondary mt-1 line-clamp-2 block text-sm">
                {album.description}
              </span>
            ) : null}
          </span>
          <Badge tone="neutral">{countLabel}</Badge>
        </span>
        {album.cover ? (
          <span className="sr-only">
            Cover: {getPhotoDisplayName(album.cover)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
