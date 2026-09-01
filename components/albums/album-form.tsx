"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createAlbumAction, type AlbumActionState } from "@/app/actions/albums";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  ALBUM_DESCRIPTION_MAX_LENGTH,
  ALBUM_NAME_MAX_LENGTH,
} from "@/lib/albums/validation";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create album"}
    </Button>
  );
}

export function AlbumForm() {
  const [state, action] = useActionState(createAlbumAction, {
    status: "idle",
  } satisfies AlbumActionState);
  return (
    <form action={action} className="album-form space-y-5">
      {state.status === "error" && state.message ? (
        <Alert tone="error" role="alert">
          {state.message}
        </Alert>
      ) : null}
      <div>
        <label className="form-label" htmlFor="album-name">
          Name
        </label>
        <input
          className="input"
          defaultValue={state.values?.name}
          id="album-name"
          maxLength={ALBUM_NAME_MAX_LENGTH}
          name="name"
          required
        />
        {state.fieldErrors?.name ? (
          <p className="field-error">{state.fieldErrors.name}</p>
        ) : null}
      </div>
      <div>
        <label className="form-label" htmlFor="album-description">
          Description <span className="text-secondary">(optional)</span>
        </label>
        <textarea
          className="input min-h-28 resize-y"
          defaultValue={state.values?.description}
          id="album-description"
          maxLength={ALBUM_DESCRIPTION_MAX_LENGTH}
          name="description"
        />
        <p className="text-secondary mt-2 text-sm">
          Up to {ALBUM_DESCRIPTION_MAX_LENGTH} characters.
        </p>
        {state.fieldErrors?.description ? (
          <p className="field-error">{state.fieldErrors.description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton />
        <ButtonLink href="/albums" variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
