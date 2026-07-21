"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { deletePetAction, type PetActionState } from "@/app/actions/pets";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type DeletePetFormProps = {
  petId: string;
  petName: string;
};

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Deleting..." : "Confirm delete"}
    </Button>
  );
}

export function DeletePetForm({ petId, petName }: DeletePetFormProps) {
  const [state, formAction] = useActionState(deletePetAction, {
    status: "idle",
  } satisfies PetActionState);
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
    <section className="danger-zone" aria-labelledby="danger-zone-title">
      <div>
        <h2 id="danger-zone-title" className="heading-section">
          Danger zone
        </h2>
        <p className="text-secondary mt-1 text-sm leading-6">
          Delete this pet only when you are sure it should be permanently
          removed.
        </p>
      </div>
      <Button
        ref={triggerRef}
        type="button"
        variant="danger"
        onClick={openDialog}
      >
        Delete pet
      </Button>

      <dialog
        ref={dialogRef}
        aria-describedby="delete-pet-description"
        aria-labelledby="delete-pet-title"
        className="delete-dialog"
        onClose={() => window.setTimeout(() => triggerRef.current?.focus(), 0)}
      >
        <form action={formAction} className="delete-dialog-panel">
          <input type="hidden" name="petId" value={petId} />
          {state.status === "error" && state.message ? (
            <Alert tone="error" role="alert" className="text-sm">
              {state.message}
            </Alert>
          ) : null}
          <div>
            <p className="section-kicker">Permanent action</p>
            <h3 id="delete-pet-title" className="heading-section mt-1">
              Delete {petName}?
            </h3>
            <p
              id="delete-pet-description"
              className="text-secondary mt-2 text-sm leading-6"
            >
              This cannot be undone. Pet reference photos, future weight
              records, future health records, and this pet&apos;s avatar object
              are removed where applicable. General photo library records are
              not deleted.
            </p>
          </div>
          <label htmlFor="confirmName" className="form-label">
            Type {petName} to confirm
          </label>
          <input
            className="input"
            defaultValue={state.fields?.confirmName ?? ""}
            id="confirmName"
            name="confirmName"
            required
          />
          {state.fieldErrors?.confirmName ? (
            <p className="text-sm text-[var(--color-error)]" role="alert">
              {state.fieldErrors.confirmName}
            </p>
          ) : null}
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
