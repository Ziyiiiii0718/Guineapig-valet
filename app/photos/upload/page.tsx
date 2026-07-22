import { ConfigNotice } from "@/components/config-notice";
import { PhotoUploadForm } from "@/components/photos/photo-upload-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

export default async function PhotoUploadPage() {
  const { envStatus, user } = await requireAuthenticatedSupabase();

  if (!envStatus.isConfigured || !user) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Photo upload unavailable</h1>
          <p className="text-secondary mt-2 text-sm">
            Add Supabase environment variables to upload private photos.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">Private photo upload</p>
          <h1 className="heading-page mt-2">Upload guinea pig photos</h1>
          <p className="text-secondary mt-2 max-w-2xl text-sm leading-6">
            Add one or more private photos to your account. Albums, pet labels,
            and AI review remain planned for later phases.
          </p>
        </div>
        <ButtonLink href="/photos" variant="secondary">
          View gallery
        </ButtonLink>
      </div>

      <PhotoUploadForm />
    </div>
  );
}
