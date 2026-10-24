import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service-role key. All storefront reads and
// admin writes go through here (no RLS — access is gated by the /admin middleware).
// ponytail: single lazy singleton; supabase-js is fetch-based, so it's edge-safe on Workers.
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

// "The table doesn't exist yet" — SQL in this project is applied by hand, so new code can
// reach prod before its table does. PGRST205 is the PostgREST schema cache,
// 42P01 is Postgres itself (happens on direct queries/rpc).
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

// "The column doesn't exist yet" — the same case as isMissingTable, but for ALTER TABLE
// (products.slug from product_slug.sql). 42703 is Postgres, PGRST204 the PostgREST schema cache.
export function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

// In a product route (/catalog/[slug], /admin/products/[id]) the parameter is either a uuid or a slug.
// Applies a filter to a ready query; returning null = garbage in the URL, and the caller serves a 404.
// ilike for a slug rather than eq: the address in the browser must not depend on case. That is exactly why
// the parameter MUST be checked with a regex — "%" in ilike is a wildcard, otherwise
// /catalog/% would return an arbitrary product. For an id only eq: ilike on a uuid column is an error.
// T through a cast rather than a constraint: unrolling the generics of the PostgREST builder
// runs into "Type instantiation is excessively deep".
type Filterable = { eq(c: string, v: string): unknown; ilike(c: string, v: string): unknown };
export function byIdOrSlug<T>(query: T, param: string): T | null {
  const q = query as Filterable;
  if (UUID_RE.test(param)) return q.eq("id", param) as T;
  if (SLUG_RE.test(param)) return q.ilike("slug", param) as T;
  return null;
}
