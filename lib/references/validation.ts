import { z } from "zod";
import { petIdSchema } from "@/lib/validation/pets";
import { photoIdSchema } from "@/lib/photos/gallery";

export const REFERENCE_PICKER_PAGE_SIZE = 20;
export const REFERENCE_ADD_BATCH_LIMIT = 20;
export const RECOMMENDED_REFERENCE_MIN = 5;
export const RECOMMENDED_REFERENCE_MAX = 15;

export const referenceIdSchema = z.string().uuid();

export function parseReferenceSelection(formData: FormData) {
  const petId = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  const photoIds = [...new Set(formData.getAll("photoIds").map(String))];

  if (!petId.success) {
    return { error: "We could not find that pet profile.", value: null };
  }
  if (photoIds.length === 0) {
    return { error: "Select at least one photo.", value: null };
  }
  if (
    photoIds.length > REFERENCE_ADD_BATCH_LIMIT ||
    photoIds.some((id) => !photoIdSchema.safeParse(id).success)
  ) {
    return {
      error: `Select no more than ${REFERENCE_ADD_BATCH_LIMIT} valid photos at once.`,
      value: null,
    };
  }

  return { error: null, value: { petId: petId.data, photoIds } };
}
