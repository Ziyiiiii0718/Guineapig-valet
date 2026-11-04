"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getPetAvatarValidationError,
  PET_AVATAR_BUCKET,
} from "@/lib/pets/avatar";
import {
  removePetAvatarAction,
  type PetAvatarActionState,
  initializePetAvatarUploadAction,
  finalizePetAvatarUploadAction,
} from "@/app/actions/pets";
import { PetAvatar } from "@/components/pets/pet-avatar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PetAvatarFormProps = {
  avatarUrl?: string | null;
  avatarRevision: number;
  hasAvatar: boolean;
  petId: string;
  petName: string;
};

const initialState: PetAvatarActionState = {
  status: "idle",
};

export function PetAvatarForm({
  avatarUrl,
  avatarRevision,
  hasAvatar,
  petId,
  petName,
}: PetAvatarFormProps) {
  const router = useRouter();
  const [uploadState, setUploadState] = useState(initialState);
  const [removeState, setRemoveState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const prepared = useRef<{ file: File; path: string; token: string } | null>(
    null,
  );

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const file = new FormData(event.currentTarget).get("avatar");
    const validation = getPetAvatarValidationError(
      file instanceof File ? file : null,
    );
    if (validation || !(file instanceof File)) {
      setUploadState({
        status: "error",
        message: validation ?? "Choose an image.",
      });
      return;
    }
    busy.current = true;
    setPending(true);
    const input = {
      petId,
      expectedRevision: avatarRevision,
      mimeType: file.type,
      size: file.size,
    };
    try {
      if (!prepared.current) {
        const result = await initializePetAvatarUploadAction(input);
        if (result.status !== "success" || !result.path || !result.token) {
          setUploadState(result);
          return;
        }
        prepared.current = { file, path: result.path, token: result.token };
      }
      const { path, token } = prepared.current;
      // A failed response can still mean the bytes arrived. Finalization checks Storage.
      try {
        await createSupabaseBrowserClient()
          .storage.from(PET_AVATAR_BUCKET)
          .uploadToSignedUrl(path, token, file, { contentType: file.type });
      } catch {
        /* Verify the object before deciding whether the upload failed. */
      }
      const result = await finalizePetAvatarUploadAction({ ...input, path });
      setUploadState(result);
      if (result.status === "success") router.refresh();
    } catch {
      setUploadState({
        status: "error",
        message:
          "Upload could not be confirmed. Retry with the same image, or refresh to check your profile.",
      });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await removePetAvatarAction(
        initialState,
        new FormData(event.currentTarget),
      );
      setRemoveState(result);
      if (result.status === "success") router.refresh();
    } catch {
      setRemoveState({
        status: "error",
        message: "Removal could not be confirmed. Please retry.",
      });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

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
        <form onSubmit={upload} className="avatar-upload-form">
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
            disabled={pending}
            onChange={() => {
              prepared.current = null;
            }}
            type="file"
          />
          <div className="mt-3">
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving..."
                : hasAvatar
                  ? "Replace photo"
                  : "Upload photo"}
            </Button>
          </div>
        </form>

        {hasAvatar ? (
          <form onSubmit={remove} className="avatar-remove-form">
            <input type="hidden" name="petId" value={petId} />
            <input type="hidden" name="revision" value={avatarRevision} />
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Saving..." : "Remove photo"}
            </Button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
