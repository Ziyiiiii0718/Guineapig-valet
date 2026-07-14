"use server";

import { redirect } from "next/navigation";
import { getPublicEnvStatus } from "@/lib/env";
import { authFormSchema } from "@/lib/validation/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithAuthError(
  path: "/login" | "/register",
  message: string,
): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signInAction(formData: FormData) {
  const parsed = authFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWithAuthError(
      "/login",
      parsed.error.issues[0]?.message ?? "Invalid login form.",
    );
  }

  if (!getPublicEnvStatus().isConfigured) {
    redirectWithAuthError(
      "/login",
      "Supabase is not configured yet. Add environment variables first.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirectWithAuthError("/login", error.message);
  }

  redirect("/dashboard");
}

export async function signUpAction(formData: FormData) {
  const parsed = authFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWithAuthError(
      "/register",
      parsed.error.issues[0]?.message ?? "Invalid registration form.",
    );
  }

  if (!getPublicEnvStatus().isConfigured) {
    redirectWithAuthError(
      "/register",
      "Supabase is not configured yet. Add environment variables first.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: "/auth/callback",
    },
  });

  if (error) {
    redirectWithAuthError("/register", error.message);
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  if (getPublicEnvStatus().isConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect("/");
}
