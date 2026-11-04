"use client";

import { useActionState, useState } from "react";
import {
  reviewPhotoPredictionAction,
  type ClassificationActionState,
} from "@/app/actions/classification";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PetLabel, PhotoPredictionView } from "@/lib/ai/predictions";

const initialState: ClassificationActionState = { status: "idle" };

type LabelFormProps = {
  pets: PetLabel[];
  photoId: string;
  prediction: PhotoPredictionView | null;
  manual?: boolean;
};

export function ReviewPredictionForm(props: LabelFormProps) {
  return (
    <LabelForm
      key={`${props.photoId}:${props.prediction?.labels_revision ?? 0}`}
      {...props}
    />
  );
}

function LabelForm({
  pets,
  photoId,
  prediction,
  manual = false,
}: LabelFormProps) {
  const reviewed =
    prediction?.review_status === "confirmed" ||
    prediction?.review_status === "corrected";
  const initialPetIds = reviewed
    ? prediction.confirmed_pet_ids
    : manual
      ? []
      : (prediction?.suggested_pet_ids ?? []);
  const initialUnknown = reviewed
    ? prediction.confirmed_unknown
    : manual
      ? false
      : (prediction?.suggested_unknown ?? false);
  const [selected, setSelected] = useState(() => new Set(initialPetIds));
  const [unknown, setUnknown] = useState(initialUnknown);
  const [state, action, pending] = useActionState(
    reviewPhotoPredictionAction,
    initialState,
  );

  const revision = state.revision ?? prediction?.labels_revision ?? 0;

  return (
    <div className="review-controls">
      {prediction?.processing_status === "ready_for_review" &&
      prediction?.review_status === "pending_review" ? (
        <form action={action}>
          <input type="hidden" name="photoId" value={photoId} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="intent" value="confirm" />
          {prediction?.suggested_pet_ids.map((id) => (
            <input key={id} type="hidden" name="petIds" value={id} />
          ))}
          <input
            type="hidden"
            name="unknown"
            value={String(prediction?.suggested_unknown ?? false)}
          />
          <Button disabled={pending} type="submit">
            Confirm suggestion
          </Button>
        </form>
      ) : null}

      <form action={action} className="review-correction-form">
        <input type="hidden" name="photoId" value={photoId} />
        <input type="hidden" name="revision" value={revision} />
        <input type="hidden" name="intent" value="save" />
        <fieldset disabled={pending}>
          <legend>
            {manual
              ? "Who is in this photo?"
              : prediction?.review_status === "pending_review"
                ? "Correct the suggestion"
                : "Update confirmed pets"}
          </legend>
          <div className="review-pet-options">
            {pets.map((pet) => (
              <label key={pet.id}>
                <input
                  checked={selected.has(pet.id)}
                  name="petIds"
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(pet.id);
                    else next.delete(pet.id);
                    setSelected(next);
                    if (next.size > 0) setUnknown(false);
                  }}
                  type="checkbox"
                  value={pet.id}
                />
                <span>{pet.name}</span>
              </label>
            ))}
            <label>
              <input
                checked={unknown}
                name="unknown"
                onChange={(event) => {
                  setUnknown(event.target.checked);
                  if (event.target.checked) setSelected(new Set());
                }}
                type="checkbox"
                value="true"
              />
              <span>Unknown / none of these</span>
            </label>
          </div>
        </fieldset>
        <Button disabled={pending} type="submit" variant="secondary">
          {pending ? "Saving…" : manual ? "Save labels" : "Save review"}
        </Button>
      </form>

      {!manual && prediction?.review_status === "pending_review" ? (
        <form action={action}>
          <input type="hidden" name="photoId" value={photoId} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="intent" value="skip" />
          <Button disabled={pending} type="submit" variant="ghost">
            Skip for now
          </Button>
        </form>
      ) : null}

      {reviewed ? (
        <form action={action}>
          <input type="hidden" name="photoId" value={photoId} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="intent" value="clear" />
          <Button disabled={pending} type="submit" variant="ghost">
            Remove labels
          </Button>
        </form>
      ) : null}
      {manual ? (
        <p className="text-secondary text-sm">
          Choose multiple pets if needed. Unknown means no known pet; removing
          labels leaves the photo unlabeled. AI suggestions stay separate.
        </p>
      ) : null}

      {state.message ? (
        <Alert
          className="text-sm"
          role={state.status === "error" ? "alert" : "status"}
          tone={state.status === "error" ? "warning" : "success"}
        >
          {state.message}
        </Alert>
      ) : null}
    </div>
  );
}
