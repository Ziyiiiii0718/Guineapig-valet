/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { PetAvatar } from "@/components/pets/pet-avatar";
import { MetadataPill } from "@/components/pets/metadata-pill";
import { ButtonLink } from "@/components/ui/button";
import { GardenArt } from "@/components/ui/garden-art";
import { OutlineIcon } from "@/components/ui/outline-icon";
import type { Pet } from "@/lib/pets/types";
import { formatPetAge } from "@/lib/pets/age";
import { formatPetSex } from "@/lib/pets/view";
import { formatMeasurementDate, formatWeightGrams } from "@/lib/weights/core";
import type { PetProfileView } from "@/lib/pets/profile-view";

export function PetProfileHero({
  pet,
  coverUrl,
  latestWeight,
  view,
}: {
  pet: Pet & { profile_photo_url: string | null };
  coverUrl?: string | null;
  latestWeight?: number;
  view: PetProfileView;
}) {
  const cover = coverUrl || pet.profile_photo_url;
  const base = `/pets/${pet.id}`;
  const tabs = [
    { label: "Overview", href: base, active: view === "overview" },
    {
      label: "Photos",
      href: `${base}?view=photos#pet-photos`,
      active: view === "photos",
    },
    {
      label: "Albums",
      href: `${base}?view=albums#pet-albums`,
      active: view === "albums",
    },
    { label: "Health", href: `${base}/health`, active: false },
    {
      label: "Weight",
      href: `${base}?view=weight#pet-weight`,
      active: view === "weight",
    },
  ];
  return (
    <header className="pet-home-hero" id="pet-overview">
      <div
        className={`pet-cover ${!coverUrl && pet.profile_photo_url ? "pet-cover-avatar" : ""}`}
      >
        {cover ? <img src={cover} alt="" /> : <GardenArt />}
        <ButtonLink
          href={`${base}/edit`}
          variant="secondary"
          className="pet-cover-edit"
        >
          <OutlineIcon name="edit" />
          Edit Profile
        </ButtonLink>
      </div>
      <div className="pet-home-identity">
        <PetAvatar
          name={pet.name}
          src={pet.profile_photo_url}
          className="pet-home-avatar"
        />
        <div className="pet-home-bio">
          <div className="pet-home-name">
            <h1>{pet.name}</h1>
            <Link
              href={`${base}/edit`}
              className="pet-edit-link focus-ring"
              aria-label="Edit pet profile"
            >
              <OutlineIcon name="edit" />
            </Link>
          </div>
          <div className="pet-metadata">
            <MetadataPill icon="pets">{formatPetSex(pet.sex)}</MetadataPill>
            <MetadataPill icon="calendar">
              {pet.birth_date
                ? `Born ${formatMeasurementDate(pet.birth_date)}`
                : formatPetAge(pet.birth_date)}
            </MetadataPill>
            {latestWeight !== undefined ? (
              <MetadataPill icon="weight">
                {formatWeightGrams(latestWeight)}
              </MetadataPill>
            ) : null}
          </div>
          <p>
            {pet.personality_notes ||
              pet.general_notes ||
              "Photos, little milestones, and everyday care. All in one private place."}
          </p>
        </div>
      </div>
      <nav className="pet-overview-tabs" aria-label="Pet profile sections">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className="focus-ring"
            aria-current={tab.active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
