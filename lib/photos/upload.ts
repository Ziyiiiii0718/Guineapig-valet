export const USER_PHOTO_BUCKET = "user-photos";
export const USER_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const USER_PHOTO_MAX_BATCH_SIZE = 10;
export const USER_PHOTO_SIGNED_URL_TTL_SECONDS = 10 * 60;
export const USER_PHOTO_INITIAL_AI_STATUS = "uploaded";

export const USER_PHOTO_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type UserPhotoMimeType = (typeof USER_PHOTO_ALLOWED_TYPES)[number];
export type UploadErrorCategory =
  | "AUTH_REQUIRED"
  | "BUCKET_NOT_FOUND"
  | "STORAGE_POLICY_DENIED"
  | "SIGNED_UPLOAD_CREATION_FAILED"
  | "INVALID_UPLOAD_METADATA"
  | "DATABASE_PREPARATION_FAILED";

export type SupabaseLikeError = {
  error?: string;
  message?: string;
  name?: string;
  status?: number;
  statusCode?: number | string;
};

const EXTENSIONS_BY_MIME_TYPE: Record<UserPhotoMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PhotoValidationTarget = {
  size: number;
  type: string;
};

export type PhotoMetadataInput = {
  height: number | null;
  mimeType: string;
  originalFileName: string;
  size: number;
  storagePath: string;
  takenAt: string | null;
  uploadTimestamp: string;
  userId: string;
  width: number | null;
};

export function isAllowedUserPhotoMimeType(
  mimeType: string,
): mimeType is UserPhotoMimeType {
  return USER_PHOTO_ALLOWED_TYPES.includes(mimeType as UserPhotoMimeType);
}

export function categorizeStoragePreparationError(
  error: SupabaseLikeError | null,
): UploadErrorCategory {
  const details = `${error?.error ?? ""} ${error?.message ?? ""}`.toLowerCase();

  if (details.includes("bucket not found")) {
    return "BUCKET_NOT_FOUND";
  }

  if (
    details.includes("row-level security") ||
    details.includes("permission") ||
    details.includes("not authorized") ||
    details.includes("unauthorized")
  ) {
    return "STORAGE_POLICY_DENIED";
  }

  return "SIGNED_UPLOAD_CREATION_FAILED";
}

export function getUserPhotoValidationError(
  file: PhotoValidationTarget | null | undefined,
) {
  if (!file || file.size === 0) {
    return "Choose a JPEG, PNG, or WEBP image.";
  }

  if (!isAllowedUserPhotoMimeType(file.type)) {
    return "Photos must be JPEG, PNG, or WEBP images.";
  }

  if (file.size > USER_PHOTO_MAX_SIZE_BYTES) {
    return "Each photo must be 10 MB or smaller.";
  }

  return null;
}

export function getUserPhotoBatchValidationError(fileCount: number) {
  if (!Number.isInteger(fileCount) || fileCount < 1) {
    return "Choose at least one photo to upload.";
  }

  if (fileCount > USER_PHOTO_MAX_BATCH_SIZE) {
    return `Upload ${USER_PHOTO_MAX_BATCH_SIZE} photos or fewer at a time.`;
  }

  return null;
}

export function getUserPhotoFileExtension(mimeType: UserPhotoMimeType) {
  return EXTENSIONS_BY_MIME_TYPE[mimeType];
}

export function buildUserPhotoPath({
  mimeType,
  now = new Date(),
  uniqueId,
  userId,
}: {
  mimeType: UserPhotoMimeType;
  now?: Date;
  uniqueId: string;
  userId: string;
}) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${userId}/${year}/${month}/${uniqueId}.${getUserPhotoFileExtension(
    mimeType,
  )}`;
}

export function isUserPhotoPathForUser(path: string | null, userId: string) {
  return path?.split("/")[0] === userId;
}

export function sanitizeOriginalPhotoFileName(fileName: string) {
  const safeName = fileName
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return safeName ? safeName.slice(0, 180) : "uploaded-photo";
}

export function isValidPhotoDimension(value: number | null) {
  return (
    value === null || (Number.isInteger(value) && value > 0 && value <= 100_000)
  );
}

export function normalizePhotoTakenAt(
  takenAt: string | null | undefined,
  uploadTimestamp: string,
) {
  if (!takenAt) {
    return uploadTimestamp;
  }

  const parsed = new Date(takenAt);

  if (Number.isNaN(parsed.getTime())) {
    return uploadTimestamp;
  }

  return parsed.toISOString();
}

export function validatePhotoMetadataInput(input: PhotoMetadataInput) {
  const fileError = getUserPhotoValidationError({
    size: input.size,
    type: input.mimeType,
  });

  if (fileError) {
    return fileError;
  }

  if (!isUserPhotoPathForUser(input.storagePath, input.userId)) {
    return "That upload path does not belong to the current account.";
  }

  if (
    !isValidPhotoDimension(input.width) ||
    !isValidPhotoDimension(input.height)
  ) {
    return "Photo dimensions could not be read safely.";
  }

  const uploadDate = new Date(input.uploadTimestamp);

  if (Number.isNaN(uploadDate.getTime())) {
    return "Upload metadata was malformed.";
  }

  return null;
}
