import Link from "next/link";
import { Card } from "@/components/ui/card";
import { GardenArt } from "@/components/ui/garden-art";
import { OutlineIcon, type IconName } from "@/components/ui/outline-icon";
import type { Pet } from "@/lib/pets/types";
import { formatPetSex } from "@/lib/pets/view";
import { formatMeasurementDate, formatWeightGrams } from "@/lib/weights/core";

export function PetProfileAside({
  pet,
  latestWeight,
  readyReferences,
}: {
  pet: Pet;
  latestWeight?: number;
  readyReferences: number | null;
}) {
  const base = `/pets/${pet.id}`;
  const actions: Array<{ label: string; href: string; icon: IconName }> = [
    { label: "Add Photos", href: "/photos/upload", icon: "camera" },
    { label: "Create Album", href: "/albums/new", icon: "albums" },
    { label: "Add Health Record", href: `${base}/health`, icon: "health" },
    {
      label: "Log Weight",
      href: `${base}?view=weight#pet-weight`,
      icon: "weight",
    },
  ];
  const fields = [
    { label: "Sex", value: formatPetSex(pet.sex), icon: "pets" },
    {
      label: "Birth date",
      value: pet.birth_date
        ? formatMeasurementDate(pet.birth_date)
        : "Not added yet",
      icon: "calendar",
    },
    {
      label: "Latest weight",
      value:
        latestWeight !== undefined
          ? formatWeightGrams(latestWeight)
          : "Not recorded yet",
      icon: "weight",
    },
    { label: "Favorite foods", value: pet.favorite_foods, icon: "leaf" },
    { label: "Disliked foods", value: pet.disliked_foods, icon: "leaf" },
  ] as const;
  return (
    <aside
      className="pet-utility-column"
      aria-label="Pet information and actions"
    >
      <Card className="pet-quick-actions">
        <h2>Quick Actions</h2>
        <div>
          {actions.map((action) => (
            <Link key={action.label} href={action.href} className="focus-ring">
              <span>
                <OutlineIcon name={action.icon} />
              </span>
              {action.label}
            </Link>
          ))}
        </div>
      </Card>
      <Card className="pet-info-card">
        <div className="pet-section-heading">
          <h2>Pet Info</h2>
          <Link
            href={`${base}/edit`}
            className="focus-ring"
            aria-label="Edit pet information"
          >
            <OutlineIcon name="edit" />
          </Link>
        </div>
        <dl>
          {fields
            .filter((field) => field.value)
            .map((field) => (
              <div key={field.label}>
                <dt>
                  <OutlineIcon name={field.icon} />
                  {field.label}
                </dt>
                <dd>{field.value}</dd>
              </div>
            ))}
        </dl>
        {pet.general_notes ? (
          <div className="pet-info-note">
            <h3>General notes</h3>
            <p>{pet.general_notes}</p>
          </div>
        ) : null}
      </Card>
      <Card className="pet-ai-link">
        <Link href="#pet-recognition" className="focus-ring">
          <OutlineIcon name="leaf" />
          <div>
            <h2>
              AI Tools <span aria-hidden="true">›</span>
            </h2>
            <p>
              {readyReferences === null
                ? "Manage reference photos for recognition."
                : `${readyReferences} ready ${readyReferences === 1 ? "reference" : "references"}. Set up recognition from your existing photos.`}
            </p>
          </div>
        </Link>
      </Card>
      <div className="pet-aside-garden" aria-hidden="true">
        <p>
          Small snacks
          <br />
          Big happiness ♡
        </p>
        <GardenArt />
      </div>
    </aside>
  );
}
