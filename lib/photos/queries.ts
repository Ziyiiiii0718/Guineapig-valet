import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  comparePhotosByDisplayDate,
  getPhotoPaginationRange,
  isOwnedUserPhotoPath,
  type PhotoSort,
  PHOTO_DASHBOARD_PREVIEW_LIMIT,
  PHOTO_GALLERY_PAGE_SIZE,
  PHOTO_SIGNED_IMAGE_TTL_SECONDS,
} from "@/lib/photos/gallery";
import { USER_PHOTO_BUCKET } from "@/lib/photos/upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PhotoRow = {
  ai_status: string;
  created_at: string | null;
  file_name: string;
  file_size: number;
  height: number | null;
  id: string;
  mime_type: string | null;
  storage_path: string;
  taken_at: string | null;
  uploaded_at: string | null;
  user_id: string;
  width: number | null;
};

export type PhotoWithSignedUrl = PhotoRow & {
  signed_url: string | null;
  signed_url_error: boolean;
};

const PHOTO_COLUMNS =
  "id,user_id,storage_path,taken_at,uploaded_at,file_name,file_size,width,height,ai_status,created_at,mime_type";

export async function createUserPhotoSignedUrl(
  supabase: SupabaseClient,
  path: string | null,
  userId: string,
) {
  if (!path || !isOwnedUserPhotoPath(path, userId)) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(USER_PHOTO_BUCKET)
    .createSignedUrl(path, PHOTO_SIGNED_IMAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.warn("[photo-gallery]", {
      category: "SIGNED_IMAGE_URL_FAILED",
      pathOwnerMatches: true,
    });
    return null;
  }

  return data.signedUrl;
}

async function addPhotoSignedUrls(
  supabase: SupabaseClient,
  photos: PhotoRow[],
  userId: string,
): Promise<PhotoWithSignedUrl[]> {
  return Promise.all(
    photos.map(async (photo) => {
      const signedUrl = await createUserPhotoSignedUrl(
        supabase,
        photo.storage_path,
        userId,
      );

      return {
        ...photo,
        signed_url: signedUrl,
        signed_url_error: !signedUrl,
      };
    }),
  );
}

export async function listPhotosForUser({
  page,
  sort,
  userId,
}: {
  page: number;
  sort: PhotoSort;
  userId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { from, to } = getPhotoPaginationRange(page);
  const ascending = sort === "oldest";

  const { count, data, error } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("taken_at", { ascending })
    .order("uploaded_at", { ascending })
    .order("created_at", { ascending })
    .order("id", { ascending })
    .range(from, to);

  const rows = ((data ?? []) as PhotoRow[]).sort((left, right) =>
    comparePhotosByDisplayDate(left, right, sort),
  );

  return {
    count: count ?? 0,
    error,
    pageSize: PHOTO_GALLERY_PAGE_SIZE,
    photos: await addPhotoSignedUrls(supabase, rows, userId),
  };
}

export async function listRecentPhotosForDashboard(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS)
    .eq("user_id", userId)
    .order("taken_at", { ascending: false })
    .order("uploaded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PHOTO_DASHBOARD_PREVIEW_LIMIT);

  const rows = ((data ?? []) as PhotoRow[]).sort((left, right) =>
    comparePhotosByDisplayDate(left, right, "newest"),
  );

  return {
    error,
    photos: await addPhotoSignedUrls(supabase, rows, userId),
  };
}

export async function getPhotoForUser(photoId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS)
    .eq("id", photoId)
    .eq("user_id", userId)
    .maybeSingle();

  const photo = (data as PhotoRow | null) ?? null;

  if (!photo) {
    return {
      error,
      photo: null,
    };
  }

  const signedUrl = await createUserPhotoSignedUrl(
    supabase,
    photo.storage_path,
    userId,
  );

  return {
    error,
    photo: {
      ...photo,
      signed_url: signedUrl,
      signed_url_error: !signedUrl,
    } satisfies PhotoWithSignedUrl,
  };
}
