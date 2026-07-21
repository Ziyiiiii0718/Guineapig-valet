import { ConfigNotice } from "@/components/config-notice";
import { PetForm } from "@/components/pets/pet-form";
import { Card } from "@/components/ui/card";
import { requireAuthenticatedSupabase } from "@/lib/pets/queries";

export default async function NewPetPage() {
  const { envStatus, user } = await requireAuthenticatedSupabase();

  if (!envStatus.isConfigured || !user) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <Card>
          <h1 className="heading-page">Create pet unavailable</h1>
          <p className="text-secondary mt-2 text-sm">
            Add Supabase environment variables to create guinea pig profiles.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="section-kicker">New profile</p>
        <h1 className="heading-page mt-2">Create a guinea pig profile</h1>
        <p className="text-secondary mt-2 text-sm leading-6">
          Start with the profile details that are safe to store now. Private
          profile photos can be added after this profile exists.
        </p>
      </div>
      <PetForm cancelHref="/pets" mode="create" />
    </div>
  );
}
