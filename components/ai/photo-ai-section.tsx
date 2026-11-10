import Link from "next/link";
import { AnalyzePhotoForm } from "@/components/ai/analyze-photo-form";
import { Badge } from "@/components/ui/badge";
import {
  formatPetLabels,
  getSuggestionLabel,
  isPredictionProcessingStale,
  type PhotoPredictionView,
} from "@/lib/ai/predictions";

export function PhotoAiSection({
  photoId,
  prediction,
}: {
  photoId: string;
  prediction: PhotoPredictionView | null;
}) {
  if (!prediction) {
    return (
      <div className="photo-ai-section">
        <div>
          <h2 className="heading-section">AI pet suggestion</h2>
          <p className="text-secondary mt-2 text-sm">Not analyzed yet.</p>
        </div>
        <AnalyzePhotoForm photoId={photoId} />
      </div>
    );
  }

  const finalLabel = formatPetLabels(
    prediction.confirmedPets,
    prediction.confirmed_unknown,
  );
  const suggestion = getSuggestionLabel(prediction);
  const reviewed =
    prediction.review_status === "confirmed" ||
    prediction.review_status === "corrected";
  const notAnalyzed =
    prediction.processing_status === "pending" &&
    !prediction.classification_started_at;
  const processingStale = isPredictionProcessingStale(prediction);

  return (
    <div className="photo-ai-section">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="heading-section">AI pet suggestion</h2>
          {reviewed ? <Badge tone="success">Your labels saved</Badge> : null}
        </div>

        {reviewed ? (
          <div className="mt-3 space-y-1">
            <p className="font-bold">Your labels: {finalLabel}</p>
            {suggestion ? (
              <p className="text-secondary text-sm">
                AI suggestion: {suggestion}
              </p>
            ) : null}
            {notAnalyzed ? (
              <p className="text-secondary text-sm">
                Not analyzed yet. AI is optional.
              </p>
            ) : null}
          </div>
        ) : notAnalyzed ? (
          <p className="text-secondary mt-2 text-sm">
            Not analyzed yet. Your labels do not require AI.
          </p>
        ) : processingStale ? (
          <p className="text-secondary mt-2 text-sm">
            Analysis was interrupted. Your photo is safe; retry when ready.
          </p>
        ) : prediction.processing_status === "processing" ||
          prediction.processing_status === "pending" ? (
          <p className="text-secondary mt-2 text-sm">Analyzing…</p>
        ) : prediction.processing_status === "ready_for_review" ? (
          <div className="mt-3 space-y-2">
            <p>
              Suggested: <strong>{suggestion ?? "Unknown"}</strong>
            </p>
            <p className="text-secondary text-sm">
              This is a similarity-based suggestion, not a probability.
            </p>
            <Link
              className="link-primary text-sm"
              href={`/review?photo=${photoId}`}
            >
              Review prediction
            </Link>
          </div>
        ) : prediction.processing_status === "insufficient_references" ? (
          <p className="text-secondary mt-2 text-sm">
            Add at least two ready references for a pet before analyzing.
          </p>
        ) : (
          <p className="text-secondary mt-2 text-sm">
            AI analysis is unavailable. The original photo is unchanged.
          </p>
        )}
      </div>

      {notAnalyzed ? (
        <AnalyzePhotoForm photoId={photoId} />
      ) : prediction.processing_status === "failed" ||
        prediction.processing_status === "insufficient_references" ||
        processingStale ? (
        <AnalyzePhotoForm label="Retry AI" photoId={photoId} />
      ) : null}
    </div>
  );
}
