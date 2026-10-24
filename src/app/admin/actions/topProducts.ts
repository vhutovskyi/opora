"use server";

import { db, bump } from "./_shared";

export async function listTopProducts() {
  const { data } = await db().from("top_products").select("product_id, sort_order").order("sort_order");
  return (data || []) as { product_id: string; sort_order: number }[];
}

export async function setTopProducts(ids: string[]) {
  await db().from("top_products").delete().neq("product_id", "00000000-0000-0000-0000-000000000000");
  if (ids.length) {
    const { error } = await db()
      .from("top_products")
      .insert(ids.map((product_id, i) => ({ product_id, sort_order: i })));
    if (error) throw new Error(error.message);
  }
  bump();
}
