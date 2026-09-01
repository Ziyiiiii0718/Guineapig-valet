import { z } from "zod";

export const WEIGHT_MIN_GRAMS = 100;
export const WEIGHT_MAX_GRAMS = 5000;
export const WEIGHT_HISTORY_LIMIT = 50;

export type WeightRecord = {
  created_at: string;
  id: string;
  pet_id: string;
  recorded_at: string;
  updated_at: string;
  user_id: string;
  weight_grams: number;
};

export const weightRecordIdSchema = z.string().uuid();
export const weightGramsSchema = z.coerce
  .number()
  .finite("Enter a valid weight in grams.")
  .int("Weight must be a whole number of grams.")
  .min(WEIGHT_MIN_GRAMS, `Weight must be at least ${WEIGHT_MIN_GRAMS} g.`)
  .max(WEIGHT_MAX_GRAMS, `Weight must be ${WEIGHT_MAX_GRAMS} g or less.`);

export function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const measurementDateSchema = z
  .string()
  .refine(isValidCalendarDate, "Enter a valid measurement date.");
export const weightFormSchema = z.object({
  measuredAt: measurementDateSchema,
  weightGrams: weightGramsSchema,
});

export function formatWeightGrams(value: number) {
  return `${value.toLocaleString("en-US")} g`;
}
export function formatMeasurementDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
export function compareWeightsNewest(left: WeightRecord, right: WeightRecord) {
  return (
    right.recorded_at.localeCompare(left.recorded_at) ||
    right.created_at.localeCompare(left.created_at) ||
    right.id.localeCompare(left.id)
  );
}
export function sortWeightsNewest(records: WeightRecord[]) {
  return [...records].sort(compareWeightsNewest);
}
export function sortWeightsChronological(records: WeightRecord[]) {
  return sortWeightsNewest(records).reverse();
}
export function summarizeWeights(records: WeightRecord[]) {
  const sorted = sortWeightsNewest(records);
  const latest = sorted[0] ?? null;
  const previous = sorted[1] ?? null;
  return {
    difference:
      latest && previous ? latest.weight_grams - previous.weight_grams : null,
    latest,
    previous,
  };
}
export function formatWeightDifference(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("en-US")} g`;
}
