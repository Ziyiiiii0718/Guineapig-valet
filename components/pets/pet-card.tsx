import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPetAge } from "@/lib/pets/age";
import type { Pet } from "@/lib/pets/types";
import { formatPetSex } from "@/lib/pets/view";
import { PetAvatar } from "@/components/pets/pet-avatar";

type PetCardProps = {
  pet: Pick<
    Pet,
    | "birth_date"
    | "favorite_foods"
    | "id"
    | "name"
    | "personality_notes"
    | "profile_photo_path"
    | "sex"
  > & { profile_photo_url?: string | null };
};

export function PetCard({ pet }: PetCardProps) {
  return (
    <Link
      className="card pet-card pet-card-link focus-ring"
      href={`/pets/${pet.id}`}
    >
      <div className="flex items-start gap-4">
        <PetAvatar name={pet.name} src={pet.profile_photo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="heading-section text-lg">{pet.name}</h2>
            <Badge tone="success">{formatPetSex(pet.sex)}</Badge>
          </div>
          <p className="text-secondary mt-1 text-sm">
            {formatPetAge(pet.birth_date)}
          </p>
        </div>
      </div>
      <p className="text-secondary mt-4 line-clamp-2 text-sm leading-6">
        {pet.personality_notes ||
          pet.favorite_foods ||
          "No notes yet. Add personality details or favorite foods when you edit this profile."}
      </p>
      <span className="pet-card-cta mt-5">View profile</span>
    </Link>
  );
}
