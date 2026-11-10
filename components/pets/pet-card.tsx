import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { OutlineIcon } from "@/components/ui/outline-icon";
import { MetadataPill } from "@/components/pets/metadata-pill";
import { formatWeightGrams } from "@/lib/weights/core";
import { formatPetAge } from "@/lib/pets/age";
import type { Pet } from "@/lib/pets/types";
import { formatPetSex } from "@/lib/pets/view";
import { PetAvatar } from "@/components/pets/pet-avatar";

type PetCardProps = {
  pet: Pick<Pet, "birth_date" | "id" | "name" | "sex"> & {
    profile_photo_url?: string | null;
    personality_notes?: string | null;
    general_notes?: string | null;
  };
  latestWeight?: number;
};

export function PetCard({ pet, latestWeight }: PetCardProps) {
  return (
    <article className="pet-lifestyle-card">
      <Link
        className="pet-card-photo focus-ring"
        href={`/pets/${pet.id}`}
        aria-label={`View ${pet.name}'s profile`}
      >
        <PetAvatar
          className="pet-showcase-avatar"
          name={pet.name}
          src={pet.profile_photo_url}
        />
      </Link>
      <div className="pet-card-body">
        <div className="pet-card-heading">
          <h2>{pet.name}</h2>
          <Link
            className="pet-edit-link focus-ring"
            href={`/pets/${pet.id}/edit`}
            aria-label="Edit profile"
          >
            <OutlineIcon name="edit" />
          </Link>
        </div>
        <div className="pet-metadata">
          <MetadataPill icon="pets">{formatPetSex(pet.sex)}</MetadataPill>
          <MetadataPill icon="calendar">
            {formatPetAge(pet.birth_date)}
          </MetadataPill>
          {latestWeight !== undefined ? (
            <MetadataPill icon="weight">
              {formatWeightGrams(latestWeight)}
            </MetadataPill>
          ) : null}
        </div>
        <p className="pet-card-description">
          {pet.personality_notes ||
            pet.general_notes ||
            "A little space for their photos, memories, and everyday care."}
        </p>
        <ButtonLink href={`/pets/${pet.id}`} variant="secondary">
          View Profile <OutlineIcon name="arrow" />
        </ButtonLink>
      </div>
    </article>
  );
}
