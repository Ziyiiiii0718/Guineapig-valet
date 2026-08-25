"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updatePhotoDisplayNameAction,
  type PhotoNameActionState,
} from "@/app/actions/photos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PHOTO_DISPLAY_NAME_MAX_LENGTH } from "@/lib/photos/display-name";

type PhotoNameEditorProps = {
  displayName: string;
  hasCustomName: boolean;
  photoId: string;
};

function EditorActions({
  hasCustomName,
  onCancel,
}: {
  hasCustomName: boolean;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending} name="intent" type="submit" value="save">
        {pending ? "Saving..." : "Save"}
      </Button>
      <Button
        disabled={pending}
        onClick={onCancel}
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
      {hasCustomName ? (
        <Button
          disabled={pending}
          name="intent"
          type="submit"
          value="reset"
          variant="secondary"
        >
          Reset to original filename
        </Button>
      ) : null}
    </div>
  );
}

export function PhotoNameEditor({
  displayName,
  hasCustomName,
  photoId,
}: PhotoNameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [state, formAction] = useActionState(updatePhotoDisplayNameAction, {
    status: "idle",
  } satisfies PhotoNameActionState);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (state.status === "success") {
      const closeTimer = window.setTimeout(() => {
        setIsEditing(false);
        window.setTimeout(() => editButtonRef.current?.focus(), 0);
      }, 0);

      return () => window.clearTimeout(closeTimer);
    }
  }, [state.resultId, state.status]);

  function cancelEditing() {
    setIsEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  return (
    <div className="photo-name-editor">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="heading-page break-words">{displayName}</h1>
        {!isEditing ? (
          <Button
            ref={editButtonRef}
            aria-label={`Edit photo name ${displayName}`}
            onClick={() => setIsEditing(true)}
            variant="ghost"
          >
            Edit
          </Button>
        ) : null}
      </div>

      {isEditing ? (
        <form
          action={formAction}
          className="photo-name-form mt-3"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditing();
            }
          }}
        >
          <input name="photoId" type="hidden" value={photoId} />
          <label className="form-label" htmlFor="photo-display-name">
            Photo name
          </label>
          <input
            ref={inputRef}
            aria-describedby="photo-display-name-help"
            className="input"
            defaultValue={hasCustomName ? displayName : ""}
            id="photo-display-name"
            maxLength={PHOTO_DISPLAY_NAME_MAX_LENGTH}
            name="displayName"
            placeholder={displayName}
            type="text"
          />
          <p
            id="photo-display-name-help"
            className="text-secondary mt-2 text-sm"
          >
            Up to {PHOTO_DISPLAY_NAME_MAX_LENGTH} characters. The original file
            and private Storage path will not change.
          </p>
          {state.status === "error" && state.message ? (
            <Alert className="mt-3 text-sm" role="alert" tone="error">
              {state.message}
            </Alert>
          ) : null}
          <div className="mt-3">
            <EditorActions
              hasCustomName={hasCustomName}
              onCancel={cancelEditing}
            />
          </div>
        </form>
      ) : null}

      {!isEditing && state.status === "success" && state.message ? (
        <Alert className="mt-3 text-sm" role="status" tone="success">
          {state.message}
        </Alert>
      ) : null}
    </div>
  );
}
