type PlainDate = {
  day: number;
  month: number;
  year: number;
};

function parsePlainDate(value: string): PlainDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}

function toPlainDate(value: Date): PlainDate {
  return {
    day: value.getUTCDate(),
    month: value.getUTCMonth() + 1,
    year: value.getUTCFullYear(),
  };
}

export type PetAge = {
  months: number;
  years: number;
};

export function calculatePetAge(
  birthDate: string,
  asOf: string | Date = new Date(),
): PetAge {
  const birth = parsePlainDate(birthDate);
  const reference =
    typeof asOf === "string" ? parsePlainDate(asOf) : toPlainDate(asOf);

  if (!birth || !reference) {
    return { months: 0, years: 0 };
  }

  let years = reference.year - birth.year;
  let months = reference.month - birth.month;

  if (reference.day < birth.day) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) {
    return { months: 0, years: 0 };
  }

  return { months, years };
}

function pluralize(value: number, singular: string) {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}

export function formatPetAge(birthDate: string, asOf?: string | Date) {
  const age = calculatePetAge(birthDate, asOf);

  if (age.years === 0 && age.months === 0) {
    return "Less than 1 month old";
  }

  if (age.years === 0) {
    return `${pluralize(age.months, "month")} old`;
  }

  if (age.months === 0) {
    return `${pluralize(age.years, "year")} old`;
  }

  return `${pluralize(age.years, "year")}, ${pluralize(age.months, "month")} old`;
}
