import type { Pet, PetFormFields, PetSex } from "@/lib/pets/types";

export function formatPetSex(sex: PetSex | string) {
  if (sex === "female") {
    return "Female";
  }

  if (sex === "male") {
    return "Male";
  }

  return "Unknown";
}

export function petToFormFields(pet: Pet): PetFormFields {
  return {
    birthDate: pet.birth_date,
    dislikedFoods: pet.disliked_foods ?? "",
    favoriteFoods: pet.favorite_foods ?? "",
    generalNotes: pet.general_notes ?? "",
    name: pet.name,
    personalityNotes: pet.personality_notes ?? "",
    sex: pet.sex,
  };
}

export function displayOptional(value: string | null | undefined) {
  return value?.trim() ? value : "Not added yet";
}
