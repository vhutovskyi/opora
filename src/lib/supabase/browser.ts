"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client (anon key) — used only for admin auth (sign in/out) on /admin.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
