import Image from "next/image";
import { ReferencePhotoActions } from "@/components/references/reference-photo-actions";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getPhotoDisplayName } from "@/lib/photos/display-name";
import type { ReferencePhotoView } from "@/lib/references/queries";
import {
  RECOMMENDED_REFERENCE_MAX,
  RECOMMENDED_REFERENCE_MIN,
} from "@/lib/references/validation";

function statusPresentation(status: ReferencePhotoView["embedding_status"]) {
  if (status === "ready") return { label: "Ready", tone: "success" as const };
  if (status === "failed") return { label: "Failed", tone: "warning" as const };
  if (status === "processing") {
    return { label: "Processing", tone: "neutral" as const };
  }
  return { label: "Pending", tone: "neutral" as const };
}

export function ReferencePhotosSection({
  aiConfigured,
  petId,
  petName,
  references,
}: {
  aiConfigured: boolean;
  petId: string;
  petName: string;
  references: ReferencePhotoView[];
}) {
  return (
    <section aria-labelledby="reference-photos-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">AI foundation</p>
          <h2 id="reference-photos-heading" className="heading-section mt-1">
            AI reference photos
          </h2>
          <p className="text-secondary mt-2 max-w-2xl text-sm leading-6">
            Reference photos help PiggieVault recognize {petName} in new photos.
            Suggestions remain separate from the pet labels you confirm.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success">
            {references.length}{" "}
            {references.length === 1 ? "reference" : "references"}
          </Badge>
          <ButtonLink href={`/pets/${petId}/references`} variant="secondary">
            Add reference photos
          </ButtonLink>
        </div>
      </div>

      {!aiConfigured ? (
        <div className="alert alert-warning mt-5 text-sm" role="status">
          Embedding generation is unavailable until the local AI service is
          configured. Existing pet-care features continue to work normally.
        </div>
      ) : null}

      {references.length === 0 ? (
        <div className="empty-state mt-5 text-sm">
          No reference photos yet. Choose several clear photos from different
          angles when you are ready.
        </div>
      ) : (
        <div className="reference-photo-grid mt-5">
          {references.map((reference) => {
            const status = statusPresentation(reference.embedding_status);
            const name = reference.photo
              ? getPhotoDisplayName(reference.photo)
              : "Unavailable photo";
            return (
              <article key={reference.id} className="reference-photo-item">
                <div className="reference-photo-image-wrap">
                  {reference.photo?.signed_url ? (
                    <Image
                      src={reference.photo.signed_url}
                      alt={name}
                      fill
                      loading="eager"
                      sizes="(min-width: 1024px) 18vw, (min-width: 640px) 33vw, 50vw"
                      className="reference-photo-image"
                      unoptimized
                    />
                  ) : (
                    <span className="album-cover-placeholder">PV</span>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-bold">{name}</p>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                {reference.embedding_status === "failed" ? (
                  <p className="text-secondary mt-2 text-xs">
                    Embedding could not be generated. The reference photo is
                    still saved.
                  </p>
                ) : null}
                <ReferencePhotoActions
                  petId={petId}
                  referenceId={reference.id}
                  showRetry={reference.embedding_status === "failed"}
                />
              </article>
            );
          })}
        </div>
      )}

      <div className="reference-guidance mt-5 text-sm">
        <strong>Photo guidance:</strong> Aim for about{" "}
        {RECOMMENDED_REFERENCE_MIN}–{RECOMMENDED_REFERENCE_MAX} clear photos
        with different angles, face and body views, and minimal blur or
        obstruction. This is guidance, not a requirement.
      </div>
    </section>
  );
}
