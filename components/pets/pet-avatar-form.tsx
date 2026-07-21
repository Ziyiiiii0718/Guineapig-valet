"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  removePetAvatarAction,
  type PetAvatarActionState,
  uploadPetAvatarAction,
} from "@/app/actions/pets";
import { PetAvatar } from "@/components/pets/pet-avatar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PetAvatarFormProps = {
  avatarUrl?: string | null;
  petId: string;
  petName: string;
};

const initialState: PetAvatarActionState = {
  status: "idle",
};

function UploadButton({ hasAvatar }: { hasAvatar: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Uploading..." : hasAvatar ? "Replace photo" : "Upload photo"}
    </Button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Removing..." : "Remove photo"}
    </Button>
  );
}

export function PetAvatarForm({
  avatarUrl,
  petId,
  petName,
}: PetAvatarFormProps) {
  const [uploadState, uploadFormAction] = useActionState(
    uploadPetAvatarAction,
    initialState,
  );
  const [removeState, removeFormAction] = useActionState(
    removePetAvatarAction,
    initialState,
  );
  const hasAvatar = Boolean(avatarUrl);

  return (
    <section className="card avatar-manager" aria-labelledby="avatar-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PetAvatar
            className="pet-avatar-large"
            name={petName}
            src={avatarUrl}
          />
          <div>
            <h2 id="avatar-title" className="heading-section">
              Profile photo
            </h2>
            <p className="text-secondary mt-1 text-sm leading-6">
              Private avatar image for this pet. JPEG, PNG, or WEBP, up to 5 MB.
            </p>
          </div>
        </div>
      </div>

      {uploadState.status === "error" && uploadState.message ? (
        <Alert tone="error" role="alert" className="mt-4 text-sm">
          {uploadState.message}
        </Alert>
      ) : null}
      {removeState.status === "error" && removeState.message ? (
        <Alert tone="error" role="alert" className="mt-4 text-sm">
          {removeState.message}
        </Alert>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <form action={uploadFormAction} className="avatar-upload-form">
          <input type="hidden" name="petId" value={petId} />
          <label htmlFor="avatar" className="form-label">
            {hasAvatar ? "Choose replacement image" : "Choose profile image"}
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="input"
            id="avatar"
            name="avatar"
            required
            type="file"
          />
          <div className="mt-3">
            <UploadButton hasAvatar={hasAvatar} />
          </div>
        </form>

        {hasAvatar ? (
          <form action={removeFormAction} className="avatar-remove-form">
            <input type="hidden" name="petId" value={petId} />
            <RemoveButton />
          </form>
        ) : null}
      </div>
    </section>
  );
}
