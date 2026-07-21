import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PET_AVATAR_BUCKET,
  PET_AVATAR_SIGNED_URL_TTL_SECONDS,
} from "@/lib/pets/avatar";
import type { Pet } from "@/lib/pets/types";

export type PetWithAvatarUrl = Pet & {
  profile_photo_url: string | null;
};

export async function createPetAvatarSignedUrl(
  supabase: SupabaseClient,
  path: string | null,
) {
  if (!path) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(PET_AVATAR_BUCKET)
    .createSignedUrl(path, PET_AVATAR_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function addPetAvatarUrls(
  supabase: SupabaseClient,
  pets: Pet[],
): Promise<PetWithAvatarUrl[]> {
  return Promise.all(
    pets.map(async (pet) => ({
      ...pet,
      profile_photo_url: await createPetAvatarSignedUrl(
        supabase,
        pet.profile_photo_path,
      ),
    })),
  );
}
