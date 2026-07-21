"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPublicEnvStatus } from "@/lib/env";
import {
  buildPetAvatarPath,
  getPetAvatarValidationError,
  isAllowedPetAvatarMimeType,
  isPetAvatarPathForUser,
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
  status: "idle" | "error";
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
    .select("id,name,profile_photo_path,user_id")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !pet || !isOwnedByAuthenticatedUser(pet.user_id, userId)) {
    return null;
  }

  return pet;
}

async function removePetAvatarObject(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  path: string | null,
  userId: string,
) {
  if (!path || !isPetAvatarPathForUser(path, userId)) {
    return;
  }

  await supabase.storage.from(PET_AVATAR_BUCKET).remove([path]);
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

export async function uploadPetAvatarAction(
  _previousState: PetAvatarActionState,
  formData: FormData,
): Promise<PetAvatarActionState> {
  const petId = String(formData.get("petId") ?? "");
  const parsedPetId = petIdSchema.safeParse(petId);

  if (!parsedPetId.success) {
    return {
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  const file = formData.get("avatar");

  if (!(file instanceof File)) {
    return {
      message: "Choose a JPEG, PNG, or WEBP image.",
      status: "error",
    };
  }

  const validationError = getPetAvatarValidationError(file);

  if (validationError || !isAllowedPetAvatarMimeType(file.type)) {
    return {
      message: validationError ?? "Avatar must be a JPEG, PNG, or WEBP image.",
      status: "error",
    };
  }

  const { error: authError, supabase, user } = await getAuthenticatedUser();

  if (authError || !supabase || !user) {
    return {
      message: authError ?? "Please log in to manage pet profiles.",
      status: "error",
    };
  }

  const pet = await getOwnedPetForMutation(supabase, parsedPetId.data, user.id);

  if (!pet) {
    return {
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  const avatarPath = buildPetAvatarPath({
    mimeType: file.type,
    petId: pet.id,
    uniqueId: crypto.randomUUID(),
    userId: user.id,
  });

  const { error: uploadError } = await supabase.storage
    .from(PET_AVATAR_BUCKET)
    .upload(avatarPath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      message: "We could not upload that profile photo. Please try again.",
      status: "error",
    };
  }

  const { error: updateError } = await supabase
    .from("pets")
    .update({
      profile_photo_path: avatarPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pet.id)
    .eq("user_id", user.id);

  if (updateError) {
    await removePetAvatarObject(supabase, avatarPath, user.id);

    return {
      message: "We could not save that profile photo. Please try again.",
      status: "error",
    };
  }

  if (pet.profile_photo_path !== avatarPath) {
    await removePetAvatarObject(supabase, pet.profile_photo_path, user.id);
  }

  revalidatePath("/dashboard");
  revalidatePath("/pets");
  revalidatePath(`/pets/${pet.id}`);
  revalidatePath(`/pets/${pet.id}/edit`);
  redirect(`/pets/${pet.id}/edit?message=avatar-updated`);
}

export async function removePetAvatarAction(
  _previousState: PetAvatarActionState,
  formData: FormData,
): Promise<PetAvatarActionState> {
  const petId = String(formData.get("petId") ?? "");
  const parsedPetId = petIdSchema.safeParse(petId);

  if (!parsedPetId.success) {
    return {
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  const { error: authError, supabase, user } = await getAuthenticatedUser();

  if (authError || !supabase || !user) {
    return {
      message: authError ?? "Please log in to manage pet profiles.",
      status: "error",
    };
  }

  const pet = await getOwnedPetForMutation(supabase, parsedPetId.data, user.id);

  if (!pet) {
    return {
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  const oldPath = pet.profile_photo_path;
  const { error: updateError } = await supabase
    .from("pets")
    .update({
      profile_photo_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pet.id)
    .eq("user_id", user.id);

  if (updateError) {
    return {
      message: "We could not remove that profile photo. Please try again.",
      status: "error",
    };
  }

  await removePetAvatarObject(supabase, oldPath, user.id);

  revalidatePath("/dashboard");
  revalidatePath("/pets");
  revalidatePath(`/pets/${pet.id}`);
  revalidatePath(`/pets/${pet.id}/edit`);
  redirect(`/pets/${pet.id}/edit?message=avatar-removed`);
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

  const { data: pet, error: readError } = await supabase
    .from("pets")
    .select("id,name,profile_photo_path,user_id")
    .eq("id", parsedPetId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError || !pet || !isOwnedByAuthenticatedUser(pet.user_id, user.id)) {
    return {
      fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
      message: "We could not find that pet profile.",
      status: "error",
    };
  }

  if (confirmName !== pet.name) {
    return {
      fieldErrors: {
        confirmName: "Type the pet name exactly to confirm deletion.",
      },
      fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
      message: "Deletion was not confirmed.",
      status: "error",
    };
  }

  const { error } = await supabase
    .from("pets")
    .delete()
    .eq("id", parsedPetId.data)
    .eq("user_id", user.id);

  if (error) {
    return {
      fields: { ...EMPTY_PET_FORM_FIELDS, confirmName, petId },
      message: "We could not delete this pet profile. Please try again.",
      status: "error",
    };
  }

  await removePetAvatarObject(supabase, pet.profile_photo_path, user.id);

  revalidatePath("/dashboard");
  revalidatePath("/pets");
  redirect("/pets?message=deleted");
}
