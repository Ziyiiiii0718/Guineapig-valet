import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createUserPhotoSignedUrl,
  type PhotoRow,
  type PhotoWithSignedUrl,
} from "@/lib/photos/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAlbumPaginationRange } from "@/lib/albums/validation";

export const ALBUM_PAGE_SIZE = 12;
export const ALBUM_PHOTO_PAGE_SIZE = 20;
export const ALBUM_PICKER_PAGE_SIZE = 20;
export const DASHBOARD_ALBUM_LIMIT = 4;

const ALBUM_COLUMNS =
  "id,user_id,title,description,cover_photo_id,created_at,updated_at";
const PHOTO_COLUMNS =
  "id,user_id,storage_path,taken_at,uploaded_at,file_name,display_name,file_size,width,height,ai_status,created_at,mime_type";

export type AlbumRow = {
  cover_photo_id: string | null;
  created_at: string;
  description: string | null;
  id: string;
  title: string;
  updated_at: string;
  user_id: string;
};

export type AlbumSummary = AlbumRow & {
  cover: PhotoWithSignedUrl | null;
  photo_count: number;
};

export type AlbumMembership = Pick<AlbumRow, "id" | "title">;

async function signPhotos(
  supabase: SupabaseClient,
  photos: PhotoRow[],
  userId: string,
) {
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
      } satisfies PhotoWithSignedUrl;
    }),
  );
}

async function enrichAlbumSummaries(
  supabase: SupabaseClient,
  albums: AlbumRow[],
  userId: string,
) {
  if (albums.length === 0) return [];

  const albumIds = albums.map((album) => album.id);
  const { data: memberships } = await supabase
    .from("album_photos")
    .select("album_id,photo_id,created_at")
    .eq("user_id", userId)
    .in("album_id", albumIds)
    .order("created_at", { ascending: true })
    .order("photo_id", { ascending: true });

  const counts = new Map<string, number>();
  const coverIds = new Map<string, string>();
  for (const membership of memberships ?? []) {
    counts.set(membership.album_id, (counts.get(membership.album_id) ?? 0) + 1);
    if (!coverIds.has(membership.album_id)) {
      coverIds.set(membership.album_id, membership.photo_id);
    }
  }

  const photoIds = [...new Set(coverIds.values())];
  let signedPhotos: PhotoWithSignedUrl[] = [];
  if (photoIds.length > 0) {
    const { data } = await supabase
      .from("photos")
      .select(PHOTO_COLUMNS)
      .eq("user_id", userId)
      .in("id", photoIds);
    signedPhotos = await signPhotos(
      supabase,
      (data ?? []) as PhotoRow[],
      userId,
    );
  }
  const photosById = new Map(signedPhotos.map((photo) => [photo.id, photo]));

  return albums.map((album) => ({
    ...album,
    cover: photosById.get(coverIds.get(album.id) ?? "") ?? null,
    photo_count: counts.get(album.id) ?? 0,
  }));
}

export async function listAlbumsForUser({
  page,
  userId,
}: {
  page: number;
  userId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { from, to } = getAlbumPaginationRange(page, ALBUM_PAGE_SIZE);
  const { count, data, error } = await supabase
    .from("albums")
    .select(ALBUM_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  const albums = (data ?? []) as AlbumRow[];
  return {
    albums: await enrichAlbumSummaries(supabase, albums, userId),
    count: count ?? 0,
    error,
    pageSize: ALBUM_PAGE_SIZE,
  };
}

export async function listRecentAlbumsForDashboard(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("albums")
    .select(ALBUM_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(DASHBOARD_ALBUM_LIMIT);
  return {
    albums: await enrichAlbumSummaries(
      supabase,
      (data ?? []) as AlbumRow[],
      userId,
    ),
    error,
  };
}

export async function getAlbumForUser(albumId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("albums")
    .select(ALBUM_COLUMNS)
    .eq("id", albumId)
    .eq("user_id", userId)
    .maybeSingle();
  return { album: (data as AlbumRow | null) ?? null, error };
}

export async function listAlbumPhotosForUser({
  albumId,
  page,
  userId,
}: {
  albumId: string;
  page: number;
  userId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { from, to } = getAlbumPaginationRange(page, ALBUM_PHOTO_PAGE_SIZE);
  const { count, data, error } = await supabase
    .from("album_photos")
    .select("photo_id,created_at", { count: "exact" })
    .eq("album_id", albumId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("photo_id", { ascending: false })
    .range(from, to);
  const memberships = data ?? [];
  const photoIds = memberships.map((item) => item.photo_id);
  let photos: PhotoWithSignedUrl[] = [];
  if (photoIds.length > 0) {
    const { data: photoRows } = await supabase
      .from("photos")
      .select(PHOTO_COLUMNS)
      .eq("user_id", userId)
      .in("id", photoIds);
    const signed = await signPhotos(
      supabase,
      (photoRows ?? []) as PhotoRow[],
      userId,
    );
    const byId = new Map(signed.map((photo) => [photo.id, photo]));
    photos = photoIds.flatMap((id) => {
      const photo = byId.get(id);
      return photo ? [photo] : [];
    });
  }
  return {
    count: count ?? 0,
    error,
    pageSize: ALBUM_PHOTO_PAGE_SIZE,
    photos,
  };
}

export async function listPhotoPickerForAlbum({
  albumId,
  page,
  userId,
}: {
  albumId: string;
  page: number;
  userId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { from, to } = getAlbumPaginationRange(page, ALBUM_PICKER_PAGE_SIZE);
  const { count, data, error } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("uploaded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  const photos = await signPhotos(supabase, (data ?? []) as PhotoRow[], userId);
  const ids = photos.map((photo) => photo.id);
  let existing = new Set<string>();
  if (ids.length > 0) {
    const { data: memberships } = await supabase
      .from("album_photos")
      .select("photo_id")
      .eq("album_id", albumId)
      .eq("user_id", userId)
      .in("photo_id", ids);
    existing = new Set((memberships ?? []).map((item) => item.photo_id));
  }
  return { count: count ?? 0, error, existing, photos };
}

export async function listAlbumMembershipsForPhoto(
  photoId: string,
  userId: string,
) {
  const supabase = await createSupabaseServerClient();
  const [{ data: membershipRows, error }, { data: albumRows }] =
    await Promise.all([
      supabase
        .from("album_photos")
        .select("album_id")
        .eq("photo_id", photoId)
        .eq("user_id", userId),
      supabase
        .from("albums")
        .select("id,title")
        .eq("user_id", userId)
        .order("title", { ascending: true })
        .order("id", { ascending: true }),
    ]);
  const memberIds = new Set((membershipRows ?? []).map((row) => row.album_id));
  const all = (albumRows ?? []) as AlbumMembership[];
  return {
    all,
    error,
    memberships: all.filter((album) => memberIds.has(album.id)),
  };
}
