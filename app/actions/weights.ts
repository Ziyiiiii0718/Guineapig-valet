"use server";
import { revalidatePath } from "next/cache";
import { getPublicEnvStatus } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { petIdSchema } from "@/lib/validation/pets";
import { weightFormSchema, weightRecordIdSchema } from "@/lib/weights/core";

export type WeightActionState = {
  fieldErrors?: { measuredAt?: string; weightGrams?: string };
  message?: string;
  status: "idle" | "error" | "success";
  values?: { measuredAt: string; weightGrams: string };
};
async function auth() {
  if (!getPublicEnvStatus().isConfigured)
    return {
      error: "Supabase is not configured yet.",
      supabase: null,
      user: null,
    };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user
    ? { error: null, supabase, user }
    : {
        error: "Please log in to manage weight records.",
        supabase,
        user: null,
      };
}
function parse(formData: FormData) {
  const values = {
    measuredAt: String(formData.get("measuredAt") ?? ""),
    weightGrams: String(formData.get("weightGrams") ?? ""),
  };
  const result = weightFormSchema.safeParse(values);
  if (result.success) return { data: result.data, values };
  const e = result.error.flatten().fieldErrors;
  return {
    data: null,
    values,
    error: {
      fieldErrors: {
        measuredAt: e.measuredAt?.[0],
        weightGrams: e.weightGrams?.[0],
      },
      message: "Check the measurement and try again.",
      status: "error" as const,
      values,
    },
  };
}
async function ownedPet(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  petId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("pets")
    .select("id,user_id")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.user_id === userId ? data : null;
}
function refresh(petId: string) {
  revalidatePath(`/pets/${petId}`);
  revalidatePath("/dashboard");
}
export async function createWeightAction(
  _s: WeightActionState,
  formData: FormData,
): Promise<WeightActionState> {
  const pet = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  const parsed = parse(formData);
  if (!pet.success)
    return {
      message: "We could not find that pet.",
      status: "error",
      values: parsed.values,
    };
  if (!parsed.data) return parsed.error!;
  const { error, supabase, user } = await auth();
  if (error || !supabase || !user)
    return {
      message: error ?? "Please log in.",
      status: "error",
      values: parsed.values,
    };
  if (!(await ownedPet(supabase, pet.data, user.id)))
    return {
      message: "We could not find that pet.",
      status: "error",
      values: parsed.values,
    };
  const { error: db } = await supabase.from("weight_records").insert({
    pet_id: pet.data,
    recorded_at: parsed.data.measuredAt,
    user_id: user.id,
    weight_grams: parsed.data.weightGrams,
  });
  if (db)
    return {
      message: "We could not save that measurement.",
      status: "error",
      values: parsed.values,
    };
  refresh(pet.data);
  return { message: "Weight recorded.", status: "success" };
}
export async function updateWeightAction(
  _s: WeightActionState,
  formData: FormData,
): Promise<WeightActionState> {
  const id = weightRecordIdSchema.safeParse(
    String(formData.get("recordId") ?? ""),
  );
  const pet = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  const parsed = parse(formData);
  if (!id.success || !pet.success)
    return {
      message: "We could not find that measurement.",
      status: "error",
      values: parsed.values,
    };
  if (!parsed.data) return parsed.error!;
  const { error, supabase, user } = await auth();
  if (error || !supabase || !user)
    return {
      message: error ?? "Please log in.",
      status: "error",
      values: parsed.values,
    };
  if (!(await ownedPet(supabase, pet.data, user.id)))
    return {
      message: "We could not find that measurement.",
      status: "error",
      values: parsed.values,
    };
  const { data: record } = await supabase
    .from("weight_records")
    .select("id")
    .eq("id", id.data)
    .eq("pet_id", pet.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!record)
    return {
      message: "We could not find that measurement.",
      status: "error",
      values: parsed.values,
    };
  const { error: db } = await supabase
    .from("weight_records")
    .update({
      recorded_at: parsed.data.measuredAt,
      updated_at: new Date().toISOString(),
      weight_grams: parsed.data.weightGrams,
    })
    .eq("id", id.data)
    .eq("user_id", user.id);
  if (db)
    return {
      message: "We could not update that measurement.",
      status: "error",
      values: parsed.values,
    };
  refresh(pet.data);
  return { message: "Measurement updated.", status: "success" };
}
export async function deleteWeightAction(
  _s: WeightActionState,
  formData: FormData,
): Promise<WeightActionState> {
  const id = weightRecordIdSchema.safeParse(
    String(formData.get("recordId") ?? ""),
  );
  const pet = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  if (!id.success || !pet.success)
    return { message: "We could not find that measurement.", status: "error" };
  const { error, supabase, user } = await auth();
  if (error || !supabase || !user)
    return { message: error ?? "Please log in.", status: "error" };
  if (!(await ownedPet(supabase, pet.data, user.id)))
    return { message: "We could not find that measurement.", status: "error" };
  const { error: db } = await supabase
    .from("weight_records")
    .delete()
    .eq("id", id.data)
    .eq("pet_id", pet.data)
    .eq("user_id", user.id);
  if (db)
    return {
      message: "We could not delete that measurement.",
      status: "error",
    };
  refresh(pet.data);
  return { message: "Measurement deleted.", status: "success" };
}
