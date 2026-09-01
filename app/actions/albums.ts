"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPublicEnvStatus } from "@/lib/env";
import {
  ALBUM_ADD_PHOTO_LIMIT,
  albumFormSchema,
  albumIdSchema,
} from "@/lib/albums/validation";
import { photoIdSchema } from "@/lib/photos/gallery";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AlbumActionState = {
  fieldErrors?: { description?: string; name?: string };
  message?: string;
  status: "idle" | "error" | "success";
  values?: { description: string; name: string };
};

async function getAuthenticatedAlbumUser() {
  if (!getPublicEnvStatus().isConfigured) {
    return {
      error: "Supabase is not configured yet.",
      supabase: null,
      user: null,
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user
    ? { error: null, supabase, user }
    : { error: "Please log in to manage albums.", supabase, user: null };
}

function parseAlbumForm(formData: FormData) {
  const values = {
    description: String(formData.get("description") ?? ""),
    name: String(formData.get("name") ?? ""),
  };
  const parsed = albumFormSchema.safeParse(values);
  if (parsed.success) return { data: parsed.data, error: null, values };
  const flattened = parsed.error.flatten().fieldErrors;
  return {
    data: null,
    error: {
      fieldErrors: {
        description: flattened.description?.[0],
        name: flattened.name?.[0],
      },
      message: "Check the album details and try again.",
      status: "error" as const,
      values,
    },
    values,
  };
}

async function findOwnedAlbum(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  albumId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("albums")
    .select("id,user_id")
    .eq("id", albumId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && data?.user_id === userId ? data : null;
}

export async function createAlbumAction(
  _state: AlbumActionState,
  formData: FormData,
): Promise<AlbumActionState> {
  const parsed = parseAlbumForm(formData);
  if (parsed.error || !parsed.data) return parsed.error!;
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedAlbumUser();
  if (authError || !supabase || !user) {
    return {
      message: authError ?? "Please log in to manage albums.",
      status: "error",
      values: parsed.values,
    };
  }
  const { data, error } = await supabase
    .from("albums")
    .insert({
      description: parsed.data.description,
      title: parsed.data.name,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    return {
      message:
        "We could not create that album. The name may already be in use.",
      status: "error",
      values: parsed.values,
    };
  }
  revalidatePath("/albums");
  revalidatePath("/dashboard");
  redirect(`/albums/${data.id}?message=created`);
}

export async function updateAlbumAction(
  _state: AlbumActionState,
  formData: FormData,
): Promise<AlbumActionState> {
  const albumId = String(formData.get("albumId") ?? "");
  const parsedId = albumIdSchema.safeParse(albumId);
  const parsed = parseAlbumForm(formData);
  if (!parsedId.success)
    return {
      message: "We could not find that album.",
      status: "error",
      values: parsed.values,
    };
  if (parsed.error || !parsed.data) return parsed.error!;
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedAlbumUser();
  if (authError || !supabase || !user)
    return {
      message: authError ?? "Please log in to manage albums.",
      status: "error",
      values: parsed.values,
    };
  if (!(await findOwnedAlbum(supabase, parsedId.data, user.id)))
    return {
      message: "We could not find that album.",
      status: "error",
      values: parsed.values,
    };
  const { error } = await supabase
    .from("albums")
    .update({
      description: parsed.data.description,
      title: parsed.data.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsedId.data)
    .eq("user_id", user.id);
  if (error)
    return {
      message: "We could not update that album. Please try again.",
      status: "error",
      values: parsed.values,
    };
  revalidatePath("/albums");
  revalidatePath(`/albums/${parsedId.data}`);
  revalidatePath("/dashboard");
  revalidatePath("/photos");
  return { message: "Album updated.", status: "success" };
}

export async function addPhotosToAlbumAction(
  _state: AlbumActionState,
  formData: FormData,
): Promise<AlbumActionState> {
  const parsedAlbumId = albumIdSchema.safeParse(
    String(formData.get("albumId") ?? ""),
  );
  const photoIds = [...new Set(formData.getAll("photoIds").map(String))];
  if (!parsedAlbumId.success)
    return { message: "We could not find that album.", status: "error" };
  if (photoIds.length === 0)
    return { message: "Select at least one photo.", status: "error" };
  if (
    photoIds.length > ALBUM_ADD_PHOTO_LIMIT ||
    photoIds.some((id) => !photoIdSchema.safeParse(id).success)
  ) {
    return {
      message: `Select no more than ${ALBUM_ADD_PHOTO_LIMIT} valid photos at once.`,
      status: "error",
    };
  }
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedAlbumUser();
  if (authError || !supabase || !user)
    return {
      message: authError ?? "Please log in to manage albums.",
      status: "error",
    };
  if (!(await findOwnedAlbum(supabase, parsedAlbumId.data, user.id)))
    return { message: "We could not find that album.", status: "error" };
  const { data: ownedPhotos, error: photoError } = await supabase
    .from("photos")
    .select("id")
    .eq("user_id", user.id)
    .in("id", photoIds);
  if (photoError || (ownedPhotos ?? []).length !== photoIds.length) {
    return {
      message: "One or more selected photos are unavailable.",
      status: "error",
    };
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("album_photos").upsert(
    photoIds.map((photoId) => ({
      album_id: parsedAlbumId.data,
      created_at: now,
      photo_id: photoId,
      user_id: user.id,
    })),
    { ignoreDuplicates: true, onConflict: "album_id,photo_id" },
  );
  if (error)
    return {
      message: "We could not add those photos. Please try again.",
      status: "error",
    };
  await supabase
    .from("albums")
    .update({ updated_at: now })
    .eq("id", parsedAlbumId.data)
    .eq("user_id", user.id);
  revalidatePath("/albums");
  revalidatePath(`/albums/${parsedAlbumId.data}`);
  revalidatePath(`/albums/${parsedAlbumId.data}/photos`);
  revalidatePath("/dashboard");
  for (const photoId of photoIds) revalidatePath(`/photos/${photoId}`);
  return {
    message: `${photoIds.length} ${photoIds.length === 1 ? "photo" : "photos"} added.`,
    status: "success",
  };
}

export async function removePhotoFromAlbumAction(
  _state: AlbumActionState,
  formData: FormData,
): Promise<AlbumActionState> {
  const albumId = albumIdSchema.safeParse(
    String(formData.get("albumId") ?? ""),
  );
  const photoId = photoIdSchema.safeParse(
    String(formData.get("photoId") ?? ""),
  );
  if (!albumId.success || !photoId.success)
    return {
      message: "We could not find that album membership.",
      status: "error",
    };
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedAlbumUser();
  if (authError || !supabase || !user)
    return {
      message: authError ?? "Please log in to manage albums.",
      status: "error",
    };
  if (!(await findOwnedAlbum(supabase, albumId.data, user.id)))
    return { message: "We could not find that album.", status: "error" };
  const { error } = await supabase
    .from("album_photos")
    .delete()
    .eq("album_id", albumId.data)
    .eq("photo_id", photoId.data)
    .eq("user_id", user.id);
  if (error)
    return {
      message: "We could not remove that photo from the album.",
      status: "error",
    };
  const now = new Date().toISOString();
  await supabase
    .from("albums")
    .update({ updated_at: now })
    .eq("id", albumId.data)
    .eq("user_id", user.id);
  revalidatePath("/albums");
  revalidatePath(`/albums/${albumId.data}`);
  revalidatePath(`/photos/${photoId.data}`);
  revalidatePath("/dashboard");
  return {
    message:
      "Photo removed from album. The original photo is still in your library.",
    status: "success",
  };
}

export async function deleteAlbumAction(
  _state: AlbumActionState,
  formData: FormData,
): Promise<AlbumActionState> {
  const parsedId = albumIdSchema.safeParse(
    String(formData.get("albumId") ?? ""),
  );
  if (!parsedId.success)
    return { message: "We could not find that album.", status: "error" };
  const {
    error: authError,
    supabase,
    user,
  } = await getAuthenticatedAlbumUser();
  if (authError || !supabase || !user)
    return {
      message: authError ?? "Please log in to manage albums.",
      status: "error",
    };
  if (!(await findOwnedAlbum(supabase, parsedId.data, user.id)))
    return { message: "We could not find that album.", status: "error" };
  const { error } = await supabase
    .from("albums")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", user.id);
  if (error)
    return {
      message: "We could not delete that album. Please try again.",
      status: "error",
    };
  revalidatePath("/albums");
  revalidatePath("/dashboard");
  redirect("/albums?message=deleted");
}
