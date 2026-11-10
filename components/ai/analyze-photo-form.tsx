"use client";

import { useActionState } from "react";
import {
  analyzePhotoAction,
  type ClassificationActionState,
} from "@/app/actions/classification";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initialState: ClassificationActionState = { status: "idle" };

export function AnalyzePhotoForm({
  label = "Analyze photo",
  photoId,
}: {
  label?: string;
  photoId: string;
}) {
  const [state, action, pending] = useActionState(
    analyzePhotoAction,
    initialState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="photoId" value={photoId} />
      <Button disabled={pending} type="submit" variant="secondary">
        {pending ? "Analyzing…" : label}
      </Button>
      {state.message ? (
        <Alert
          className="text-sm"
          role={state.status === "error" ? "alert" : "status"}
          tone={state.status === "error" ? "warning" : "success"}
        >
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
