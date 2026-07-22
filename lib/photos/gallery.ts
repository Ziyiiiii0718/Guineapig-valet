import { z } from "zod";
import { isUserPhotoPathForUser } from "@/lib/photos/upload";

export const PHOTO_GALLERY_PAGE_SIZE = 24;
export const PHOTO_DASHBOARD_PREVIEW_LIMIT = 4;
export const PHOTO_SIGNED_IMAGE_TTL_SECONDS = 10 * 60;

export const photoSortSchema = z.enum(["newest", "oldest"]);
export const photoIdSchema = z.string().uuid();

export type PhotoSort = z.infer<typeof photoSortSchema>;

export type PhotoDateParts = {
  created_at: string | null;
  taken_at: string | null;
  uploaded_at: string | null;
};

export type PhotoTimelineItem = PhotoDateParts & {
  id: string;
};

export type PhotoTimelineGroup<T extends PhotoTimelineItem> = {
  id: string;
  label: string;
  photos: T[];
};

export function parsePhotoSort(value: unknown): PhotoSort {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = photoSortSchema.safeParse(raw);

  return parsed.success ? parsed.data : "newest";
}

export function parsePhotoPage(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? "1"), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export function getPhotoPaginationRange(
  page: number,
  pageSize = PHOTO_GALLERY_PAGE_SIZE,
) {
  const safePage = Math.max(1, Math.trunc(page));
  const from = (safePage - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}

export function getPhotoDisplayDateValue(photo: PhotoDateParts) {
  return photo.taken_at ?? photo.uploaded_at ?? photo.created_at;
}

export function getPhotoDisplayDate(photo: PhotoDateParts) {
  const value = getPhotoDisplayDateValue(photo);

  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function comparePhotosByDisplayDate(
  left: PhotoTimelineItem,
  right: PhotoTimelineItem,
  sort: PhotoSort,
) {
  const leftTime = getPhotoDisplayDate(left)?.getTime() ?? 0;
  const rightTime = getPhotoDisplayDate(right)?.getTime() ?? 0;
  const primary =
    sort === "newest" ? rightTime - leftTime : leftTime - rightTime;

  if (primary !== 0) {
    return primary;
  }

  return sort === "newest"
    ? right.id.localeCompare(left.id)
    : left.id.localeCompare(right.id);
}

export function sortPhotosByDisplayDate<T extends PhotoTimelineItem>(
  photos: T[],
  sort: PhotoSort,
) {
  return [...photos].sort((left, right) =>
    comparePhotosByDisplayDate(left, right, sort),
  );
}

export function formatPhotoCalendarDate(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
) {
  if (!value) {
    return "Unknown date";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    ...options,
  }).format(date);
}

export function getPhotoTimelineGroupKey(photo: PhotoDateParts) {
  const date = getPhotoDisplayDate(photo);

  if (!date) {
    return {
      id: "unknown-date",
      label: "Unknown date",
    };
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return {
    id: `${year}-${month}`,
    label: formatPhotoCalendarDate(date, {
      month: "long",
      year: "numeric",
    }),
  };
}

export function groupPhotosByTimelineMonth<T extends PhotoTimelineItem>(
  photos: T[],
) {
  const groups: PhotoTimelineGroup<T>[] = [];

  for (const photo of photos) {
    const key = getPhotoTimelineGroupKey(photo);
    const current = groups.at(-1);

    if (current?.id === key.id) {
      current.photos.push(photo);
    } else {
      groups.push({
        id: key.id,
        label: key.label,
        photos: [photo],
      });
    }
  }

  return groups;
}

export function formatPhotoFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes < 1) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPhotoDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  if (!width || !height) {
    return "Unknown dimensions";
  }

  return `${width} x ${height}`;
}

export function isOwnedUserPhotoPath(path: string | null, userId: string) {
  return isUserPhotoPathForUser(path, userId);
}
