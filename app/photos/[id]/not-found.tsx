import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function PhotoNotFound() {
  return (
    <Card>
      <h1 className="heading-page">Photo not found</h1>
      <p className="text-secondary mt-2 text-sm leading-6">
        We could not find that private photo. It may have been deleted, or it
        may belong to another account.
      </p>
      <div className="mt-5">
        <ButtonLink href="/photos">Back to photos</ButtonLink>
      </div>
    </Card>
  );
}
