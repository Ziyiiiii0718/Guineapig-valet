"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPublicEnvStatus } from "@/lib/env";
import { photoIdSchema } from "@/lib/photos/gallery";
import {
  buildUserPhotoPath,
  categorizeStoragePreparationError,
  getUserPhotoBatchValidationError,
  getUserPhotoValidationError,
  isAllowedUserPhotoMimeType,
  isUserPhotoPathForUser,
  normalizePhotoTakenAt,
  sanitizeOriginalPhotoFileName,
  type SupabaseLikeError,
  type UploadErrorCategory,
  USER_PHOTO_BUCKET,
  USER_PHOTO_INITIAL_AI_STATUS,
  validatePhotoMetadataInput,
} from "@/lib/photos/upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PhotoUploadFileRequest = {
  clientId: string;
  height: number | null;
  mimeType: string;
  originalFileName: string;
  size: number;
  takenAt: string | null;
  width: number | null;
};

export type PhotoUploadInitResult = {
  clientId: string;
  message?: string;
  path?: string;
  status: "ready" | "error";
  token?: string;
};

export type PhotoUploadFinalizeInput = PhotoUploadFileRequest & {
  path: string;
};

export type PhotoUploadFinalizeResult = {
  clientId: string;
  message: string;
  photoId?: string;
  status: "uploaded" | "failed";
};

export type PhotoDeleteActionState = {
  message?: string;
  status: "idle" | "error";
};

function logPhotoUploadPreparationFailure({
  category,
  error,
  path,
}: {
  category: UploadErrorCategory;
  error: SupabaseLikeError | null;
  path: string;
}) {
  const [, year = "yyyy", month = "mm", fileName = "file"] = path.split("/");
  const extension = fileName.split(".").pop() ?? "unknown";

  console.warn("[photo-upload]", {
    category,
    pathShape: `<auth-user>/${year}/${month}/<uuid>.${extension}`,
    supabaseError:
      error?.message ?? error?.error ?? error?.name ?? "No Supabase error body",
    supabaseStatus: error?.statusCode ?? error?.status ?? "unknown",
  });
}

async function getAuthenticatedPhotoUser() {
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
      error: "Please log in to upload photos.",
      supabase,
      user: null,
    };
  }

  return { error: null, supabase, user };
}

async function removeUploadedPhotoObject(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  path: string,
  userId: string,
) {
  if (!isUserPhotoPathForUser(path, userId)) {
    return;
  }

  await supabase.storage.from(USER_PHOTO_BUCKET).remove([path]);
}

export async function initializePhotoUploadsAction(
  files: PhotoUploadFileRequest[],
): Promise<PhotoUploadInitResult[]> {
  const batchError = getUserPhotoBatchValidationError(files.length);

  if (batchError) {
    return [
      {
        clientId: "batch",
        message: batchError,
        status: "error",
      },
    ];
  }

  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedPhotoUser();

  if (authError || !supabase || !user) {
    console.warn("[photo-upload]", {
      category: "AUTH_REQUIRED" satisfies UploadErrorCategory,
    });

    return files.map((file) => ({
      clientId: file.clientId,
      message: authError ?? "Please log in to upload photos.",
      status: "error",
    }));
  }

  return Promise.all(
    files.map(async (file) => {
      const validationError = getUserPhotoValidationError({
        size: file.size,
        type: file.mimeType,
      });

      if (validationError || !isAllowedUserPhotoMimeType(file.mimeType)) {
        return {
          clientId: file.clientId,
          message:
            validationError ?? "Photos must be JPEG, PNG, or WEBP images.",
          status: "error" as const,
        };
      }

      const path = buildUserPhotoPath({
        mimeType: file.mimeType,
        uniqueId: crypto.randomUUID(),
        userId: user.id,
      });
      const { data, error } = await supabase.storage
        .from(USER_PHOTO_BUCKET)
        .createSignedUploadUrl(path, {
          upsert: false,
        });

      if (error || !data?.token) {
        logPhotoUploadPreparationFailure({
          category: categorizeStoragePreparationError(error),
          error,
          path,
        });

        return {
          clientId: file.clientId,
          message: "We could not prepare that upload. Please try again.",
          status: "error" as const,
        };
      }

      return {
        clientId: file.clientId,
        path,
        status: "ready" as const,
        token: data.token,
      };
    }),
  );
}

export async function finalizePhotoUploadAction(
  input: PhotoUploadFinalizeInput,
): Promise<PhotoUploadFinalizeResult> {
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedPhotoUser();

  if (authError || !supabase || !user) {
    return {
      clientId: input.clientId,
      message: authError ?? "Please log in to upload photos.",
      status: "failed",
    };
  }

  const uploadTimestamp = new Date().toISOString();
  const metadataError = validatePhotoMetadataInput({
    height: input.height,
    mimeType: input.mimeType,
    originalFileName: input.originalFileName,
    size: input.size,
    storagePath: input.path,
    takenAt: input.takenAt,
    uploadTimestamp,
    userId: user.id,
    width: input.width,
  });

  if (metadataError) {
    console.warn("[photo-upload]", {
      category: "INVALID_UPLOAD_METADATA" satisfies UploadErrorCategory,
      message: metadataError,
    });
    await removeUploadedPhotoObject(supabase, input.path, user.id);

    return {
      clientId: input.clientId,
      message: metadataError,
      status: "failed",
    };
  }

  const { data, error } = await supabase
    .from("photos")
    .insert({
      ai_status: USER_PHOTO_INITIAL_AI_STATUS,
      file_name: sanitizeOriginalPhotoFileName(input.originalFileName),
      file_size: input.size,
      height: input.height,
      mime_type: input.mimeType,
      storage_path: input.path,
      taken_at: normalizePhotoTakenAt(input.takenAt, uploadTimestamp),
      uploaded_at: uploadTimestamp,
      user_id: user.id,
      width: input.width,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("[photo-upload]", {
      category: "DATABASE_PREPARATION_FAILED" satisfies UploadErrorCategory,
      supabaseError: error?.message ?? "No Supabase error body",
      supabaseStatus: error?.code ?? "unknown",
    });
    await removeUploadedPhotoObject(supabase, input.path, user.id);

    return {
      clientId: input.clientId,
      message:
        "The photo uploaded, but we could not save its details. Please try again.",
      status: "failed",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/photos/upload");
  revalidatePath("/photos");

  return {
    clientId: input.clientId,
    message: "Uploaded.",
    photoId: data.id,
    status: "uploaded",
  };
}

export async function deletePhotoAction(
  _previousState: PhotoDeleteActionState,
  formData: FormData,
): Promise<PhotoDeleteActionState> {
  const photoId = String(formData.get("photoId") ?? "");
  const parsedPhotoId = photoIdSchema.safeParse(photoId);

  if (!parsedPhotoId.success) {
    return {
      message: "We could not find that photo.",
      status: "error",
    };
  }

  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedPhotoUser();

  if (authError || !supabase || !user) {
    return {
      message: authError ?? "Please log in to manage photos.",
      status: "error",
    };
  }

  const { data: photo, error: readError } = await supabase
    .from("photos")
    .select("id,file_name,storage_path,user_id")
    .eq("id", parsedPhotoId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    readError ||
    !photo ||
    !isUserPhotoPathForUser(photo.storage_path, user.id)
  ) {
    return {
      message: "We could not find that photo.",
      status: "error",
    };
  }

  const { error: storageError } = await supabase.storage
    .from(USER_PHOTO_BUCKET)
    .remove([photo.storage_path]);

  if (storageError) {
    console.warn("[photo-gallery]", {
      category: "DELETE_STORAGE_FAILED",
      photoId: parsedPhotoId.data,
    });

    return {
      message:
        "We could not remove the private image file, so the photo was not deleted. Please try again.",
      status: "error",
    };
  }

  const { error: deleteError } = await supabase
    .from("photos")
    .delete()
    .eq("id", parsedPhotoId.data)
    .eq("user_id", user.id);

  if (deleteError) {
    console.warn("[photo-gallery]", {
      category: "DELETE_METADATA_FAILED",
      photoId: parsedPhotoId.data,
    });

    return {
      message:
        "The private image file was removed, but we could not remove the photo record. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/photos");
  revalidatePath(`/photos/${parsedPhotoId.data}`);
  redirect("/photos?message=deleted");
}
