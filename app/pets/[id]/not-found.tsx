import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function PetNotFound() {
  return (
    <Card>
      <h1 className="heading-page">Pet profile not found</h1>
      <p className="text-secondary mt-2 max-w-xl text-sm leading-6">
        This profile may not exist, or it may belong to another account.
        PiggieVault does not reveal private pet IDs.
      </p>
      <div className="mt-5">
        <ButtonLink href="/pets" variant="secondary">
          Back to pets
        </ButtonLink>
      </div>
    </Card>
  );
}
