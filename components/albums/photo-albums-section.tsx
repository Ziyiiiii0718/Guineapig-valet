"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addPhotosToAlbumAction,
  removePhotoFromAlbumAction,
  type AlbumActionState,
} from "@/app/actions/albums";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import type { AlbumMembership } from "@/lib/albums/queries";

function PendingButton({
  children,
  variant = "secondary",
}: {
  children: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Saving..." : children}
    </Button>
  );
}
function RemoveMembership({
  albumId,
  photoId,
}: {
  albumId: string;
  photoId: string;
}) {
  const [state, action] = useActionState(removePhotoFromAlbumAction, {
    status: "idle",
  } satisfies AlbumActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="albumId" value={albumId} />
      <input type="hidden" name="photoId" value={photoId} />
      <PendingButton>Remove</PendingButton>
      {state.status === "error" && state.message ? (
        <Alert tone="error" role="alert" className="text-sm">
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
export function PhotoAlbumsSection({
  allAlbums,
  memberships,
  photoId,
}: {
  allAlbums: AlbumMembership[];
  memberships: AlbumMembership[];
  photoId: string;
}) {
  const [state, action] = useActionState(addPhotosToAlbumAction, {
    status: "idle",
  } satisfies AlbumActionState);
  const memberIds = new Set(memberships.map((album) => album.id));
  const available = allAlbums.filter((album) => !memberIds.has(album.id));
  return (
    <section aria-labelledby="photo-albums-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="photo-albums-title" className="heading-section">
          Albums
        </h2>
        <ButtonLink href="/albums/new" variant="ghost">
          Create album
        </ButtonLink>
      </div>
      {memberships.length === 0 ? (
        <p className="text-secondary mt-3 text-sm">
          This photo is not in an album yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {memberships.map((album) => (
            <li key={album.id} className="album-membership-row">
              <Link
                className="link-primary font-bold"
                href={`/albums/${album.id}`}
              >
                {album.title}
              </Link>
              <RemoveMembership albumId={album.id} photoId={photoId} />
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 ? (
        <form
          action={action}
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="photoIds" value={photoId} />
          <div className="min-w-0 flex-1">
            <label className="form-label" htmlFor="photo-album-select">
              Add to album
            </label>
            <select
              className="input"
              id="photo-album-select"
              name="albumId"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Choose an album
              </option>
              {available.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </div>
          <PendingButton variant="primary">Add to album</PendingButton>
        </form>
      ) : null}
      {state.status !== "idle" && state.message ? (
        <Alert
          className="mt-3"
          tone={state.status === "error" ? "error" : "success"}
          role="status"
        >
          {state.message}
        </Alert>
      ) : null}
    </section>
  );
}
