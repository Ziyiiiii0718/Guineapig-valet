"use client";

import Image from "next/image";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addReferencePhotosAction,
  type ReferenceActionState,
} from "@/app/actions/references";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { getPhotoDisplayName } from "@/lib/photos/display-name";
import type { PhotoRow } from "@/lib/photos/queries";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating embeddings..." : "Add selected references"}
    </Button>
  );
}

export function ReferencePhotoPickerForm({
  existing,
  petId,
  photos,
}: {
  existing: string[];
  petId: string;
  photos: Array<PhotoRow & { signed_url: string | null }>;
}) {
  const [state, action] = useActionState(addReferencePhotosAction, {
    status: "idle",
  } satisfies ReferenceActionState);
  const existingIds = new Set(existing);

  return (
    <form action={action}>
      <input type="hidden" name="petId" value={petId} />
      {state.status !== "idle" && state.message ? (
        <Alert
          className="mb-4"
          role="status"
          tone={state.status === "error" ? "error" : "success"}
        >
          {state.message}
        </Alert>
      ) : null}
      <fieldset>
        <legend className="sr-only">Choose reference photos</legend>
        <div className="album-picker-grid">
          {photos.map((photo) => {
            const added = existingIds.has(photo.id);
            const name = getPhotoDisplayName(photo);
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
                      loading="eager"
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
                    {added ? "Already a reference" : "Select photo"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-2">
        <Submit />
        <ButtonLink href={`/pets/${petId}`} variant="ghost">
          Back to pet
        </ButtonLink>
      </div>
    </form>
  );
}
