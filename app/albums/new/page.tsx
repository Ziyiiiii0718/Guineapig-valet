import { AlbumForm } from "@/components/albums/album-form";
import { ConfigNotice } from "@/components/config-notice";
import { Card } from "@/components/ui/card";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

export default async function NewAlbumPage() {
  const { envStatus, user } = await requireAuthenticatedSupabase();
  if (!envStatus.isConfigured || !user)
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
      </div>
    );
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="section-kicker">Private collection</p>
        <h1 className="heading-page mt-1">Create album</h1>
        <p className="text-secondary mt-2 text-sm leading-6">
          Album names are metadata only. Your photo files remain in their
          existing private Storage paths.
        </p>
      </div>
      <Card>
        <AlbumForm />
      </Card>
    </div>
  );
}
