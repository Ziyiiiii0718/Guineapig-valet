"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  deletePhotoAction,
  type PhotoDeleteActionState,
} from "@/app/actions/photos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type DeletePhotoFormProps = {
  fileName: string;
  photoId: string;
};

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Deleting..." : "Delete photo"}
    </Button>
  );
}

export function DeletePhotoForm({ fileName, photoId }: DeletePhotoFormProps) {
  const [state, formAction] = useActionState(deletePhotoAction, {
    status: "idle",
  } satisfies PhotoDeleteActionState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openDialog() {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <section className="danger-zone" aria-labelledby="photo-danger-title">
      <div>
        <h2 id="photo-danger-title" className="heading-section">
          Delete photo
        </h2>
        <p className="text-secondary mt-1 text-sm leading-6">
          Remove this private image and its metadata from your account.
        </p>
      </div>
      <Button
        ref={triggerRef}
        type="button"
        variant="danger"
        onClick={openDialog}
      >
        Delete photo
      </Button>

      <dialog
        ref={dialogRef}
        aria-describedby="delete-photo-description"
        aria-labelledby="delete-photo-title"
        className="delete-dialog"
        onClose={() => window.setTimeout(() => triggerRef.current?.focus(), 0)}
      >
        <form action={formAction} className="delete-dialog-panel">
          <input type="hidden" name="photoId" value={photoId} />
          {state.status === "error" && state.message ? (
            <Alert tone="error" role="alert" className="text-sm">
              {state.message}
            </Alert>
          ) : null}
          <div>
            <p className="section-kicker">Permanent action</p>
            <h3 id="delete-photo-title" className="heading-section mt-1">
              Delete this photo?
            </h3>
            <p
              id="delete-photo-description"
              className="text-secondary mt-2 text-sm leading-6"
            >
              This permanently deletes {fileName} from private Storage and
              removes its photo record. This cannot be undone.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <DeleteButton />
          </div>
        </form>
      </dialog>
    </section>
  );
}
