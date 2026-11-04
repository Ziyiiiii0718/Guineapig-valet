import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PetProfileHero } from "@/components/pets/pet-profile-hero";
import { PetProfileAside } from "@/components/pets/pet-profile-aside";
import {
  RecentPetPhotos,
  PetAlbumsSection,
} from "@/components/pets/pet-media-sections";
import {
  parsePetMediaPage,
  parsePetProfileView,
  safeDisplayName,
} from "@/lib/pets/profile-view";

const pet = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  user_id: "owner",
  name: "Clover",
  sex: "female" as const,
  birth_date: "2025-04-12",
  favorite_foods: "Parsley",
  disliked_foods: null,
  personality_notes: "Enjoys exploring",
  general_notes: null,
  profile_photo_path: null,
  profile_photo_url: "https://example.test/avatar",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
afterEach(cleanup);

describe("pet profile composition", () => {
  it("uses a confirmed cover when provided and retains the separate circular avatar", () => {
    const { container } = render(
      <PetProfileHero
        pet={pet}
        coverUrl="https://example.test/confirmed"
        view="overview"
      />,
    );
    expect(container.querySelector(".pet-cover img")).toHaveAttribute(
      "src",
      "https://example.test/confirmed",
    );
    expect(
      screen.getByRole("img", { name: "Clover profile photo" }),
    ).toHaveAttribute("src", pet.profile_photo_url);
    expect(screen.getByText("Enjoys exploring")).toBeVisible();
  });

  it("falls back to a softened avatar cover and never invents a weight", () => {
    const { container } = render(<PetProfileHero pet={pet} view="overview" />);
    expect(container.querySelector(".pet-cover-avatar img")).toHaveAttribute(
      "src",
      pet.profile_photo_url,
    );
    expect(screen.queryByText(/\d[,.]?\d* g$/)).not.toBeInTheDocument();
  });

  it("uses nature artwork and the avatar initial when no image exists", () => {
    const { container } = render(
      <PetProfileHero
        pet={{ ...pet, profile_photo_url: null }}
        view="overview"
      />,
    );
    expect(
      container.querySelector(".pet-cover .garden-art"),
    ).toBeInTheDocument();
    expect(container.querySelector(".pet-cover img")).toBeNull();
    expect(screen.getByText("C")).toBeVisible();
  });

  it("routes section tabs and quick actions to real workflows without fictitious settings or breed", () => {
    render(
      <>
        <PetProfileHero pet={pet} view="photos" />
        <PetProfileAside pet={pet} readyReferences={0} />
      </>,
    );
    expect(screen.getByRole("link", { name: "Photos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Health" })).toHaveAttribute(
      "href",
      `/pets/${pet.id}/health`,
    );
    expect(screen.getByRole("link", { name: "Log Weight" })).toHaveAttribute(
      "href",
      `/pets/${pet.id}?view=weight#pet-weight`,
    );
    expect(screen.queryByText("Breed")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.getByText("Not recorded yet")).toBeVisible();
  });

  it("explains empty media without substituting unrelated gallery content", () => {
    render(
      <>
        <RecentPetPhotos
          petId={pet.id}
          petName={pet.name}
          photos={[]}
          count={0}
          error={null}
        />
        <PetAlbumsSection
          petId={pet.id}
          petName={pet.name}
          albums={[]}
          error={null}
        />
      </>,
    );
    expect(screen.getByText(/Confirm Clover in a photo review/)).toBeVisible();
    expect(
      screen.getByText(/Albums containing a photo confirmed as Clover/),
    ).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("validates page/view values and safely handles missing display names", () => {
    expect(parsePetMediaPage("-1")).toBe(1);
    expect(parsePetMediaPage("1.5")).toBe(1);
    expect(parsePetMediaPage("2")).toBe(2);
    expect(parsePetProfileView("settings")).toBe("overview");
    expect(parsePetProfileView("albums")).toBe("albums");
    expect(safeDisplayName({ name: { unsafe: true } })).toBeNull();
    expect(safeDisplayName({ display_name: "  River  " })).toBe("River");
  });
});
