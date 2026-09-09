import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferenceEmbeddingStatus } from "@/lib/ai/types";
import { getAlbumPaginationRange } from "@/lib/albums/validation";
import { createUserPhotoSignedUrl, type PhotoRow } from "@/lib/photos/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REFERENCE_PICKER_PAGE_SIZE } from "@/lib/references/validation";

const PHOTO_COLUMNS =
  "id,user_id,storage_path,taken_at,uploaded_at,file_name,display_name,file_size,width,height,ai_status,created_at,mime_type";
const REFERENCE_COLUMNS =
  "id,pet_id,user_id,photo_id,embedding_status,embedding_model,embedding_version,embedding_dimension,embedding_error_category,created_at,updated_at";

export type ReferencePhotoRow = {
  created_at: string;
  embedding_dimension: number | null;
  embedding_error_category: string | null;
  embedding_model: string | null;
  embedding_status: ReferenceEmbeddingStatus;
  embedding_version: string | null;
  id: string;
  pet_id: string;
  photo_id: string;
  updated_at: string;
  user_id: string;
};

export type ReferencePhotoView = ReferencePhotoRow & {
  photo: (PhotoRow & { signed_url: string | null }) | null;
};

async function signPhotos(
  supabase: SupabaseClient,
  photos: PhotoRow[],
  userId: string,
) {
  return Promise.all(
    photos.map(async (photo) => ({
      ...photo,
      signed_url: await createUserPhotoSignedUrl(
        supabase,
        photo.storage_path,
        userId,
      ),
    })),
  );
}

export async function listReferencesForPet(petId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pet_reference_photos")
    .select(REFERENCE_COLUMNS)
    .eq("pet_id", petId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const references = (data ?? []) as ReferencePhotoRow[];
  const photoIds = references.map((reference) => reference.photo_id);

  let photos: Awaited<ReturnType<typeof signPhotos>> = [];
  if (photoIds.length > 0) {
    const { data: photoRows } = await supabase
      .from("photos")
      .select(PHOTO_COLUMNS)
      .eq("user_id", userId)
      .in("id", photoIds);
    photos = await signPhotos(
      supabase,
      (photoRows ?? []) as PhotoRow[],
      userId,
    );
  }

  const photosById = new Map(photos.map((photo) => [photo.id, photo]));
  return {
    error,
    references: references.map((reference) => ({
      ...reference,
      photo: photosById.get(reference.photo_id) ?? null,
    })) satisfies ReferencePhotoView[],
  };
}

export async function listReferencePhotoPicker({
  page,
  petId,
  userId,
}: {
  page: number;
  petId: string;
  userId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { from, to } = getAlbumPaginationRange(
    page,
    REFERENCE_PICKER_PAGE_SIZE,
  );
  const [{ count, data, error }, { data: referenceRows }] = await Promise.all([
    supabase
      .from("photos")
      .select(PHOTO_COLUMNS, { count: "exact" })
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
    supabase
      .from("pet_reference_photos")
      .select("photo_id")
      .eq("pet_id", petId)
      .eq("user_id", userId),
  ]);

  return {
    count: count ?? 0,
    error,
    existing: new Set((referenceRows ?? []).map((row) => row.photo_id)),
    photos: await signPhotos(supabase, (data ?? []) as PhotoRow[], userId),
  };
}
