"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  removePhotoFromAlbumAction,
  type AlbumActionState,
} from "@/app/actions/albums";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Removing..." : "Remove from album"}
    </Button>
  );
}
export function RemovePhotoFromAlbumForm({
  albumId,
  photoId,
}: {
  albumId: string;
  photoId: string;
}) {
  const [state, action] = useActionState(removePhotoFromAlbumAction, {
    status: "idle",
  } satisfies AlbumActionState);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="albumId" value={albumId} />
      <input type="hidden" name="photoId" value={photoId} />
      <Submit />
      {state.status !== "idle" && state.message ? (
        <Alert
          className="mt-2 text-sm"
          tone={state.status === "error" ? "error" : "success"}
          role="status"
        >
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
