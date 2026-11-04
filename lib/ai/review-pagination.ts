import { z } from "zod";
import type { ReviewFilter } from "@/lib/ai/predictions";

export const REVIEW_PAGE_SIZE = 24;
const cursorSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  direction: z.enum(["older", "newer"]),
});
export type ReviewCursor = z.infer<typeof cursorSchema>;
export function parseReviewCursor(value: unknown): ReviewCursor | null {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function reviewPageHref(
  filter: ReviewFilter,
  cursor?: ReviewCursor | null,
) {
  const params = new URLSearchParams({ filter });
  if (cursor) params.set("cursor", JSON.stringify(cursor));
  return `/review?${params}`;
}
