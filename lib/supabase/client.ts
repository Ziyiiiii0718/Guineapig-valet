"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserConfig } from "@/lib/env-client";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseBrowserConfig();
  return createBrowserClient(url, publishableKey);
}
