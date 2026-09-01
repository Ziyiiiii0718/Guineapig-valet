import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export default function AlbumNotFound() {
  return (
    <Card>
      <h1 className="heading-page">Album not found</h1>
      <p className="text-secondary mt-2 text-sm">
        That album is unavailable or does not belong to this account.
      </p>
      <div className="mt-4">
        <ButtonLink href="/albums">Back to albums</ButtonLink>
      </div>
    </Card>
  );
}
