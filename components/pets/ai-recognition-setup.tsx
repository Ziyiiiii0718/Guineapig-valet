/* eslint-disable @next/next/no-img-element */
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { OutlineIcon } from "@/components/ui/outline-icon";
import { ReferencePhotosSection } from "@/components/references/reference-photos-section";
import type { ReferencePhotoView } from "@/lib/references/queries";
import { getPhotoDisplayName } from "@/lib/photos/display-name";

export function AiRecognitionSetup({
  petId,
  petName,
  references,
  aiConfigured,
  error,
}: {
  petId: string;
  petName: string;
  references: ReferencePhotoView[];
  aiConfigured: boolean;
  error: unknown;
}) {
  const ready = references.filter(
    (reference) => reference.embedding_status === "ready",
  ).length;
  return (
    <Card className="pet-recognition" id="pet-recognition">
      <div className="pet-recognition-heading">
        <span>
          <OutlineIcon name="camera" />
        </span>
        <div>
          <h2>AI Reference Photos</h2>
          <p>
            These reference photos help PiggieVault recognize {petName} in new
            photos.
            <br />
            You usually only need to set this up once.
          </p>
        </div>
      </div>
      {error ? (
        <p className="alert alert-warning" role="alert">
          Reference photos could not be loaded. Please try again.
        </p>
      ) : (
        <>
          <div className="pet-reference-preview">
            <div className="pet-reference-strip">
              {references.slice(0, 4).map((reference) => (
                <div key={reference.id}>
                  {reference.photo?.signed_url ? (
                    <img
                      src={reference.photo.signed_url}
                      alt={getPhotoDisplayName(reference.photo)}
                      loading="eager"
                    />
                  ) : (
                    <OutlineIcon name="photos" />
                  )}
                  <span>{reference.embedding_status}</span>
                </div>
              ))}
              <ButtonLink
                href={`/pets/${petId}/references`}
                variant="ghost"
                className="pet-reference-add"
              >
                <span aria-hidden="true">+</span>Add from
                <br />
                Your Photos
              </ButtonLink>
            </div>
            <div className="pet-reference-footer">
              <strong>
                {ready} reference {ready === 1 ? "photo" : "photos"} ready
              </strong>
              <ButtonLink
                href={`/pets/${petId}/references`}
                variant="secondary"
              >
                Manage References
              </ButtonLink>
            </div>
          </div>
          {references.length > 0 || !aiConfigured ? (
            <details className="pet-reference-details">
              <summary className="focus-ring">
                View all reference statuses, retry or remove
              </summary>
              <ReferencePhotosSection
                aiConfigured={aiConfigured}
                petId={petId}
                petName={petName}
                references={references}
              />
            </details>
          ) : null}
        </>
      )}
      <div className="pet-reference-upload">
        <OutlineIcon name="leaf" />
        <div>
          <h3>Need more photos?</h3>
          <p>
            Upload more photos to your private gallery first, then add them as
            references.
          </p>
        </div>
        <ButtonLink href="/photos/upload">Go to Upload</ButtonLink>
      </div>
    </Card>
  );
}
