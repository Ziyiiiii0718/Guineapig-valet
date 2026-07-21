export const PET_SEX_VALUES = ["female", "male", "unknown"] as const;

export type PetSex = (typeof PET_SEX_VALUES)[number];

export type Pet = {
  birth_date: string;
  created_at: string;
  disliked_foods: string | null;
  favorite_foods: string | null;
  general_notes: string | null;
  id: string;
  name: string;
  personality_notes: string | null;
  profile_photo_path: string | null;
  sex: PetSex;
  updated_at: string;
  user_id: string;
};

export type PetFormFields = {
  birthDate: string;
  dislikedFoods: string;
  favoriteFoods: string;
  generalNotes: string;
  name: string;
  personalityNotes: string;
  sex: string;
};

export const EMPTY_PET_FORM_FIELDS: PetFormFields = {
  birthDate: "",
  dislikedFoods: "",
  favoriteFoods: "",
  generalNotes: "",
  name: "",
  personalityNotes: "",
  sex: "unknown",
};
