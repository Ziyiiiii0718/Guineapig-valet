import { z } from "zod";
import { PET_SEX_VALUES, type PetFormFields } from "@/lib/pets/types";

const MAX_SHORT_TEXT = 240;
const MAX_LONG_TEXT = 1200;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isRealIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const petIdSchema = z.string().uuid("Invalid pet profile.");

export const petFormSchema = z.object({
  birthDate: z
    .string()
    .trim()
    .min(1, "Enter a birth date.")
    .refine(isRealIsoDate, "Enter a valid birth date.")
    .refine(
      (value) => value <= todayIsoDate(),
      "Birth date cannot be in the future.",
    ),
  dislikedFoods: z
    .preprocess(normalizeOptionalText, z.string().max(MAX_SHORT_TEXT))
    .transform((value) => (value === "" ? null : value)),
  favoriteFoods: z
    .preprocess(normalizeOptionalText, z.string().max(MAX_SHORT_TEXT))
    .transform((value) => (value === "" ? null : value)),
  generalNotes: z
    .preprocess(normalizeOptionalText, z.string().max(MAX_LONG_TEXT))
    .transform((value) => (value === "" ? null : value)),
  name: z
    .string()
    .trim()
    .min(1, "Enter a pet name.")
    .max(80, "Pet name must be 80 characters or fewer."),
  personalityNotes: z
    .preprocess(normalizeOptionalText, z.string().max(MAX_LONG_TEXT))
    .transform((value) => (value === "" ? null : value)),
  sex: z.enum(PET_SEX_VALUES, {
    error: "Choose female, male, or unknown.",
  }),
});

export type PetFormInput = z.input<typeof petFormSchema>;
export type PetFormValues = z.output<typeof petFormSchema>;

export function formDataToPetFields(formData: FormData): PetFormFields {
  return {
    birthDate: String(formData.get("birthDate") ?? ""),
    dislikedFoods: String(formData.get("dislikedFoods") ?? ""),
    favoriteFoods: String(formData.get("favoriteFoods") ?? ""),
    generalNotes: String(formData.get("generalNotes") ?? ""),
    name: String(formData.get("name") ?? ""),
    personalityNotes: String(formData.get("personalityNotes") ?? ""),
    sex: String(formData.get("sex") ?? ""),
  };
}

export function petFormValuesToFields(values: PetFormValues): PetFormFields {
  return {
    birthDate: values.birthDate,
    dislikedFoods: values.dislikedFoods ?? "",
    favoriteFoods: values.favoriteFoods ?? "",
    generalNotes: values.generalNotes ?? "",
    name: values.name,
    personalityNotes: values.personalityNotes ?? "",
    sex: values.sex,
  };
}
