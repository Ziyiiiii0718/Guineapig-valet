import { z } from "zod";

export const PHOTO_DISPLAY_NAME_MAX_LENGTH = 80;
export const PHOTO_UNTITLED_FALLBACK = "Untitled photo";

export type PhotoDisplayNameTarget = {
  display_name?: string | null;
  file_name?: string | null;
};

export const photoDisplayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a photo name.")
  .refine(
    (value) => Array.from(value).length <= PHOTO_DISPLAY_NAME_MAX_LENGTH,
    `Photo name must be ${PHOTO_DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
  );

export function stripPhotoFileExtension(fileName: string) {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "").trim();

  return withoutExtension || null;
}

export function getPhotoDisplayName(photo: PhotoDisplayNameTarget) {
  const customName = photo.display_name?.trim();

  if (customName) {
    return customName;
  }

  if (photo.file_name) {
    return stripPhotoFileExtension(photo.file_name) ?? PHOTO_UNTITLED_FALLBACK;
  }

  return PHOTO_UNTITLED_FALLBACK;
}
