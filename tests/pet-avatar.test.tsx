import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PetAvatar } from "@/components/pets/pet-avatar";
import { PetCard } from "@/components/pets/pet-card";
import {
  buildPetAvatarPath,
  getPetAvatarValidationError,
  isPetAvatarPathForUser,
  PET_AVATAR_MAX_SIZE_BYTES,
} from "@/lib/pets/avatar";

const pet = {
  birth_date: "2025-04-12",
  favorite_foods: "Cilantro",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Annie",
  personality_notes: "Curious and calm",
  profile_photo_path: "user-1/11111111-1111-4111-8111-111111111111/avatar.webp",
  profile_photo_url: "https://example.test/signed-avatar",
  sex: "female" as const,
};

describe("pet avatar validation and presentation", () => {
  it("accepts supported avatar image types within the size limit", () => {
    expect(
      getPetAvatarValidationError({ size: 1200, type: "image/jpeg" }),
    ).toBeNull();
    expect(
      getPetAvatarValidationError({ size: 1200, type: "image/png" }),
    ).toBeNull();
    expect(
      getPetAvatarValidationError({ size: 1200, type: "image/webp" }),
    ).toBeNull();
  });

  it("rejects unsupported, empty, and oversized avatar files", () => {
    expect(getPetAvatarValidationError({ size: 1200, type: "image/gif" })).toBe(
      "Avatar must be a JPEG, PNG, or WEBP image.",
    );
    expect(getPetAvatarValidationError({ size: 0, type: "image/png" })).toBe(
      "Choose a JPEG, PNG, or WEBP image.",
    );
    expect(
      getPetAvatarValidationError({
        size: PET_AVATAR_MAX_SIZE_BYTES + 1,
        type: "image/png",
      }),
    ).toBe("Avatar image must be 5 MB or smaller.");
  });

  it("builds ownership-scoped storage paths", () => {
    const path = buildPetAvatarPath({
      mimeType: "image/webp",
      petId: pet.id,
      uniqueId: "avatar-id",
      userId: "user-1",
    });

    expect(path).toBe(
      "user-1/11111111-1111-4111-8111-111111111111/avatar-id.webp",
    );
    expect(isPetAvatarPathForUser(path, "user-1")).toBe(true);
    expect(isPetAvatarPathForUser(path, "user-2")).toBe(false);
  });

  it("keeps the initial-letter fallback when no signed avatar URL exists", () => {
    render(<PetAvatar name="Annie" />);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Annie profile photo" }),
    ).not.toBeInTheDocument();
  });

  it("renders an accessible image when a signed avatar URL exists", () => {
    render(<PetAvatar name="Annie" src={pet.profile_photo_url} />);

    expect(
      screen.getByRole("img", { name: "Annie profile photo" }),
    ).toHaveAttribute("src", pet.profile_photo_url);
  });

  it("makes the pet card route to the pet profile", () => {
    render(<PetCard pet={pet} />);

    expect(screen.getByRole("link", { name: /Annie/ })).toHaveAttribute(
      "href",
      `/pets/${pet.id}`,
    );
  });
});
