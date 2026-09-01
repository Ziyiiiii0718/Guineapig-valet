import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  HEALTH_PAGE_SIZE,
  latestHealthByPet,
  sortHealthNewest,
  type HealthRecord,
  type HealthType,
} from "@/lib/health/core";

const COLUMNS =
  "id,user_id,pet_id,record_type,title,notes,record_date,created_at,updated_at";

export async function listHealthForPet(
  petId: string,
  userId: string,
  options: { page?: number; type?: HealthType | null; limit?: number } = {},
) {
  const page = options.page ?? 1;
  const limit = options.limit ?? HEALTH_PAGE_SIZE;
  const start = (page - 1) * limit;
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("health_records")
    .select(COLUMNS, { count: "exact" })
    .eq("pet_id", petId)
    .eq("user_id", userId);
  if (options.type) query = query.eq("record_type", options.type);
  const { data, error, count } = await query
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + limit - 1);
  return {
    count: count ?? 0,
    error,
    records: sortHealthNewest((data ?? []) as HealthRecord[]),
  };
}

export async function listRecentHealthForDashboard(
  userId: string,
  petIds: string[],
) {
  if (!petIds.length) return new Map<string, HealthRecord | null>();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("health_records")
    .select(COLUMNS)
    .eq("user_id", userId)
    .in("pet_id", petIds)
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.max(50, petIds.length * 5));
  return latestHealthByPet((data ?? []) as HealthRecord[], petIds);
}
