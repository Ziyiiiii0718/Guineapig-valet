"use server";

import { revalidatePath } from "next/cache";
import { getPublicEnvStatus } from "@/lib/env";
import {
  AiEmbeddingError,
  type EmbeddingErrorCategory,
} from "@/lib/ai/embedding";
import { requestImageEmbedding } from "@/lib/ai/client";
import { isUserPhotoPathForUser, USER_PHOTO_BUCKET } from "@/lib/photos/upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseReferenceSelection,
  referenceIdSchema,
} from "@/lib/references/validation";
import { petIdSchema } from "@/lib/validation/pets";

export type ReferenceActionState = {
  message?: string;
  resultId?: string;
  status: "idle" | "error" | "success";
};

type OwnedPhoto = {
  id: string;
  mime_type: string | null;
  storage_path: string;
  user_id: string;
};

type ReferenceRecord = {
  id: string;
  photo_id: string;
};

type ReferenceAddErrorCategory =
  | "AUTH_REQUIRED"
  | "INVALID_PET_ID"
  | "NO_PHOTOS_SELECTED"
  | "PET_NOT_OWNED"
  | "PHOTO_NOT_OWNED"
  | "MIGRATION_MISSING"
  | "RLS_DENIED"
  | "DUPLICATE_REFERENCE"
  | "FOREIGN_KEY_VIOLATION"
  | "CHECK_CONSTRAINT_VIOLATION"
  | "DATABASE_INSERT_FAILED";

type DatabaseError = {
  code?: string;
  message?: string;
};

const PROCESSING_CONCURRENCY = 2;
const STORED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function categorizeReferenceDatabaseError(
  error: DatabaseError | null | undefined,
): ReferenceAddErrorCategory {
  const code = error?.code ?? "UNKNOWN";
  const message = error?.message?.toLowerCase() ?? "";

  if (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42703" ||
    code === "42P01" ||
    message.includes("schema cache") ||
    (message.includes("column") && message.includes("does not exist"))
  ) {
    return "MIGRATION_MISSING";
  }
  if (code === "42501") return "RLS_DENIED";
  if (code === "23505") return "DUPLICATE_REFERENCE";
  if (code === "23503") return "FOREIGN_KEY_VIOLATION";
  if (code === "23514") return "CHECK_CONSTRAINT_VIOLATION";
  return "DATABASE_INSERT_FAILED";
}

function logReferenceAdd(key: string, value: boolean | number | string) {
  console.info(`[reference-add] ${key}=${String(value)}`);
}

function logReferenceDatabaseError(
  error: DatabaseError | null | undefined,
  operation: string,
) {
  logReferenceAdd("REFERENCE_ADD_DB_OPERATION", operation);
  logReferenceAdd("REFERENCE_ADD_DB_ERROR_CODE", error?.code ?? "UNKNOWN");
  logReferenceAdd(
    "REFERENCE_ADD_ERROR_CATEGORY",
    categorizeReferenceDatabaseError(error),
  );
}

async function getAuthenticatedReferenceUser() {
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
    : {
        error: "Please log in to manage reference photos.",
        supabase,
        user: null,
      };
}

async function findOwnedPet(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  petId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("pets")
    .select("id,user_id")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();
  return {
    error,
    pet: !error && data?.user_id === userId ? data : null,
  };
}

async function setReferenceFailed(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  referenceId: string,
  userId: string,
  category: EmbeddingErrorCategory,
) {
  await supabase
    .from("pet_reference_photos")
    .update({
      embedding: null,
      embedding_dimension: null,
      embedding_error_category: category,
      embedding_model: null,
      embedding_status: "failed",
      embedding_version: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", referenceId)
    .eq("user_id", userId);
}

export async function processReferenceEmbedding({
  photo,
  referenceId,
  supabase,
  userId,
}: {
  photo: OwnedPhoto;
  referenceId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
}) {
  if (
    photo.user_id !== userId ||
    !isUserPhotoPathForUser(photo.storage_path, userId) ||
    !photo.mime_type ||
    !STORED_IMAGE_MIME_TYPES.has(photo.mime_type)
  ) {
    await setReferenceFailed(supabase, referenceId, userId, "invalid_image");
    return { category: "invalid_image" as const, status: "failed" as const };
  }

  const { error: processingError } = await supabase
    .from("pet_reference_photos")
    .update({
      embedding_error_category: null,
      embedding_status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", referenceId)
    .eq("user_id", userId);
  if (processingError) {
    return { category: "inference_failed" as const, status: "failed" as const };
  }

  try {
    const { data: image, error: downloadError } = await supabase.storage
      .from(USER_PHOTO_BUCKET)
      .download(photo.storage_path);
    if (downloadError || !image) {
      throw new AiEmbeddingError(
        "invalid_image",
        "The private image could not be read.",
      );
    }

    const embedding = await requestImageEmbedding({
      bytes: new Uint8Array(await image.arrayBuffer()),
      mimeType: photo.mime_type,
    });
    const { error: updateError } = await supabase
      .from("pet_reference_photos")
      .update({
        embedding: embedding.embedding,
        embedding_dimension: embedding.dimension,
        embedding_error_category: null,
        embedding_model: embedding.model,
        embedding_status: "ready",
        embedding_version: embedding.version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", referenceId)
      .eq("user_id", userId);
    if (updateError) {
      throw new AiEmbeddingError(
        "inference_failed",
        "The embedding could not be saved.",
      );
    }
    return { category: null, status: "ready" as const };
  } catch (error) {
    const category =
      error instanceof AiEmbeddingError ? error.category : "inference_failed";
    await setReferenceFailed(supabase, referenceId, userId, category);
    console.warn("[ai-reference]", { category });
    return { category, status: "failed" as const };
  }
}

async function processWithBoundedConcurrency({
  photos,
  references,
  supabase,
  userId,
}: {
  photos: OwnedPhoto[];
  references: ReferenceRecord[];
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
}) {
  const photosById = new Map(photos.map((photo) => [photo.id, photo]));
  const queue = [...references];
  const results: Array<{ status: "ready" | "failed" }> = [];
  const workers = Array.from(
    { length: Math.min(PROCESSING_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length > 0) {
        const reference = queue.shift();
        if (!reference) break;
        const photo = photosById.get(reference.photo_id);
        if (!photo) {
          await setReferenceFailed(
            supabase,
            reference.id,
            userId,
            "invalid_image",
          );
          results.push({ status: "failed" });
          continue;
        }
        results.push(
          await processReferenceEmbedding({
            photo,
            referenceId: reference.id,
            supabase,
            userId,
          }),
        );
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function revalidateReferencePaths(petId: string) {
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/references`);
}

export async function addReferencePhotosAction(
  _state: ReferenceActionState,
  formData: FormData,
): Promise<ReferenceActionState> {
  const parsed = parseReferenceSelection(formData);
  const petIdValid = petIdSchema.safeParse(
    String(formData.get("petId") ?? ""),
  ).success;
  const selectedCount = formData.getAll("photoIds").length;
  logReferenceAdd("REFERENCE_ADD_PET_ID_VALID", petIdValid);
  logReferenceAdd("REFERENCE_ADD_SELECTED_COUNT", selectedCount);
  if (parsed.error || !parsed.value) {
    logReferenceAdd(
      "REFERENCE_ADD_ERROR_CATEGORY",
      !petIdValid
        ? "INVALID_PET_ID"
        : selectedCount === 0
          ? "NO_PHOTOS_SELECTED"
          : "PHOTO_NOT_OWNED",
    );
    return { message: parsed.error ?? "Select valid photos.", status: "error" };
  }
  const { petId, photoIds } = parsed.value;
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedReferenceUser();
  logReferenceAdd("REFERENCE_ADD_USER_PRESENT", Boolean(user));
  if (authError || !supabase || !user) {
    logReferenceAdd("REFERENCE_ADD_ERROR_CATEGORY", "AUTH_REQUIRED");
    return { message: authError ?? "Please log in.", status: "error" };
  }
  const ownedPet = await findOwnedPet(supabase, petId, user.id);
  if (ownedPet.error) {
    logReferenceDatabaseError(ownedPet.error, "PET_OWNERSHIP_QUERY");
    return { message: "We could not find that pet profile.", status: "error" };
  }
  if (!ownedPet.pet) {
    logReferenceAdd("REFERENCE_ADD_ERROR_CATEGORY", "PET_NOT_OWNED");
    return { message: "We could not find that pet profile.", status: "error" };
  }

  const [
    { data: photoRows, error: photoError },
    { data: existingRows, error: existingError },
  ] = await Promise.all([
    supabase
      .from("photos")
      .select("id,user_id,storage_path,mime_type")
      .eq("user_id", user.id)
      .in("id", photoIds),
    supabase
      .from("pet_reference_photos")
      .select("photo_id")
      .eq("pet_id", petId)
      .eq("user_id", user.id)
      .in("photo_id", photoIds),
  ]);
  const photos = (photoRows ?? []) as OwnedPhoto[];
  logReferenceAdd("REFERENCE_ADD_OWNED_PHOTO_COUNT", photos.length);
  if (photoError || photos.length !== photoIds.length) {
    if (photoError) {
      logReferenceDatabaseError(photoError, "PHOTO_OWNERSHIP_QUERY");
    } else logReferenceAdd("REFERENCE_ADD_ERROR_CATEGORY", "PHOTO_NOT_OWNED");
    return {
      message: "One or more selected photos are unavailable.",
      status: "error",
    };
  }
  if (existingError) {
    logReferenceDatabaseError(existingError, "EXISTING_REFERENCE_QUERY");
    return {
      message: "We could not add those reference photos. Please try again.",
      status: "error",
    };
  }
  const existingIds = new Set((existingRows ?? []).map((row) => row.photo_id));
  const newPhotos = photos.filter((photo) => !existingIds.has(photo.id));
  if (newPhotos.length === 0) {
    return {
      message: "Those photos are already references for this pet.",
      status: "error",
    };
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("pet_reference_photos")
    .insert(
      newPhotos.map((photo) => ({
        embedding_status: "pending",
        pet_id: petId,
        photo_id: photo.id,
        user_id: user.id,
      })),
    )
    .select("id,photo_id");
  if (
    insertError ||
    !insertedRows ||
    insertedRows.length !== newPhotos.length
  ) {
    if (insertError) {
      logReferenceDatabaseError(insertError, "REFERENCE_INSERT");
    } else {
      logReferenceAdd("REFERENCE_ADD_DB_ERROR_CODE", "INCOMPLETE_RESULT");
      logReferenceAdd("REFERENCE_ADD_ERROR_CATEGORY", "DATABASE_INSERT_FAILED");
    }
    return {
      message: "We could not add those reference photos. Please try again.",
      status: "error",
    };
  }

  const results = await processWithBoundedConcurrency({
    photos: newPhotos,
    references: insertedRows as ReferenceRecord[],
    supabase,
    userId: user.id,
  });
  const ready = results.filter((result) => result.status === "ready").length;
  const failed = results.length - ready;
  revalidateReferencePaths(petId);

  return {
    message:
      failed === 0
        ? `${ready} ${ready === 1 ? "reference is" : "references are"} ready.`
        : `${ready} ready, ${failed} failed. Failed references can be retried.`,
    resultId: crypto.randomUUID(),
    status: failed === results.length ? "error" : "success",
  };
}

export async function retryReferenceEmbeddingAction(
  _state: ReferenceActionState,
  formData: FormData,
): Promise<ReferenceActionState> {
  const referenceId = referenceIdSchema.safeParse(
    String(formData.get("referenceId") ?? ""),
  );
  const petId = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  if (!referenceId.success || !petId.success) {
    return { message: "We could not find that reference.", status: "error" };
  }
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedReferenceUser();
  if (authError || !supabase || !user) {
    return { message: authError ?? "Please log in.", status: "error" };
  }
  const ownedPet = await findOwnedPet(supabase, petId.data, user.id);
  if (ownedPet.error || !ownedPet.pet) {
    return { message: "We could not find that reference.", status: "error" };
  }
  const { data: reference, error } = await supabase
    .from("pet_reference_photos")
    .select("id,photo_id,user_id,pet_id")
    .eq("id", referenceId.data)
    .eq("pet_id", petId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !reference) {
    return { message: "We could not find that reference.", status: "error" };
  }
  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .select("id,user_id,storage_path,mime_type")
    .eq("id", reference.photo_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (photoError || !photo) {
    return {
      message: "We could not find that private photo.",
      status: "error",
    };
  }
  const result = await processReferenceEmbedding({
    photo: photo as OwnedPhoto,
    referenceId: reference.id,
    supabase,
    userId: user.id,
  });
  revalidateReferencePaths(petId.data);
  return result.status === "ready"
    ? {
        message: "Embedding is ready.",
        resultId: crypto.randomUUID(),
        status: "success",
      }
    : { message: "Embedding failed. You can try again.", status: "error" };
}

export async function removeReferencePhotoAction(
  _state: ReferenceActionState,
  formData: FormData,
): Promise<ReferenceActionState> {
  const referenceId = referenceIdSchema.safeParse(
    String(formData.get("referenceId") ?? ""),
  );
  const petId = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  if (!referenceId.success || !petId.success) {
    return { message: "We could not find that reference.", status: "error" };
  }
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedReferenceUser();
  if (authError || !supabase || !user) {
    return { message: authError ?? "Please log in.", status: "error" };
  }
  const ownedPet = await findOwnedPet(supabase, petId.data, user.id);
  if (ownedPet.error || !ownedPet.pet) {
    return { message: "We could not find that reference.", status: "error" };
  }
  const { error } = await supabase
    .from("pet_reference_photos")
    .delete()
    .eq("id", referenceId.data)
    .eq("pet_id", petId.data)
    .eq("user_id", user.id);
  if (error) {
    return { message: "We could not remove that reference.", status: "error" };
  }
  revalidateReferencePaths(petId.data);
  return {
    message:
      "Removed from references. The original photo is still in your gallery.",
    resultId: crypto.randomUUID(),
    status: "success",
  };
}
