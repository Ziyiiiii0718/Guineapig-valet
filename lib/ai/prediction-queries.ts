import "server-only";

import {
  REVIEW_PAGE_SIZE,
  type ReviewCursor,
} from "@/lib/ai/review-pagination";
import { photoIdSchema } from "@/lib/photos/gallery";

import {
  buildPredictionView,
  type PetLabel,
  type PhotoPredictionRow,
  type PhotoPredictionView,
  type ReviewFilter,
} from "@/lib/ai/predictions";
import { createUserPhotoSignedUrl, type PhotoRow } from "@/lib/photos/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PREDICTION_COLUMNS =
  "id,photo_id,user_id,labels_revision,processing_status,review_status,candidate_pet_ids,candidate_scores,candidate_reference_counts,suggested_pet_ids,suggested_unknown,confirmed_pet_ids,confirmed_unknown,embedding_model,embedding_version,embedding_dimension,classification_version,configuration_version,error_category,classification_started_at,classification_completed_at,created_at,updated_at";
const PHOTO_COLUMNS =
  "id,user_id,storage_path,taken_at,uploaded_at,file_name,display_name,file_size,width,height,ai_status,created_at,mime_type";

async function loadPetLabels(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pets")
    .select("id,name")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  return { error, pets: (data ?? []) as PetLabel[] };
}

export async function getPredictionForPhoto(photoId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, petResult] = await Promise.all([
    supabase
      .from("photo_pet_predictions")
      .select(PREDICTION_COLUMNS)
      .eq("photo_id", photoId)
      .eq("user_id", userId)
      .maybeSingle(),
    loadPetLabels(userId),
  ]);
  return {
    error: error ?? petResult.error,
    pets: petResult.pets,
    prediction: data
      ? buildPredictionView(data as PhotoPredictionRow, petResult.pets)
      : null,
  };
}

export async function listPredictionSummariesForPhotos(
  photoIds: string[],
  userId: string,
) {
  if (photoIds.length === 0) return new Map<string, PhotoPredictionView>();
  const supabase = await createSupabaseServerClient();
  const [{ data }, petResult] = await Promise.all([
    supabase
      .from("photo_pet_predictions")
      .select(PREDICTION_COLUMNS)
      .eq("user_id", userId)
      .in("photo_id", photoIds),
    loadPetLabels(userId),
  ]);
  return new Map(
    ((data ?? []) as PhotoPredictionRow[]).map((prediction) => [
      prediction.photo_id,
      buildPredictionView(prediction, petResult.pets),
    ]),
  );
}

export async function countPhotosNeedingReview(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("photo_pet_predictions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("processing_status", "ready_for_review")
    .eq("review_status", "pending_review");
  return { count: count ?? 0, error };
}

export type ReviewQueueItem = {
  photo: PhotoRow & { signed_url: string | null };
  prediction: PhotoPredictionView;
};

export async function listReviewQueue(
  userId: string,
  filter: ReviewFilter,
  cursor: ReviewCursor | null = null,
) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("photo_pet_predictions")
    .select(PREDICTION_COLUMNS)
    .eq("user_id", userId);
  if (filter === "needs-review") {
    query = query.eq("review_status", "pending_review");
  } else if (filter === "confirmed" || filter === "corrected") {
    query = query.eq("review_status", filter);
  } else if (filter === "failed") {
    query = query.eq("processing_status", "failed");
  }
  if (cursor) {
    const comparison = cursor.direction === "older" ? "lt" : "gt";
    query = query.or(
      `created_at.${comparison}.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.${comparison}.${cursor.id})`,
    );
  }
  const ascending = cursor?.direction === "newer";
  const [{ data, error }, petResult] = await Promise.all([
    query
      .order("created_at", { ascending })
      .order("id", { ascending })
      .limit(REVIEW_PAGE_SIZE + 1),
    loadPetLabels(userId),
  ]);
  const rows = (data ?? []) as PhotoPredictionRow[];
  const hasMore = rows.length > REVIEW_PAGE_SIZE;
  const predictions = rows.slice(0, REVIEW_PAGE_SIZE);
  if (ascending) predictions.reverse();
  const first = predictions[0];
  const last = predictions.at(-1);
  const previousCursor: ReviewCursor | null =
    first && (ascending ? hasMore : Boolean(cursor))
      ? { created_at: first.created_at, id: first.id, direction: "newer" }
      : null;
  const nextCursor: ReviewCursor | null =
    last && (ascending ? Boolean(cursor) : hasMore)
      ? { created_at: last.created_at, id: last.id, direction: "older" }
      : null;
  const photoIds = predictions.map((prediction) => prediction.photo_id);
  if (photoIds.length === 0) {
    return {
      error: error ?? petResult.error,
      items: [],
      pets: petResult.pets,
      previousCursor: null,
      nextCursor: null,
    };
  }
  const { data: photoRows, error: photoError } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS)
    .eq("user_id", userId)
    .in("id", photoIds);
  const photos = await Promise.all(
    ((photoRows ?? []) as PhotoRow[]).map(async (photo) => ({
      ...photo,
      signed_url: await createUserPhotoSignedUrl(
        supabase,
        photo.storage_path,
        userId,
      ),
    })),
  );
  const photosById = new Map(photos.map((photo) => [photo.id, photo]));
  return {
    error: error ?? petResult.error ?? photoError,
    previousCursor,
    nextCursor,
    items: predictions.flatMap((prediction) => {
      const photo = photosById.get(prediction.photo_id);
      return photo
        ? [
            {
              photo,
              prediction: buildPredictionView(prediction, petResult.pets),
            },
          ]
        : [];
    }) satisfies ReviewQueueItem[],
    pets: petResult.pets,
  };
}

// This lookup is independent of queue filters/cursors, including photos that
// have never been analyzed. Both reads retain explicit ownership and RLS.
export async function getReviewForPhoto(photoId: string, userId: string) {
  if (!photoIdSchema.safeParse(photoId).success)
    return { error: null, photo: null, prediction: null, pets: [] };
  const supabase = await createSupabaseServerClient();
  const { data: photo, error } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS)
    .eq("id", photoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !photo)
    return { error, photo: null, prediction: null, pets: [] };
  const predictionResult = await getPredictionForPhoto(photoId, userId);
  return {
    ...predictionResult,
    photo: {
      ...(photo as PhotoRow),
      signed_url: await createUserPhotoSignedUrl(
        supabase,
        photo.storage_path,
        userId,
      ),
    },
  };
}
