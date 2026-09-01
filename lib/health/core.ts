import { z } from "zod";
import { isValidCalendarDate } from "@/lib/weights/core";

export const HEALTH_TYPES = [
  "symptom",
  "vet_visit",
  "medication",
  "treatment",
  "general",
] as const;
export type HealthType = (typeof HEALTH_TYPES)[number];
export const HEALTH_TYPE_LABELS: Record<HealthType, string> = {
  general: "General note",
  medication: "Medication",
  symptom: "Symptom",
  treatment: "Treatment / care",
  vet_visit: "Vet visit",
};
export const HEALTH_PAGE_SIZE = 25;
export const HEALTH_TITLE_MAX = 120;
export const HEALTH_NOTES_MAX = 4000;

export type HealthRecord = {
  created_at: string;
  id: string;
  notes: string | null;
  pet_id: string;
  record_date: string;
  record_type: HealthType;
  title: string;
  updated_at: string;
  user_id: string;
};

export const healthRecordIdSchema = z.string().uuid();
export const healthTypeSchema = z.enum(HEALTH_TYPES);
export const healthDateSchema = z
  .string()
  .refine(isValidCalendarDate, "Enter a valid event date.");
export const healthTitleSchema = z
  .string()
  .trim()
  .min(1, "Enter a title.")
  .max(
    HEALTH_TITLE_MAX,
    `Title must be ${HEALTH_TITLE_MAX} characters or less.`,
  );
export const healthNotesSchema = z
  .string()
  .trim()
  .max(
    HEALTH_NOTES_MAX,
    `Notes must be ${HEALTH_NOTES_MAX} characters or less.`,
  )
  .transform((value) => value || null);
export const healthFormSchema = z.object({
  notes: healthNotesSchema,
  recordDate: healthDateSchema,
  recordType: healthTypeSchema,
  title: healthTitleSchema,
});

export function parseHealthFilter(
  value: string | undefined,
): HealthType | null {
  const parsed = healthTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function parseHealthPage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
export function formatHealthDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
export function compareHealthNewest(left: HealthRecord, right: HealthRecord) {
  return (
    right.record_date.localeCompare(left.record_date) ||
    right.created_at.localeCompare(left.created_at) ||
    right.id.localeCompare(left.id)
  );
}
export function sortHealthNewest(records: HealthRecord[]) {
  return [...records].sort(compareHealthNewest);
}
export function filterHealthRecords(
  records: HealthRecord[],
  type: HealthType | null,
) {
  return type
    ? records.filter((record) => record.record_type === type)
    : records;
}
export function healthPageCount(total: number) {
  return Math.max(1, Math.ceil(total / HEALTH_PAGE_SIZE));
}
export function latestHealthByPet(records: HealthRecord[], petIds: string[]) {
  const latest = new Map<string, HealthRecord | null>(
    petIds.map((id) => [id, null]),
  );
  for (const record of sortHealthNewest(records))
    if (!latest.get(record.pet_id)) latest.set(record.pet_id, record);
  return latest;
}
