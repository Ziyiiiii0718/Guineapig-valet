import { z } from "zod";

export const ALBUM_NAME_MAX_LENGTH = 80;
export const ALBUM_DESCRIPTION_MAX_LENGTH = 500;
export const ALBUM_ADD_PHOTO_LIMIT = 20;

export const albumIdSchema = z.string().uuid();

export const albumNameSchema = z
  .string()
  .trim()
  .min(1, "Enter an album name.")
  .refine(
    (value) => Array.from(value).length <= ALBUM_NAME_MAX_LENGTH,
    `Album name must be ${ALBUM_NAME_MAX_LENGTH} characters or fewer.`,
  );

export const albumDescriptionSchema = z
  .string()
  .trim()
  .refine(
    (value) => Array.from(value).length <= ALBUM_DESCRIPTION_MAX_LENGTH,
    `Description must be ${ALBUM_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
  )
  .transform((value) => value || null);

export const albumFormSchema = z.object({
  description: albumDescriptionSchema,
  name: albumNameSchema,
});

export function parseAlbumPage(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(candidate ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function getAlbumPaginationRange(page: number, pageSize: number) {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
