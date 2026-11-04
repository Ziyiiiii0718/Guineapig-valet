import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requestImageEmbedding } from "@/lib/ai/client";
import { PHOTO_CLASSIFICATION_CONFIG } from "@/lib/ai/classification-config";
import {
  classifyPhotoEmbedding,
  type ClassificationReference,
} from "@/lib/ai/classifier";
import {
  AI_EMBEDDING_DIMENSION,
  AI_MODEL_NAME,
  AI_MODEL_VERSION,
  AiEmbeddingError,
  parseStoredEmbedding,
  type EmbeddingErrorCategory,
} from "@/lib/ai/embedding";
import { isUserPhotoPathForUser, USER_PHOTO_BUCKET } from "@/lib/photos/upload";

const STORED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type ClassificationPhoto = {
  id: string;
  mime_type: string | null;
  storage_path: string;
  user_id: string;
};

type ReadyReferenceRow = {
  embedding: unknown;
  embedding_dimension: number | null;
  embedding_model: string | null;
  embedding_version: string | null;
  id: string;
  pet_id: string;
};

type ProcessingPrediction = {
  classification_version: string | null;
  confirmed_pet_ids: string[];
  confirmed_unknown: boolean;
  id: string;
  review_status: "pending_review" | "confirmed" | "corrected" | "skipped";
};

export type PhotoClassificationRunResult = {
  category:
    EmbeddingErrorCategory | "model_mismatch" | "database_failure" | null;
  predictionId: string | null;
  status:
    "ready_for_review" | "failed" | "insufficient_references" | "superseded";
};

function reviewedPhotoStatus(prediction: ProcessingPrediction) {
  if (
    prediction.review_status !== "confirmed" &&
    prediction.review_status !== "corrected"
  ) {
    return null;
  }
  return prediction.confirmed_unknown ? "unknown" : "specific_pet";
}

async function startPrediction(
  supabase: SupabaseClient,
  photoId: string,
  processingToken: string,
) {
  try {
    const { data, error } = await supabase.rpc("start_photo_classification", {
      target_photo_id: photoId,
      attempt_token: processingToken,
    });
    return {
      error,
      prediction:
        data?.outcome === "started"
          ? (data.prediction as ProcessingPrediction)
          : null,
    };
  } catch {
    return { error: true, prediction: null };
  }
}

async function finishPrediction({
  category = null,
  photoId,
  prediction,
  processingToken,
  supabase,
  status,
  machineResult = {},
}: {
  category?: PhotoClassificationRunResult["category"];
  photoId: string;
  prediction: ProcessingPrediction;
  processingToken: string;
  supabase: SupabaseClient;
  status: "ready_for_review" | "failed" | "insufficient_references";
  machineResult?: Record<string, unknown>;
}): Promise<PhotoClassificationRunResult> {
  try {
    const { data, error } = await supabase.rpc("finish_photo_classification", {
      target_photo_id: photoId,
      attempt_token: processingToken,
      result_status: status,
      result_error: category,
      machine_result: machineResult,
    });
    if (error || !data)
      return {
        category: "database_failure",
        predictionId: prediction.id,
        status: "failed",
      };
    if (data.outcome === "superseded" || data.outcome === "unavailable") {
      return {
        category: null,
        predictionId: prediction.id,
        status: "superseded",
      };
    }
    if (data.outcome !== "saved")
      return {
        category: "database_failure",
        predictionId: prediction.id,
        status: "failed",
      };
    return {
      category: data.category,
      predictionId: prediction.id,
      status: data.status,
    };
  } catch {
    // An uncertain response may have committed. Never follow it with a failure
    // write that could replace that successful result.
    return {
      category: "database_failure",
      predictionId: prediction.id,
      status: "failed",
    };
  }
}

async function loadCurrentReferences(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("pet_reference_photos")
    .select(
      "id,pet_id,embedding,embedding_model,embedding_version,embedding_dimension",
    )
    .eq("user_id", userId)
    .eq("embedding_status", "ready");

  if (error) {
    return {
      error,
      readyCount: 0,
      references: [] as ClassificationReference[],
    };
  }

  const references = ((data ?? []) as ReadyReferenceRow[]).flatMap((row) => {
    if (
      row.embedding_model !== AI_MODEL_NAME ||
      row.embedding_version !== AI_MODEL_VERSION ||
      row.embedding_dimension !== AI_EMBEDDING_DIMENSION
    ) {
      return [];
    }
    const embedding = parseStoredEmbedding(row.embedding);
    return embedding
      ? [{ embedding, petId: row.pet_id, referenceId: row.id }]
      : [];
  });

  return { error: null, readyCount: (data ?? []).length, references };
}

function hasSufficientPet(references: ClassificationReference[]) {
  const counts = new Map<string, number>();
  for (const reference of references) {
    counts.set(reference.petId, (counts.get(reference.petId) ?? 0) + 1);
  }
  return [...counts.values()].some(
    (count) => count >= PHOTO_CLASSIFICATION_CONFIG.minimumReadyReferences,
  );
}

export async function processPhotoClassification({
  photo,
  supabase,
  userId,
}: {
  photo: ClassificationPhoto;
  supabase: SupabaseClient;
  userId: string;
}): Promise<PhotoClassificationRunResult> {
  if (
    photo.user_id !== userId ||
    !isUserPhotoPathForUser(photo.storage_path, userId) ||
    !photo.mime_type ||
    !STORED_IMAGE_MIME_TYPES.has(photo.mime_type)
  ) {
    return { category: "invalid_image", predictionId: null, status: "failed" };
  }

  const processingToken = crypto.randomUUID();
  const started = await startPrediction(supabase, photo.id, processingToken);
  if (started.error || !started.prediction) {
    return {
      category: "database_failure",
      predictionId: null,
      status: "failed",
    };
  }
  const prediction = started.prediction;

  const finish = (
    status: "ready_for_review" | "failed" | "insufficient_references",
    category: PhotoClassificationRunResult["category"] = null,
    machineResult: Record<string, unknown> = {},
  ) =>
    finishPrediction({
      status,
      category,
      machineResult,
      photoId: photo.id,
      prediction,
      processingToken,
      supabase,
    });
  try {
    const initialReferences = await loadCurrentReferences(supabase, userId);
    if (initialReferences.error)
      return await finish("failed", "database_failure");
    if (!hasSufficientPet(initialReferences.references)) {
      return await finish(
        initialReferences.readyCount > 0 &&
          initialReferences.references.length === 0
          ? "failed"
          : "insufficient_references",
        initialReferences.readyCount > 0 &&
          initialReferences.references.length === 0
          ? "model_mismatch"
          : null,
      );
    }

    const { data: image, error: downloadError } = await supabase.storage
      .from(USER_PHOTO_BUCKET)
      .download(photo.storage_path);
    if (downloadError || !image) {
      throw new AiEmbeddingError(
        "invalid_image",
        "The image could not be read.",
      );
    }

    const queryEmbedding = await requestImageEmbedding({
      bytes: new Uint8Array(await image.arrayBuffer()),
      mimeType: photo.mime_type,
    });
    if (
      queryEmbedding.model !== AI_MODEL_NAME ||
      queryEmbedding.version !== AI_MODEL_VERSION ||
      queryEmbedding.dimension !== AI_EMBEDDING_DIMENSION
    ) {
      return await finish("failed", "model_mismatch");
    }

    const currentReferences = await loadCurrentReferences(supabase, userId);
    if (currentReferences.error) {
      throw new AiEmbeddingError(
        "inference_failed",
        "References could not be refreshed.",
      );
    }
    const classification = classifyPhotoEmbedding({
      queryEmbedding: queryEmbedding.embedding,
      references: currentReferences.references,
    });
    if (classification.outcome === "insufficient_references") {
      return await finish("insufficient_references");
    }

    // A manual label may predate the first AI result. Preserve an existing
    // reviewed machine snapshot, but allow that first independent suggestion.
    const machineResult =
      reviewedPhotoStatus(prediction) && prediction.classification_version
        ? {}
        : {
            candidate_pet_ids: classification.candidates.map(
              (candidate) => candidate.petId,
            ),
            candidate_reference_counts: classification.candidates.map(
              (candidate) => candidate.referenceCount,
            ),
            candidate_scores: classification.candidates.map(
              (candidate) => candidate.score,
            ),
            classification_strategy: PHOTO_CLASSIFICATION_CONFIG.aggregation,
            classification_version:
              PHOTO_CLASSIFICATION_CONFIG.classificationVersion,
            configuration_version:
              PHOTO_CLASSIFICATION_CONFIG.configurationVersion,
            embedding_dimension: queryEmbedding.dimension,
            embedding_model: queryEmbedding.model,
            embedding_version: queryEmbedding.version,
            pet_id: classification.suggestedPetIds[0] ?? null,
            prediction_status: classification.suggestedUnknown
              ? "unknown"
              : "needs_review",
            suggested_pet_ids: classification.suggestedPetIds,
            suggested_unknown: classification.suggestedUnknown,
          };
    return await finish("ready_for_review", null, machineResult);
  } catch (error) {
    const category =
      error instanceof AiEmbeddingError ? error.category : "inference_failed";
    console.warn("[ai-classification]", { category });
    return await finish("failed", category);
  }
}
