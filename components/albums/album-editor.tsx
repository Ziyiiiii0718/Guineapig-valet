"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateAlbumAction, type AlbumActionState } from "@/app/actions/albums";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ALBUM_DESCRIPTION_MAX_LENGTH,
  ALBUM_NAME_MAX_LENGTH,
} from "@/lib/albums/validation";

function EditorButtons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

export function AlbumEditor({
  albumId,
  description,
  name,
}: {
  albumId: string;
  description: string | null;
  name: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(updateAlbumAction, {
    status: "idle",
  } satisfies AlbumActionState);
  const editRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);
  useEffect(() => {
    if (state.status === "success") {
      const timer = window.setTimeout(() => {
        setEditing(false);
        window.setTimeout(() => editRef.current?.focus(), 0);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [state.status]);
  function cancel() {
    setEditing(false);
    window.setTimeout(() => editRef.current?.focus(), 0);
  }
  return (
    <div className="album-editor">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="heading-page break-words">{name}</h1>
        {!editing ? (
          <Button
            ref={editRef}
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label={`Edit album ${name}`}
          >
            Edit album
          </Button>
        ) : null}
      </div>
      {!editing && description ? (
        <p className="text-secondary mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6">
          {description}
        </p>
      ) : null}
      {editing ? (
        <form
          action={action}
          className="album-form mt-4 space-y-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <input type="hidden" name="albumId" value={albumId} />
          <div>
            <label className="form-label" htmlFor="edit-album-name">
              Name
            </label>
            <input
              ref={inputRef}
              className="input"
              id="edit-album-name"
              name="name"
              defaultValue={state.values?.name ?? name}
              maxLength={ALBUM_NAME_MAX_LENGTH}
              required
            />
            {state.fieldErrors?.name ? (
              <p className="field-error">{state.fieldErrors.name}</p>
            ) : null}
          </div>
          <div>
            <label className="form-label" htmlFor="edit-album-description">
              Description <span className="text-secondary">(optional)</span>
            </label>
            <textarea
              className="input min-h-24 resize-y"
              id="edit-album-description"
              name="description"
              defaultValue={state.values?.description ?? description ?? ""}
              maxLength={ALBUM_DESCRIPTION_MAX_LENGTH}
            />
            {state.fieldErrors?.description ? (
              <p className="field-error">{state.fieldErrors.description}</p>
            ) : null}
          </div>
          {state.status === "error" && state.message ? (
            <Alert tone="error" role="alert">
              {state.message}
            </Alert>
          ) : null}
          <EditorButtons onCancel={cancel} />
        </form>
      ) : null}
      {!editing && state.status === "success" && state.message ? (
        <Alert className="mt-3" tone="success" role="status">
          {state.message}
        </Alert>
      ) : null}
    </div>
  );
}
