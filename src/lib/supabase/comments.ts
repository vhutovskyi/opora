import { supabaseAdmin } from "./client";
import { Comment } from "./types";

export async function getComments(productName?: string | null): Promise<Comment[]> {
  let query = supabaseAdmin()
    .from("comments")
    .select("id, author_name, rating, text, product_ref, created_at")
    .order("created_at", { ascending: false });
  if (productName) query = query.eq("product_ref", productName);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    authorName: String(r.author_name || ""),
    rating: Number(r.rating || 0),
    text: String(r.text || ""),
    variation: r.product_ref ? String(r.product_ref) : undefined,
    createdAt: r.created_at ? String(r.created_at) : undefined,
  }));
}
