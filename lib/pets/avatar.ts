export const PET_AVATAR_BUCKET = "pet-avatars";
export const PET_AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const PET_AVATAR_SIGNED_URL_TTL_SECONDS = 10 * 60;

export const PET_AVATAR_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PetAvatarMimeType = (typeof PET_AVATAR_ALLOWED_TYPES)[number];

const EXTENSIONS_BY_MIME_TYPE: Record<PetAvatarMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type AvatarValidationTarget = {
  size: number;
  type: string;
};

export function isAllowedPetAvatarMimeType(
  mimeType: string,
): mimeType is PetAvatarMimeType {
  return PET_AVATAR_ALLOWED_TYPES.includes(mimeType as PetAvatarMimeType);
}

export function getPetAvatarValidationError(
  file: AvatarValidationTarget | null | undefined,
) {
  if (!file || !Number.isInteger(file.size) || file.size <= 0) {
    return "Choose a JPEG, PNG, or WEBP image.";
  }

  if (!isAllowedPetAvatarMimeType(file.type)) {
    return "Avatar must be a JPEG, PNG, or WEBP image.";
  }

  if (file.size > PET_AVATAR_MAX_SIZE_BYTES) {
    return "Avatar image must be 5 MB or smaller.";
  }

  return null;
}

export function getPetAvatarFileExtension(mimeType: PetAvatarMimeType) {
  return EXTENSIONS_BY_MIME_TYPE[mimeType];
}

export function buildPetAvatarPath({
  mimeType,
  petId,
  uniqueId,
  userId,
}: {
  mimeType: PetAvatarMimeType;
  petId: string;
  uniqueId: string;
  userId: string;
}) {
  return `${userId}/${petId}/${uniqueId}.${getPetAvatarFileExtension(mimeType)}`;
}

export function isPetAvatarPathForUser(path: string | null, userId: string) {
  return path?.split("/")[0] === userId;
}

export function isPetAvatarPathForPet(
  path: string,
  userId: string,
  petId: string,
) {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === userId &&
    parts[1] === petId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(
      parts[2] ?? "",
    )
  );
}
