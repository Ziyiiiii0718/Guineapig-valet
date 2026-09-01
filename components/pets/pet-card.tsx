import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPetAge } from "@/lib/pets/age";
import type { Pet } from "@/lib/pets/types";
import { formatPetSex } from "@/lib/pets/view";
import { PetAvatar } from "@/components/pets/pet-avatar";

type PetCardProps = {
  pet: Pick<Pet, "birth_date" | "id" | "name" | "sex"> & {
    profile_photo_url?: string | null;
  };
};

export function PetCard({ pet }: PetCardProps) {
  return (
    <Link
      className="pet-showcase pet-card-link focus-ring"
      href={`/pets/${pet.id}`}
      aria-label={`View ${pet.name}'s profile`}
    >
      <PetAvatar
        className="pet-showcase-avatar"
        name={pet.name}
        src={pet.profile_photo_url}
      />
      <div className="pet-showcase-details">
        <div>
          <h2 className="pet-showcase-name">{pet.name}</h2>
          <Badge tone="success">{formatPetSex(pet.sex)}</Badge>
        </div>
        <p className="pet-showcase-age">{formatPetAge(pet.birth_date)}</p>
        <span className="pet-showcase-action">
          View profile <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
