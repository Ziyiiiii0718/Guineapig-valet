import "server-only";

import { redirect } from "next/navigation";
import { getPublicEnvStatus } from "@/lib/env";
import {
  addPetAvatarUrls,
  createPetAvatarSignedUrl,
} from "@/lib/pets/avatar-urls";
import type { Pet } from "@/lib/pets/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAuthenticatedSupabase() {
  const envStatus = getPublicEnvStatus();

  if (!envStatus.isConfigured) {
    return { envStatus, supabase: null, user: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?message=Please%20log%20in%20to%20view%20your%20dashboard.",
    );
  }

  return { envStatus, supabase, user };
}

export async function listPetsForUser(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { count, data, error } = await supabase
    .from("pets")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return {
    count: count ?? data?.length ?? 0,
    error,
    pets: await addPetAvatarUrls(supabase, (data ?? []) as Pet[]),
  };
}

export async function getPetForUser(petId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pets")
    .select("*")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();
  const pet = (data as Pet | null) ?? null;

  return {
    error,
    pet: pet
      ? {
          ...pet,
          profile_photo_url: await createPetAvatarSignedUrl(
            supabase,
            pet.profile_photo_path,
          ),
        }
      : null,
  };
}
