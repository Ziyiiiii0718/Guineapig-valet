"use server";

import { revalidatePath } from "next/cache";
import { getPublicEnvStatus } from "@/lib/env";
import { processPhotoClassification } from "@/lib/ai/photo-classification";
import { photoIdSchema } from "@/lib/photos/gallery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { petIdSchema } from "@/lib/validation/pets";

export type ClassificationActionState = {
  message?: string;
  resultId?: string;
  revision?: number;
  status: "idle" | "error" | "success";
};

async function getAuthenticatedUser() {
  if (!getPublicEnvStatus().isConfigured) {
    return {
      error: "Supabase is not configured yet.",
      supabase: null,
      user: null,
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user
    ? { error: null, supabase, user }
    : { error: "Please log in to manage photo labels.", supabase, user: null };
}

function revalidateClassificationPaths(photoId: string) {
  // Human labels also drive pet media, and the shared sidebar holds a review count.
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/photos");
  revalidatePath(`/photos/${photoId}`);
  revalidatePath("/review");
  revalidatePath("/pets/[id]", "page");
}

export async function analyzeUploadedPhotoAction(
  photoId: string,
): Promise<ClassificationActionState> {
  const parsedPhotoId = photoIdSchema.safeParse(photoId);
  if (!parsedPhotoId.success) {
    return { message: "We could not find that photo.", status: "error" };
  }
  const { error: authError, supabase, user } = await getAuthenticatedUser();
  if (authError || !supabase || !user) {
    return { message: authError ?? "Please log in.", status: "error" };
  }

  const { data: photo, error } = await supabase
    .from("photos")
    .select("id,user_id,storage_path,mime_type")
    .eq("id", parsedPhotoId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !photo || photo.user_id !== user.id) {
    return { message: "We could not find that photo.", status: "error" };
  }

  const result = await processPhotoClassification({
    photo,
    supabase,
    userId: user.id,
  });
  revalidateClassificationPaths(parsedPhotoId.data);

  if (result.status === "superseded") {
    return {
      message:
        "A newer analysis request replaced this one. Refresh to see its current state.",
      status: "error",
    };
  }
  if (result.status === "ready_for_review") {
    return {
      message: "AI analysis is ready for your review.",
      resultId: crypto.randomUUID(),
      status: "success",
    };
  }
  if (result.status === "insufficient_references") {
    return {
      message:
        "Add at least two ready reference photos for a pet, then try again.",
      status: "error",
    };
  }
  return {
    message:
      "AI analysis is unavailable right now. Your photo is safe; retry later.",
    status: "error",
  };
}

export async function analyzePhotoAction(
  _state: ClassificationActionState,
  formData: FormData,
): Promise<ClassificationActionState> {
  return analyzeUploadedPhotoAction(String(formData.get("photoId") ?? ""));
}

export async function reviewPhotoPredictionAction(
  _state: ClassificationActionState,
  formData: FormData,
): Promise<ClassificationActionState> {
  const photoId = photoIdSchema.safeParse(
    String(formData.get("photoId") ?? ""),
  );
  const intent = String(formData.get("intent") ?? "save");
  const revisionText = String(formData.get("revision") ?? "");
  const revision = Number(revisionText);
  if (
    !photoId.success ||
    !["confirm", "save", "skip", "clear"].includes(intent) ||
    !/^\d+$/.test(revisionText) ||
    !Number.isSafeInteger(revision) ||
    revision > 2147483647
  ) {
    return { message: "Refresh the photo and try again.", status: "error" };
  }
  const selectedPetIds = [...new Set(formData.getAll("petIds").map(String))];
  const unknown = formData.get("unknown") === "true";
  if (
    selectedPetIds.some((id) => !petIdSchema.safeParse(id).success) ||
    (["save", "confirm"].includes(intent)
      ? unknown
        ? selectedPetIds.length > 0
        : selectedPetIds.length === 0
      : unknown || selectedPetIds.length > 0)
  ) {
    return {
      message: "Choose one or more pets, or choose Unknown.",
      status: "error",
    };
  }
  const { error: authError, supabase, user } = await getAuthenticatedUser();
  if (authError || !supabase || !user) {
    return { message: authError ?? "Please log in.", status: "error" };
  }
  try {
    const { data, error } = await supabase
      .rpc("set_photo_labels", {
        target_photo_id: photoId.data,
        expected_revision: revision,
        label_pet_ids: selectedPetIds,
        label_unknown: unknown,
        label_intent: intent,
      })
      .returns<Array<{ outcome: string; revision: number }>>()
      .single();
    if (error || !data) {
      return {
        message: "We could not save these labels. Please try again.",
        status: "error",
      };
    }
    if (data.outcome === "conflict") {
      return {
        message:
          "Labels or the suggestion changed elsewhere. Refresh the photo before saving again.",
        status: "error",
      };
    }
    if (data.outcome !== "saved") {
      return {
        message: "The photo or selected pets are unavailable.",
        status: "error",
      };
    }
    revalidateClassificationPaths(photoId.data);
    return {
      message:
        intent === "clear"
          ? "Labels removed."
          : intent === "skip"
            ? "Review skipped."
            : intent === "confirm"
              ? "Suggestion confirmed."
              : "Labels saved.",
      revision: data.revision,
      resultId: crypto.randomUUID(),
      status: "success",
    };
  } catch {
    return {
      message: "We could not confirm the save. Please try again.",
      status: "error",
    };
  }
}
