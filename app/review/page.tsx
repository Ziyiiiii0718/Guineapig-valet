import Image from "next/image";
import Link from "next/link";
import { AnalyzePhotoForm } from "@/components/ai/analyze-photo-form";
import { ReviewPredictionForm } from "@/components/ai/review-prediction-form";
import { ConfigNotice } from "@/components/config-notice";
import { PhotoNameEditor } from "@/components/photos/photo-name-editor";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  formatPetLabels,
  getSuggestionLabel,
  isPredictionProcessingStale,
  parseReviewFilter,
  REVIEW_FILTERS,
  type ReviewFilter,
} from "@/lib/ai/predictions";
import {
  getReviewForPhoto,
  listReviewQueue,
} from "@/lib/ai/prediction-queries";
import { getPhotoDisplayName } from "@/lib/photos/display-name";
import { photoIdSchema } from "@/lib/photos/gallery";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

import { parseReviewCursor, reviewPageHref } from "@/lib/ai/review-pagination";

const FILTER_LABELS: Record<ReviewFilter, string> = {
  "needs-review": "Needs review",
  all: "All",
  confirmed: "Confirmed",
  corrected: "Corrected",
  failed: "Failed",
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = parseReviewFilter(params.filter);
  const requestedPhoto = photoIdSchema.safeParse(
    Array.isArray(params.photo) ? params.photo[0] : params.photo,
  );
  const { envStatus, user } = await requireAuthenticatedSupabase();
  if (!envStatus.isConfigured || !user) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Review unavailable</h1>
          <p className="text-secondary mt-2 text-sm">
            Sign in and configure Supabase to review private photo suggestions.
          </p>
        </Card>
      </div>
    );
  }

  const direct = params.photo !== undefined;
  const cursor = parseReviewCursor(params.cursor);
  const lookup =
    direct && requestedPhoto.success
      ? await getReviewForPhoto(requestedPhoto.data, user.id)
      : null;
  const result = direct
    ? {
        error: lookup?.error,
        pets: lookup?.pets ?? [],
        items:
          lookup?.photo && lookup.prediction
            ? [{ photo: lookup.photo, prediction: lookup.prediction }]
            : [],
        previousCursor: null,
        nextCursor: null,
      }
    : await listReviewQueue(user.id, filter, cursor);
  const items = result.error ? [] : result.items;

  return (
    <div className="review-page">
      <header className="review-page-header">
        <div>
          <p className="section-kicker">Human review</p>
          <h1 className="heading-page mt-1">Review photo suggestions</h1>
          <p className="text-secondary mt-2 max-w-2xl">
            AI offers a starting point. You decide which pets are actually in
            each private photo.
          </p>
        </div>
        <Link className="link-primary text-sm" href="/photos">
          Back to photos
        </Link>
      </header>

      <nav className="review-filters" aria-label="Review queue filters">
        {REVIEW_FILTERS.map((value) => (
          <Link
            aria-current={!direct && filter === value ? "page" : undefined}
            className="focus-ring"
            href={`/review?filter=${value}`}
            key={value}
          >
            {FILTER_LABELS[value]}
          </Link>
        ))}
      </nav>

      {result.error ? (
        <Alert role="alert" tone="error">
          We could not load the review queue. Please try again.
        </Alert>
      ) : null}

      {direct && !result.error && lookup?.photo && !lookup.prediction ? (
        <Card>
          <h2 className="heading-section">Not analyzed yet. AI is optional.</h2>
          <Link className="link-primary" href={`/photos/${lookup.photo.id}`}>
            Open photo
          </Link>
          <ReviewPredictionForm
            pets={result.pets}
            photoId={lookup.photo.id}
            prediction={null}
            manual
          />
        </Card>
      ) : null}
      {!result.error && items.length === 0 && !lookup?.photo ? (
        <div className="review-empty-state">
          <h2 className="heading-section">Nothing here right now</h2>
          <p className="text-secondary mt-2 text-sm">
            {direct
              ? "This photo is unavailable or you do not have access."
              : cursor
                ? "No more photos on this page. Return to the first page to refresh the queue."
                : filter === "needs-review"
                  ? "You’re all caught up. New analyzed photos will appear here."
                  : "No photos match this filter."}
          </p>
        </div>
      ) : null}

      {!direct ? (
        <nav
          aria-label="Review queue pagination"
          className="flex flex-wrap items-center gap-4 text-sm"
        >
          {cursor ? (
            <Link className="link-primary" href={reviewPageHref(filter)}>
              First page / refresh
            </Link>
          ) : null}
          {!result.error && result.previousCursor ? (
            <Link
              className="link-primary"
              href={reviewPageHref(filter, result.previousCursor)}
            >
              Previous page
            </Link>
          ) : null}
          {!result.error && result.nextCursor ? (
            <Link
              className="link-primary"
              href={reviewPageHref(filter, result.nextCursor)}
            >
              Next page
            </Link>
          ) : null}
        </nav>
      ) : null}
      <div className="review-list">
        {items.map(({ photo, prediction }) => {
          const displayName = getPhotoDisplayName(photo);
          const suggestion = getSuggestionLabel(prediction);
          const finalLabel = formatPetLabels(
            prediction.confirmedPets,
            prediction.confirmed_unknown,
          );
          const processingStale = isPredictionProcessingStale(prediction);
          return (
            <article className="review-item" key={prediction.id}>
              <Link
                aria-label={`Open ${displayName}`}
                className="review-image-wrap focus-ring"
                href={`/photos/${photo.id}`}
              >
                {photo.signed_url ? (
                  <Image
                    alt={displayName}
                    className="review-image"
                    fill
                    sizes="(min-width: 900px) 360px, 100vw"
                    src={photo.signed_url}
                    unoptimized
                  />
                ) : (
                  <span>Image unavailable</span>
                )}
              </Link>
              <div className="review-item-content">
                <div className="review-item-title">
                  <PhotoNameEditor
                    displayName={displayName}
                    hasCustomName={Boolean(photo.display_name?.trim())}
                    photoId={photo.id}
                  />
                  <Badge
                    tone={
                      prediction.processing_status === "failed"
                        ? "warning"
                        : prediction.review_status === "pending_review"
                          ? "neutral"
                          : "success"
                    }
                  >
                    {prediction.processing_status === "failed"
                      ? "AI unavailable"
                      : prediction.review_status.replaceAll("_", " ")}
                  </Badge>
                </div>

                {prediction.processing_status === "ready_for_review" ? (
                  <div className="review-suggestion">
                    <p>
                      AI suggestion: <strong>{suggestion ?? "Unknown"}</strong>
                    </p>
                    {prediction.candidates.length > 0 ? (
                      <p className="text-secondary text-sm">
                        Closest known pets:{" "}
                        {prediction.candidates
                          .map((candidate) => candidate.name)
                          .join(", ")}
                        . Similarity is used only for ranking, not as a
                        probability.
                      </p>
                    ) : null}
                    {finalLabel ? (
                      <p className="text-secondary text-sm">
                        Saved label: <strong>{finalLabel}</strong>
                      </p>
                    ) : null}
                  </div>
                ) : prediction.processing_status ===
                  "insufficient_references" ? (
                  <p className="text-secondary text-sm">
                    Add at least two ready references for a pet, then retry.
                  </p>
                ) : prediction.processing_status === "failed" ? (
                  <p className="text-secondary text-sm">
                    The original photo is safe. Retry when the AI service is
                    available.
                  </p>
                ) : processingStale ? (
                  <p className="text-secondary text-sm">
                    Analysis was interrupted. Your photo is safe; retry when
                    ready.
                  </p>
                ) : (
                  <p className="text-secondary text-sm">
                    {prediction.processing_status === "pending" &&
                    !prediction.classification_started_at
                      ? "Not analyzed yet. AI is optional."
                      : "Analyzing…"}
                  </p>
                )}

                <ReviewPredictionForm
                  pets={result.pets}
                  photoId={photo.id}
                  prediction={prediction}
                  manual={prediction.processing_status !== "ready_for_review"}
                />
                {prediction.processing_status === "failed" ||
                prediction.processing_status === "insufficient_references" ||
                processingStale ? (
                  <AnalyzePhotoForm label="Retry AI" photoId={photo.id} />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
