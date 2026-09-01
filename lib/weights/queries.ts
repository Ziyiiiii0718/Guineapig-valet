import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  sortWeightsNewest,
  summarizeWeights,
  type WeightRecord,
  WEIGHT_HISTORY_LIMIT,
} from "@/lib/weights/core";

const COLUMNS =
  "id,user_id,pet_id,weight_grams,recorded_at,created_at,updated_at";

export async function listWeightsForPet(petId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("weight_records")
    .select(COLUMNS)
    .eq("pet_id", petId)
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(WEIGHT_HISTORY_LIMIT);
  const records = sortWeightsNewest((data ?? []) as WeightRecord[]);
  return { error, records, summary: summarizeWeights(records) };
}

export async function listWeightSummariesForDashboard(
  userId: string,
  petIds: string[],
) {
  if (!petIds.length)
    return new Map<string, ReturnType<typeof summarizeWeights>>();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("weight_records")
    .select(COLUMNS)
    .eq("user_id", userId)
    .in("pet_id", petIds)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(100, petIds.length * 10));
  const grouped = new Map<string, WeightRecord[]>();
  for (const row of (data ?? []) as WeightRecord[])
    grouped.set(row.pet_id, [...(grouped.get(row.pet_id) ?? []), row]);
  return new Map(
    petIds.map((id) => [id, summarizeWeights(grouped.get(id) ?? [])]),
  );
}
