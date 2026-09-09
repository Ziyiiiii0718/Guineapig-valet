"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  removeReferencePhotoAction,
  retryReferenceEmbeddingAction,
  type ReferenceActionState,
} from "@/app/actions/references";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      disabled={pending}
      className="text-sm"
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ReferencePhotoActions({
  petId,
  referenceId,
  showRetry,
}: {
  petId: string;
  referenceId: string;
  showRetry: boolean;
}) {
  const [removeState, removeAction] = useActionState(
    removeReferencePhotoAction,
    { status: "idle" } satisfies ReferenceActionState,
  );
  const [retryState, retryAction] = useActionState(
    retryReferenceEmbeddingAction,
    { status: "idle" } satisfies ReferenceActionState,
  );
  const state = retryState.status !== "idle" ? retryState : removeState;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1">
        {showRetry ? (
          <form action={retryAction}>
            <input type="hidden" name="petId" value={petId} />
            <input type="hidden" name="referenceId" value={referenceId} />
            <SubmitButton label="Retry" pendingLabel="Retrying..." />
          </form>
        ) : null}
        <form action={removeAction}>
          <input type="hidden" name="petId" value={petId} />
          <input type="hidden" name="referenceId" value={referenceId} />
          <SubmitButton
            label="Remove from references"
            pendingLabel="Removing..."
          />
        </form>
      </div>
      {state.status !== "idle" && state.message ? (
        <Alert
          className="mt-2 text-sm"
          role="status"
          tone={state.status === "error" ? "error" : "success"}
        >
          {state.message}
        </Alert>
      ) : null}
    </div>
  );
}
