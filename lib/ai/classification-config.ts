import config from "@/lib/ai/classification-config.json";

export type PhotoClassificationConfig = {
  aggregation: "top_k_mean";
  ambiguityMargin: number;
  candidateLimit: number;
  classificationVersion: string;
  configurationVersion: string;
  minimumReadyReferences: number;
  multiPetThreshold: number;
  singlePetThreshold: number;
  topKReferences: number;
};

const aggregation = config.aggregation;
if (aggregation !== "top_k_mean") {
  throw new Error("Unsupported photo classification aggregation.");
}

export const PHOTO_CLASSIFICATION_CONFIG = {
  ...config,
  aggregation,
} satisfies PhotoClassificationConfig;
