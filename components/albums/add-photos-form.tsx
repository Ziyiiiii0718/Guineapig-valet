"use client";

import Image from "next/image";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addPhotosToAlbumAction,
  type AlbumActionState,
} from "@/app/actions/albums";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { getPhotoDisplayName } from "@/lib/photos/display-name";
import type { PhotoWithSignedUrl } from "@/lib/photos/queries";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding..." : "Add selected photos"}
    </Button>
  );
}
export function AddPhotosForm({
  albumId,
  existing,
  photos,
}: {
  albumId: string;
  existing: string[];
  photos: PhotoWithSignedUrl[];
}) {
  const [state, action] = useActionState(addPhotosToAlbumAction, {
    status: "idle",
  } satisfies AlbumActionState);
  const existingIds = new Set(existing);
  return (
    <form action={action}>
      <input type="hidden" name="albumId" value={albumId} />
      {state.status !== "idle" && state.message ? (
        <Alert
          className="mb-4"
          tone={state.status === "error" ? "error" : "success"}
          role="status"
        >
          {state.message}
        </Alert>
      ) : null}
      <fieldset>
        <legend className="sr-only">Choose photos to add</legend>
        <div className="album-picker-grid">
          {photos.map((photo) => {
            const name = getPhotoDisplayName(photo);
            const added = existingIds.has(photo.id);
            return (
              <label
                key={photo.id}
                className={`album-picker-option focus-within:ring-2 ${added ? "album-picker-added" : ""}`}
              >
                <input
                  type="checkbox"
                  name="photoIds"
                  value={photo.id}
                  disabled={added}
                  defaultChecked={added}
                />
                <span className="album-picker-image-wrap">
                  {photo.signed_url ? (
                    <Image
                      src={photo.signed_url}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 20vw, 50vw"
                      className="album-cover-image"
                      unoptimized
                    />
                  ) : (
                    <span className="album-cover-placeholder">PV</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{name}</span>
                  <span className="text-secondary text-sm">
                    {added ? "Already in album" : "Select photo"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-2">
        <Submit />
        <ButtonLink href={`/albums/${albumId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
