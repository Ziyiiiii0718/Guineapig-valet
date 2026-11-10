export function safeDisplayName(metadata?: Record<string, unknown>) {
  for (const key of ["display_name", "full_name", "name"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim())
      return value.trim().slice(0, 80);
  }
  return null;
}

export type PetProfileView = "overview" | "photos" | "albums" | "weight";
export function parsePetProfileView(value?: string): PetProfileView {
  return value === "photos" || value === "albums" || value === "weight"
    ? value
    : "overview";
}

export function parsePetMediaPage(value?: string) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1;
}
