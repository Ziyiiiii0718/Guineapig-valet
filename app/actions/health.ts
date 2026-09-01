"use server";
import { revalidatePath } from "next/cache";
import { getPublicEnvStatus } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { petIdSchema } from "@/lib/validation/pets";
import { healthFormSchema, healthRecordIdSchema } from "@/lib/health/core";

export type HealthActionState = {
  fieldErrors?: Partial<
    Record<"notes" | "recordDate" | "recordType" | "title", string>
  >;
  message?: string;
  status: "idle" | "error" | "success";
  values?: Record<"notes" | "recordDate" | "recordType" | "title", string>;
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
        error: "Please log in to manage health records.",
        supabase,
        user: null,
      };
}
function parse(formData: FormData) {
  const values = {
    notes: String(formData.get("notes") ?? ""),
    recordDate: String(formData.get("recordDate") ?? ""),
    recordType: String(formData.get("recordType") ?? ""),
    title: String(formData.get("title") ?? ""),
  };
  const result = healthFormSchema.safeParse(values);
  if (result.success) return { data: result.data, values };
  const errors = result.error.flatten().fieldErrors;
  return {
    data: null,
    error: {
      fieldErrors: {
        notes: errors.notes?.[0],
        recordDate: errors.recordDate?.[0],
        recordType: errors.recordType?.[0],
        title: errors.title?.[0],
      },
      message: "Check the health record and try again.",
      status: "error" as const,
      values,
    },
    values,
  };
}
async function ownsPet(
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
  return data?.user_id === userId;
}
function refresh(petId: string) {
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/health`);
  revalidatePath("/dashboard");
}
export async function createHealthAction(
  _state: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
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
  if (!(await ownsPet(supabase, pet.data, user.id)))
    return {
      message: "We could not find that pet.",
      status: "error",
      values: parsed.values,
    };
  const { error: dbError } = await supabase.from("health_records").insert({
    notes: parsed.data.notes,
    pet_id: pet.data,
    record_date: parsed.data.recordDate,
    record_type: parsed.data.recordType,
    title: parsed.data.title,
    user_id: user.id,
  });
  if (dbError)
    return {
      message: "We could not save that health record.",
      status: "error",
      values: parsed.values,
    };
  refresh(pet.data);
  return { message: "Health record saved.", status: "success" };
}
export async function updateHealthAction(
  _state: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
  const id = healthRecordIdSchema.safeParse(
    String(formData.get("recordId") ?? ""),
  );
  const pet = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  const parsed = parse(formData);
  if (!id.success || !pet.success)
    return {
      message: "We could not find that health record.",
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
  if (!(await ownsPet(supabase, pet.data, user.id)))
    return {
      message: "We could not find that health record.",
      status: "error",
      values: parsed.values,
    };
  const { data: record } = await supabase
    .from("health_records")
    .select("id")
    .eq("id", id.data)
    .eq("pet_id", pet.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!record)
    return {
      message: "We could not find that health record.",
      status: "error",
      values: parsed.values,
    };
  const { error: dbError } = await supabase
    .from("health_records")
    .update({
      notes: parsed.data.notes,
      record_date: parsed.data.recordDate,
      record_type: parsed.data.recordType,
      title: parsed.data.title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id.data)
    .eq("pet_id", pet.data)
    .eq("user_id", user.id);
  if (dbError)
    return {
      message: "We could not update that health record.",
      status: "error",
      values: parsed.values,
    };
  refresh(pet.data);
  return { message: "Health record updated.", status: "success" };
}
export async function deleteHealthAction(
  _state: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
  const id = healthRecordIdSchema.safeParse(
    String(formData.get("recordId") ?? ""),
  );
  const pet = petIdSchema.safeParse(String(formData.get("petId") ?? ""));
  if (!id.success || !pet.success)
    return {
      message: "We could not find that health record.",
      status: "error",
    };
  const { error, supabase, user } = await auth();
  if (error || !supabase || !user)
    return { message: error ?? "Please log in.", status: "error" };
  if (!(await ownsPet(supabase, pet.data, user.id)))
    return {
      message: "We could not find that health record.",
      status: "error",
    };
  const { error: dbError } = await supabase
    .from("health_records")
    .delete()
    .eq("id", id.data)
    .eq("pet_id", pet.data)
    .eq("user_id", user.id);
  if (dbError)
    return {
      message: "We could not delete that health record.",
      status: "error",
    };
  refresh(pet.data);
  return { message: "Health record deleted.", status: "success" };
}
