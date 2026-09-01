"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { deleteAlbumAction, type AlbumActionState } from "@/app/actions/albums";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Deleting..." : "Delete album"}
    </Button>
  );
}

export function DeleteAlbumForm({
  albumId,
  name,
}: {
  albumId: string;
  name: string;
}) {
  const [state, action] = useActionState(deleteAlbumAction, {
    status: "idle",
  } satisfies AlbumActionState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <section className="danger-zone" aria-labelledby="album-danger-title">
      <div>
        <h2 id="album-danger-title" className="heading-section">
          Delete album
        </h2>
        <p className="text-secondary mt-1 text-sm">
          Remove this album and its memberships.
        </p>
      </div>
      <Button
        ref={triggerRef}
        variant="danger"
        onClick={() => dialogRef.current?.showModal()}
      >
        Delete album
      </Button>
      <dialog
        ref={dialogRef}
        className="delete-dialog"
        aria-labelledby="delete-album-title"
        aria-describedby="delete-album-description"
        onClose={() => window.setTimeout(() => triggerRef.current?.focus(), 0)}
      >
        <form action={action} className="delete-dialog-panel">
          <input type="hidden" name="albumId" value={albumId} />
          {state.status === "error" && state.message ? (
            <Alert tone="error" role="alert">
              {state.message}
            </Alert>
          ) : null}
          <div>
            <p className="section-kicker">Album only</p>
            <h3 id="delete-album-title" className="heading-section mt-1">
              Delete {name}?
            </h3>
            <p
              id="delete-album-description"
              className="text-secondary mt-2 text-sm leading-6"
            >
              Deleting this album will not delete the photos inside it. Only the
              album and its membership links are removed.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <DeleteButton />
          </div>
        </form>
      </dialog>
    </section>
  );
}
