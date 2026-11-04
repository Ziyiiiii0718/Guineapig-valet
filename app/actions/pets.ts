"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPublicEnvStatus } from "@/lib/env";
import {
  buildPetAvatarPath,
  getPetAvatarValidationError,
  isAllowedPetAvatarMimeType,
  isPetAvatarPathForPet,
  PET_AVATAR_BUCKET,
} from "@/lib/pets/avatar";
import { isOwnedByAuthenticatedUser } from "@/lib/pets/ownership";
import { EMPTY_PET_FORM_FIELDS, type PetFormFields } from "@/lib/pets/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  formDataToPetFields,
  petFormSchema,
  petFormValuesToFields,
  petIdSchema,
} from "@/lib/validation/pets";

export type PetActionState = {
  fieldErrors?: Partial<Record<keyof PetFormFields | "confirmName", string>>;
  fields?: PetFormFields & { confirmName?: string; petId?: string };
  message?: string;
  status: "idle" | "error";
};

export type PetAvatarActionState = {
  message?: string;
  revision?: number;
  status: "idle" | "error" | "success";
};

export type PetAvatarUploadInput = {
  petId: string;
  expectedRevision: number;
  mimeType: string;
  size: number;
};

function validationErrorState(
  formData: FormData,
  message = "Check the highlighted fields and try again.",
): PetActionState {
  const parsed = petFormSchema.safeParse(formDataToPetFields(formData));

  if (parsed.success) {
    return {
      fields: petFormValuesToFields(parsed.data),
      message,
      status: "error",
    };
  }

  const flattened = parsed.error.flatten().fieldErrors;

  return {
    fieldErrors: {
      birthDate: flattened.birthDate?.[0],
      dislikedFoods: flattened.dislikedFoods?.[0],
      favoriteFoods: flattened.favoriteFoods?.[0],
      generalNotes: flattened.generalNotes?.[0],
      name: flattened.name?.[0],
      personalityNotes: flattened.personalityNotes?.[0],
      sex: flattened.sex?.[0],
    },
    fields: formDataToPetFields(formData),
    message,
    status: "error",
  };
}

function databaseErrorMessage(errorCode?: string) {
  if (errorCode === "23505") {
    return "You already have a pet with that name.";
  }

  return "We could not save this pet profile. Please try again.";
}

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

  if (!user) {
    return {
      error: "Please log in to manage pet profiles.",
      supabase,
      user: null,
    };
  }

  return { error: null, supabase, user };
}

async function getOwnedPetForMutation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  petId: string,
  userId: string,
) {
  const { data: pet, error } = await supabase
    .from("pets")
    .select("id,name,profile_photo_path,user_id,avatar_revision")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !pet || !isOwnedByAuthenticatedUser(pet.user_id, userId)) {
    return null;
  }

  return pet;
}

export async function createPetAction(
  _previousState: PetActionState,
  formData: FormData,
): Promise<PetActionState> {
  const parsed = petFormSchema.safeParse(formDataToPetFields(formData));

  if (!parsed.success) {
    return validationErrorState(formData);
  }

  const { error: authError, supabase, user } = await getAuthenticatedUser();

  if (authError || !supabase || !user) {
    return {
      fields: formDataToPetFields(formData),
      message: authError ?? "Please log in to manage pet profiles.",
      status: "error",
    };
  }

  const { data, error } = await supabase
    .from("pets")
    .insert({
      birth_date: parsed.data.birthDate,
      disliked_foods: parsed.data.dislikedFoods,
      favorite_foods: parsed.data.favoriteFoods,
      general_notes: parsed.data.generalNotes,
      name: parsed.data.name,
      personality_notes: parsed.data.personalityNotes,
      sex: parsed.data.sex,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return {
      fields: petFormValuesToFields(parsed.data),
      message: databaseErrorMessage(error?.code),
      status: "error",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/pets");
  redirect(`/pets/${data.id}?message=created`);
}

export async function updatePetAction(
  _previousState: PetActionState,
  formData: FormData,
): Promise<PetActionState> {
  const petId = String(formData.get("petId") ?? "");
  const parsedPetId = petIdSchema.safeParse(petId);
  const parsed = petFormSchema.safeParse(formDataToPetFields(formData));

  if (!parsedPetId.success) {
    return {
      fields: { ...formDataToPetFields(formData), petId },
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  if (!parsed.success) {
    return {
      ...validationErrorState(formData),
      fields: { ...formDataToPetFields(formData), petId },
    };
  }

  const { error: authError, supabase, user } = await getAuthenticatedUser();

  if (authError || !supabase || !user) {
    return {
      fields: { ...formDataToPetFields(formData), petId },
      message: authError ?? "Please log in to manage pet profiles.",
      status: "error",
    };
  }

  const { data: existingPet, error: readError } = await supabase
    .from("pets")
    .select("id,user_id")
    .eq("id", parsedPetId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    readError ||
    !existingPet ||
    !isOwnedByAuthenticatedUser(existingPet.user_id, user.id)
  ) {
    return {
      fields: { ...petFormValuesToFields(parsed.data), petId },
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  const { error } = await supabase
    .from("pets")
    .update({
      birth_date: parsed.data.birthDate,
      disliked_foods: parsed.data.dislikedFoods,
      favorite_foods: parsed.data.favoriteFoods,
      general_notes: parsed.data.generalNotes,
      name: parsed.data.name,
      personality_notes: parsed.data.personalityNotes,
      sex: parsed.data.sex,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsedPetId.data)
    .eq("user_id", user.id);

  if (error) {
    return {
      fields: { ...petFormValuesToFields(parsed.data), petId },
      message: databaseErrorMessage(error.code),
      status: "error",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/pets");
  revalidatePath(`/pets/${parsedPetId.data}`);
  redirect(`/pets/${parsedPetId.data}?message=updated`);
}

function validAvatarRevision(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 2147483647;
}

function revalidateAvatarPaths(petId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/pets");
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/edit`);
}

export async function initializePetAvatarUploadAction(
  input: PetAvatarUploadInput,
): Promise<PetAvatarActionState & { path?: string; token?: string }> {
  const validation = getPetAvatarValidationError({
    size: input.size,
    type: input.mimeType,
  });
  if (
    !petIdSchema.safeParse(input.petId).success ||
    !validAvatarRevision(input.expectedRevision)
  ) {
    return {
      status: "error",
      message: "Refresh the pet profile and try again.",
    };
  }
  if (validation || !isAllowedPetAvatarMimeType(input.mimeType)) {
    return {
      status: "error",
      message: validation ?? "Unsupported avatar type.",
    };
  }
  try {
    const { error, supabase, user } = await getAuthenticatedUser();
    if (error || !supabase || !user)
      return { status: "error", message: error ?? "Please log in." };
    const pet = await getOwnedPetForMutation(supabase, input.petId, user.id);
    if (!pet)
      return {
        status: "error",
        message: "We could not find that pet profile.",
      };
    if (pet.avatar_revision !== input.expectedRevision)
      return {
        status: "error",
        message:
          "The profile photo changed elsewhere. Refresh before uploading.",
      };
    const path = buildPetAvatarPath({
      userId: user.id,
      petId: input.petId,
      uniqueId: crypto.randomUUID(),
      mimeType: input.mimeType,
    });
    const result = await supabase.storage
      .from(PET_AVATAR_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (result.error || !result.data?.token)
      return {
        status: "error",
        message: "We could not prepare the upload. Please try again.",
      };
    return { status: "success", path, token: result.data.token };
  } catch {
    return {
      status: "error",
      message: "We could not prepare the upload. Please try again.",
    };
  }
}

async function savePetAvatar(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  petId: string,
  expectedRevision: number,
  path: string | null,
): Promise<PetAvatarActionState> {
  const { data, error } = await supabase
    .rpc("set_pet_avatar", {
      target_pet_id: petId,
      expected_revision: expectedRevision,
      target_avatar_path: path,
    })
    .returns<Array<{ outcome: string; revision: number }>>()
    .single();
  if (error || !data)
    return {
      status: "error",
      message: "We could not confirm the profile photo change. Please retry.",
    };
  if (data.outcome === "conflict")
    return {
      status: "error",
      message:
        "The profile photo changed elsewhere. Refresh before trying again.",
    };
  if (data.outcome !== "saved")
    return { status: "error", message: "We could not find that pet profile." };
  revalidateAvatarPaths(petId);
  return {
    status: "success",
    revision: data.revision,
    message: path
      ? "Profile photo updated."
      : "Profile photo removed. The fallback avatar is back.",
  };
}

export async function finalizePetAvatarUploadAction(
  input: PetAvatarUploadInput & { path: string },
): Promise<PetAvatarActionState> {
  const validation = getPetAvatarValidationError({
    size: input.size,
    type: input.mimeType,
  });
  if (
    !petIdSchema.safeParse(input.petId).success ||
    !validAvatarRevision(input.expectedRevision) ||
    validation
  ) {
    return { status: "error", message: validation ?? "Invalid avatar upload." };
  }
  try {
    const { error, supabase, user } = await getAuthenticatedUser();
    if (error || !supabase || !user)
      return { status: "error", message: error ?? "Please log in." };
    if (!isPetAvatarPathForPet(input.path, user.id, input.petId))
      return { status: "error", message: "Invalid avatar upload path." };
    const pet = await getOwnedPetForMutation(supabase, input.petId, user.id);
    if (!pet)
      return {
        status: "error",
        message: "We could not find that pet profile.",
      };
    // Verify the object exists and validate Storage's metadata, not just the
    // browser claim. No image bytes pass through a Server Action request.
    const { data: object, error: objectError } = await supabase.storage
      .from(PET_AVATAR_BUCKET)
      .info(input.path);
    if (
      objectError ||
      !object ||
      object.size !== input.size ||
      object.contentType !== input.mimeType ||
      getPetAvatarValidationError({
        size: object.size ?? 0,
        type: object.contentType ?? "",
      })
    ) {
      return {
        status: "error",
        message:
          "The upload is incomplete or invalid. Retry, or select the image again.",
      };
    }
    // Never delete on success or failure: this path may already be active,
    // and a reference check followed by deletion would still have a race.
    return await savePetAvatar(
      supabase,
      input.petId,
      input.expectedRevision,
      input.path,
    );
  } catch {
    return {
      status: "error",
      message: "We could not confirm the upload. Please retry.",
    };
  }
}

export async function removePetAvatarAction(
  _previousState: PetAvatarActionState,
  formData: FormData,
): Promise<PetAvatarActionState> {
  const petId = String(formData.get("petId") ?? "");
  const revisionText = String(formData.get("revision") ?? "");
  const revision = Number(revisionText);
  if (
    !petIdSchema.safeParse(petId).success ||
    !/^\d+$/.test(revisionText) ||
    !validAvatarRevision(revision)
  ) {
    return {
      status: "error",
      message: "Refresh the pet profile and try again.",
    };
  }
  try {
    const { error, supabase, user } = await getAuthenticatedUser();
    if (error || !supabase || !user)
      return { status: "error", message: error ?? "Please log in." };
    return await savePetAvatar(supabase, petId, revision, null);
  } catch {
    return {
      status: "error",
      message: "We could not confirm removal. Please retry.",
    };
  }
}

export async function deletePetAction(
  _previousState: PetActionState,
  formData: FormData,
): Promise<PetActionState> {
  const petId = String(formData.get("petId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const parsedPetId = petIdSchema.safeParse(petId);

  if (!parsedPetId.success) {
    return {
      fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  const { error: authError, supabase, user } = await getAuthenticatedUser();

  if (authError || !supabase || !user) {
    return {
      fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
      message: authError ?? "Please log in to manage pet profiles.",
      status: "error",
    };
  }

  type PetDeletionResult = {
    outcome: "deleted" | "absent" | "confirmation_required";
    avatar_path: string | null;
  };
  let deletion: PetDeletionResult;
  try {
    // Name confirmation, label changes and FK cascades commit together. Never
    // fall back to the former multi-request flow if migration 0011 is absent.
    const { data, error } = await supabase
      .rpc("delete_pet_transaction", {
        target_pet_id: parsedPetId.data,
        confirmation_name: confirmName,
      })
      .returns<PetDeletionResult[]>()
      .single();
    if (error || !data) {
      return {
        fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
        message: "We could not confirm pet deletion. Please try again.",
        status: "error",
      };
    }
    deletion = data;
  } catch {
    return {
      fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
      message: "We could not confirm pet deletion. Please try again.",
      status: "error",
    };
  }

  if (deletion.outcome === "confirmation_required") {
    return {
      fieldErrors: {
        confirmName: "Type the pet name exactly to confirm deletion.",
      },
      fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
      message: "Deletion was not confirmed.",
      status: "error",
    };
  }
  if (deletion.outcome !== "deleted" && deletion.outcome !== "absent") {
    return {
      message: "We could not confirm pet deletion. Please try again.",
      status: "error",
    };
  }

  // Retain private avatar bytes. Deleting a path here could race with a
  // replacement/finalization or another record referencing the same object.
  // Reclamation requires a separately coordinated Storage cleanup lifecycle.

  revalidatePath("/dashboard");
  revalidatePath("/pets");
  revalidatePath("/pets/[id]", "page");
  revalidatePath("/photos");
  revalidatePath("/photos/[id]", "page");
  revalidatePath("/review");
  revalidatePath("/", "layout");
  redirect("/pets?message=deleted");
}
