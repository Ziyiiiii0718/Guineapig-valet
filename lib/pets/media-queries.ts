import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createUserPhotoSignedUrl,
  type PhotoRow,
  type PhotoWithSignedUrl,
} from "@/lib/photos/queries";
import type { AlbumRow, AlbumSummary } from "@/lib/albums/queries";
import { petIdSchema } from "@/lib/validation/pets";

const PHOTO_COLUMNS =
  "id,user_id,storage_path,taken_at,uploaded_at,file_name,display_name,file_size,width,height,ai_status,created_at,mime_type";
// Explicit FK names disambiguate the legacy and composite owner foreign keys.
const PREDICTION_JOIN =
  "prediction:photo_pet_predictions!photo_pet_predictions_photo_owner_fkey!inner()";

async function ownedPet(petId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  if (!petIdSchema.safeParse(petId).success)
    return { supabase, error: new Error("Pet unavailable") };
  const { data, error } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();
  return {
    supabase,
    error: error || (!data ? new Error("Pet unavailable") : null),
  };
}

export async function listConfirmedPhotosForPet(
  petId: string,
  userId: string,
  options: { page?: number; limit?: number } = {},
) {
  const { supabase, error: petError } = await ownedPet(petId, userId);
  if (petError)
    return { photos: [] as PhotoWithSignedUrl[], count: 0, error: petError };
  const limit = Math.max(1, Math.min(24, Math.floor(options.limit || 5)));
  const page = Math.max(1, Math.floor(options.page || 1));
  const { data, count, error } = await supabase
    .from("photos")
    .select(`${PHOTO_COLUMNS},${PREDICTION_JOIN}`, { count: "exact" })
    .eq("user_id", userId)
    .eq("prediction.user_id", userId)
    .in("prediction.review_status", ["confirmed", "corrected"])
    .eq("prediction.confirmed_unknown", false)
    .contains("prediction.confirmed_pet_ids", [petId])
    .order("taken_at", { ascending: false })
    .order("uploaded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) return { photos: [], count: 0, error };
  const photos = await Promise.all(
    ((data ?? []) as unknown as PhotoRow[])
      .filter((photo) => photo.user_id === userId)
      .map(async (photo) => {
        const signedUrl = await createUserPhotoSignedUrl(
          supabase,
          photo.storage_path,
          userId,
        );
        return {
          ...photo,
          signed_url: signedUrl,
          signed_url_error: !signedUrl,
        };
      }),
  );
  return { photos, count: count ?? 0, error: null };
}

export async function listAlbumsFeaturingPet(
  petId: string,
  userId: string,
  options: { page?: number; limit?: number } = {},
) {
  const { supabase, error: petError } = await ownedPet(petId, userId);
  if (petError)
    return { albums: [] as AlbumSummary[], count: 0, error: petError };
  const limit = Math.max(1, Math.min(12, Math.floor(options.limit || 4)));
  const page = Math.max(1, Math.floor(options.page || 1));
  const { data, error, count } = await supabase
    .from("albums")
    .select(
      `id,user_id,title,description,cover_photo_id,created_at,updated_at,membership:album_photos!album_photos_album_owner_fkey!inner(photo:photos!album_photos_photo_owner_fkey!inner(${PREDICTION_JOIN}))`,
      { count: "exact" },
    )
    .eq("user_id", userId)
    .eq("membership.user_id", userId)
    .eq("membership.photo.user_id", userId)
    .eq("membership.photo.prediction.user_id", userId)
    .in("membership.photo.prediction.review_status", ["confirmed", "corrected"])
    .eq("membership.photo.prediction.confirmed_unknown", false)
    .contains("membership.photo.prediction.confirmed_pet_ids", [petId])
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) return { albums: [], count: 0, error };
  // Match the existing album cover rule: earliest surviving membership.
  // Count all album photos, explicitly labeled "photos in album" in the UI.
  const results = await Promise.all(
    ((data ?? []) as unknown as AlbumRow[])
      .filter((album) => album.user_id === userId)
      .map(async (album) => {
        const coverResult = await supabase
          .from("album_photos")
          .select("photo_id", { count: "exact" })
          .eq("user_id", userId)
          .eq("album_id", album.id)
          .order("created_at", { ascending: true })
          .order("photo_id", { ascending: true })
          .limit(1);
        let cover: PhotoWithSignedUrl | null = null;
        let coverError = coverResult.error;
        if (coverResult.data?.[0]) {
          const photoResult = await supabase
            .from("photos")
            .select(PHOTO_COLUMNS)
            .eq("user_id", userId)
            .eq("id", coverResult.data[0].photo_id)
            .maybeSingle();
          coverError ||= photoResult.error;
          const photo = photoResult.data as PhotoRow | null;
          if (photo?.user_id === userId) {
            const signedUrl = await createUserPhotoSignedUrl(
              supabase,
              photo.storage_path,
              userId,
            );
            cover = {
              ...photo,
              signed_url: signedUrl,
              signed_url_error: !signedUrl,
            };
          }
        }
        return {
          album: { ...album, cover, photo_count: coverResult.count ?? 0 },
          error: coverError,
        };
      }),
  );
  const detailError = results.find((result) => result.error)?.error;
  return {
    albums: detailError ? [] : results.map((result) => result.album),
    count: count ?? 0,
    error: detailError ?? null,
  };
}
