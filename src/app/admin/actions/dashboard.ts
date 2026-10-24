"use server";

import { db } from "./_shared";

/* ---------- Dashboard ---------- */
export async function getCounts() {
  const tables = ["products", "variants", "banners", "comments", "requests", "options", "specs"] as const;
  const entries = await Promise.all(
    tables.map(async (t) => {
      const { count } = await db().from(t).select("*", { count: "exact", head: true });
      return [t, count || 0] as const;
    })
  );
  return Object.fromEntries(entries) as Record<(typeof tables)[number], number>;
}
