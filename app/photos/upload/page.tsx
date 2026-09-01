import Image from "next/image";
import { ConfigNotice } from "@/components/config-notice";
import { PhotoUploadForm } from "@/components/photos/photo-upload-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listPetsForUser,
  requireAuthenticatedSupabase,
} from "@/lib/pets/queries";
import { listRecentPhotosForDashboard } from "@/lib/photos/queries";

type CollagePhoto = {
  id: string;
  src: string;
};

export default async function PhotoUploadPage() {
  const { envStatus, user } = await requireAuthenticatedSupabase();

  if (!envStatus.isConfigured || !user) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Photo upload unavailable</h1>
          <p className="text-secondary mt-2 text-sm">
            Photo uploads are not available right now. Please try again later.
          </p>
        </Card>
      </div>
    );
  }

  const { pets } = await listPetsForUser(user.id);
  const collagePhotos: CollagePhoto[] = pets
    .flatMap((pet) =>
      pet.profile_photo_url
        ? [{ id: `pet-${pet.id}`, src: pet.profile_photo_url }]
        : [],
    )
    .slice(0, 2);

  if (collagePhotos.length < 2) {
    const { photos } = await listRecentPhotosForDashboard(user.id);

    for (const photo of photos) {
      if (collagePhotos.length === 2) {
        break;
      }

      if (
        photo.signed_url &&
        !collagePhotos.some(({ src }) => src === photo.signed_url)
      ) {
        collagePhotos.push({ id: `photo-${photo.id}`, src: photo.signed_url });
      }
    }
  }

  return (
    <div className="upload-page">
      <header className="upload-page-header">
        <div>
          <p className="section-kicker">Private photo upload</p>
          <h1 className="heading-page">Upload guinea pig photos</h1>
          <p className="upload-page-intro">
            Add one or more private photos to your account.
          </p>
        </div>
        <div className="upload-header-aside">
          <ButtonLink
            className="upload-gallery-link"
            href="/photos"
            variant="secondary"
          >
            View gallery <span aria-hidden="true">→</span>
          </ButtonLink>

          {collagePhotos.length > 0 ? (
            <div
              className={`upload-pet-collage upload-pet-collage-${collagePhotos.length}`}
              aria-hidden="true"
            >
              <span className="upload-collage-sprig upload-collage-sprig-left" />
              <span className="upload-collage-sprig upload-collage-sprig-right" />
              {collagePhotos.map((photo, index) => (
                <span
                  key={photo.id}
                  className={`upload-polaroid upload-polaroid-${index + 1}`}
                >
                  <span className="upload-polaroid-image">
                    <Image
                      alt=""
                      fill
                      priority
                      sizes="180px"
                      src={photo.src}
                      unoptimized
                    />
                  </span>
                </span>
              ))}
              <span className="upload-collage-squiggle">~</span>
            </div>
          ) : null}
        </div>
      </header>

      <PhotoUploadForm />
    </div>
  );
}
