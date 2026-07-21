"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createPetAction,
  type PetActionState,
  updatePetAction,
} from "@/app/actions/pets";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  EMPTY_PET_FORM_FIELDS,
  PET_SEX_VALUES,
  type PetFormFields,
} from "@/lib/pets/types";
import { formatPetSex } from "@/lib/pets/view";

type PetFormProps = {
  cancelHref: string;
  initialFields?: PetFormFields;
  mode: "create" | "edit";
  petId?: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : label}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-2 text-sm text-[var(--color-error)]" role="alert">
      {message}
    </p>
  );
}

function getFields(state: PetActionState, initialFields: PetFormFields) {
  return state.fields ?? initialFields;
}

export function PetForm({
  cancelHref,
  initialFields = EMPTY_PET_FORM_FIELDS,
  mode,
  petId,
}: PetFormProps) {
  const action = mode === "create" ? createPetAction : updatePetAction;
  const [state, formAction] = useActionState(action, {
    fields: initialFields,
    status: "idle",
  } satisfies PetActionState);
  const fields = getFields(state, initialFields);

  return (
    <form action={formAction} className="card pet-form space-y-5">
      {petId ? <input type="hidden" name="petId" value={petId} /> : null}
      {state.status === "error" && state.message ? (
        <Alert tone="error" role="alert" className="text-sm">
          {state.message}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="form-label">
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            className="input"
            defaultValue={fields.name}
            id="name"
            maxLength={80}
            name="name"
            required
          />
          <FieldError message={state.fieldErrors?.name} />
        </div>

        <div>
          <label htmlFor="sex" className="form-label">
            Sex <span aria-hidden="true">*</span>
          </label>
          <select
            className="input"
            defaultValue={fields.sex}
            id="sex"
            name="sex"
            required
          >
            {PET_SEX_VALUES.map((value) => (
              <option key={value} value={value}>
                {formatPetSex(value)}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.sex} />
        </div>
      </div>

      <div>
        <label htmlFor="birthDate" className="form-label">
          Birth date <span aria-hidden="true">*</span>
        </label>
        <input
          className="input"
          defaultValue={fields.birthDate}
          id="birthDate"
          name="birthDate"
          required
          type="date"
        />
        <p className="text-muted mt-2 text-sm">
          Used to calculate age. Enter the best known date.
        </p>
        <FieldError message={state.fieldErrors?.birthDate} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="favoriteFoods" className="form-label">
            Favorite foods
          </label>
          <input
            className="input"
            defaultValue={fields.favoriteFoods}
            id="favoriteFoods"
            maxLength={240}
            name="favoriteFoods"
            placeholder="Cilantro, romaine, bell pepper"
          />
          <FieldError message={state.fieldErrors?.favoriteFoods} />
        </div>

        <div>
          <label htmlFor="dislikedFoods" className="form-label">
            Disliked foods
          </label>
          <input
            className="input"
            defaultValue={fields.dislikedFoods}
            id="dislikedFoods"
            maxLength={240}
            name="dislikedFoods"
            placeholder="Foods they usually avoid"
          />
          <FieldError message={state.fieldErrors?.dislikedFoods} />
        </div>
      </div>

      <div>
        <label htmlFor="personalityNotes" className="form-label">
          Personality notes
        </label>
        <textarea
          className="input min-h-28"
          defaultValue={fields.personalityNotes}
          id="personalityNotes"
          maxLength={1200}
          name="personalityNotes"
          placeholder="Gentle, curious, shy around new sounds..."
        />
        <FieldError message={state.fieldErrors?.personalityNotes} />
      </div>

      <div>
        <label htmlFor="generalNotes" className="form-label">
          General notes
        </label>
        <textarea
          className="input min-h-28"
          defaultValue={fields.generalNotes}
          id="generalNotes"
          maxLength={1200}
          name="generalNotes"
          placeholder="Care preferences, routines, or reminders"
        />
        <FieldError message={state.fieldErrors?.generalNotes} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SubmitButton label={mode === "create" ? "Create pet" : "Save pet"} />
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
