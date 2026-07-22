import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { DeletePhotoForm } from "@/components/photos/delete-photo-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatPhotoCalendarDate,
  formatPhotoDimensions,
  formatPhotoFileSize,
  getPhotoDisplayDate,
  photoIdSchema,
} from "@/lib/photos/gallery";
import { getPhotoForUser } from "@/lib/photos/queries";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

type PhotoDetailPageProps = {
  params: Promise<{ id: string }>;
};

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="pet-detail-item">
      <dt>{label}</dt>
      <dd>{value || "Not available"}</dd>
    </div>
  );
}

function formatAiStatus(status: string) {
  if (status === "uploaded") {
    return "Uploaded, not processed by AI";
  }

  return status.replaceAll("_", " ");
}

export default async function PhotoDetailPage({
  params,
}: PhotoDetailPageProps) {
  const { id } = await params;
  const parsedId = photoIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const { envStatus, user } = await requireAuthenticatedSupabase();

  if (!envStatus.isConfigured || !user) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Photo unavailable</h1>
          <p className="text-secondary mt-2 text-sm">
            Add Supabase environment variables to enable private photo details.
          </p>
        </Card>
      </div>
    );
  }

  const { error, photo } = await getPhotoForUser(parsedId.data, user.id);

  if (!photo) {
    notFound();
  }

  const displayDate = getPhotoDisplayDate(photo);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/photos" className="link-primary text-sm">
            Back to photos
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="heading-page break-words">{photo.file_name}</h1>
            <Badge tone="neutral">Private</Badge>
          </div>
          <p className="text-secondary mt-2 text-sm">
            Display date: {formatPhotoCalendarDate(displayDate)}
          </p>
        </div>
        <ButtonLink href="/photos/upload" variant="secondary">
          Upload more
        </ButtonLink>
      </div>

      {error ? (
        <Alert tone="warning" role="alert" className="text-sm">
          Some photo metadata could not be refreshed.
        </Alert>
      ) : null}

      <Card className="photo-detail-shell">
        <div className="photo-detail-image-wrap">
          {photo.signed_url ? (
            <Image
              src={photo.signed_url}
              alt={photo.file_name}
              width={photo.width ?? 1400}
              height={photo.height ?? 1000}
              sizes="(min-width: 1024px) 960px, 100vw"
              className="photo-detail-image"
              priority
              unoptimized
            />
          ) : (
            <div
              className="photo-detail-missing"
              role="img"
              aria-label="Image unavailable"
            >
              This private image URL could not be created. Refresh the page and
              try again.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="heading-section">Photo details</h2>
        <dl className="mt-5 grid gap-3 md:grid-cols-2">
          <DetailItem label="Original filename" value={photo.file_name} />
          <DetailItem
            label="Display date"
            value={formatPhotoCalendarDate(displayDate)}
          />
          <DetailItem
            label="Taken date"
            value={
              photo.taken_at ? formatPhotoCalendarDate(photo.taken_at) : null
            }
          />
          <DetailItem
            label="Uploaded date"
            value={
              photo.uploaded_at
                ? formatPhotoCalendarDate(photo.uploaded_at)
                : null
            }
          />
          <DetailItem
            label="Dimensions"
            value={formatPhotoDimensions(photo.width, photo.height)}
          />
          <DetailItem
            label="File size"
            value={formatPhotoFileSize(photo.file_size)}
          />
          <DetailItem label="MIME type" value={photo.mime_type} />
          <DetailItem
            label="AI status"
            value={formatAiStatus(photo.ai_status)}
          />
        </dl>
        <Alert tone="info" className="mt-5 text-sm">
          AI classification is not implemented yet. This status only describes
          the current upload/processing state.
        </Alert>
      </Card>

      <DeletePhotoForm photoId={photo.id} fileName={photo.file_name} />
    </div>
  );
}
