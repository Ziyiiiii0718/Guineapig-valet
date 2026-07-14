export type PhotoClassificationStatus =
  "specific_pet" | "unknown" | "not_a_guinea_pig" | "needs_review";

export type AiPhotoRequest = {
  photoId: string;
  userId: string;
  storagePath: string;
};

export type AiPhotoPrediction = {
  photoId: string;
  status: PhotoClassificationStatus;
  petId: string | null;
  confidence: number | null;
  modelVersion: string;
  needsManualReview: boolean;
};

export type AiServiceError = {
  photoId: string;
  code: "temporary_failure" | "invalid_image" | "service_unavailable";
  message: string;
};
