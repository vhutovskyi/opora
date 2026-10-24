"use server";

import { db, bump } from "./_shared";
import { isMissingTable } from "@/lib/supabase/client";
import type { LongDescriptionBlock } from "@/lib/longDescription/types";

// Informational articles. The body is the same blocks as a product's long description.
// A product description links to an article RELATIVELY: [текст](/posts/<slug>).

export type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  visible: boolean;
  blocks: LongDescriptionBlock[];
};

export async function listPosts(): Promise<PostRow[]> {
  const { data, error } = await db()
    .from("posts")
    .select("id, slug, title, excerpt, visible, blocks")
    .order("title");
  // The table doesn't exist yet (posts.sql is applied by hand) — we show an empty list.
  if (isMissingTable(error)) return [];
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id as string,
    slug: (p.slug as string) ?? "",
    title: (p.title as string) ?? "",
    excerpt: (p.excerpt as string) ?? "",
    visible: (p.visible as boolean) ?? true,
    blocks: (Array.isArray(p.blocks) ? p.blocks : []) as LongDescriptionBlock[],
  }));
}

// The slug becomes part of the URL, so we validate it here: Latin letters, digits and hyphens only.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function savePost(input: {
  id?: string;
  slug: string;
  title: string;
  excerpt?: string;
  visible?: boolean;
  blocks: LongDescriptionBlock[];
}) {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error("Адреса може містити лише малі латинські літери, цифри й дефіси (напр. shchyt-chy-masyv)");
  }
  if (!input.title.trim()) throw new Error("Вкажіть заголовок");

  const payload = {
    slug,
    title: input.title.trim(),
    excerpt: input.excerpt?.trim() || null,
    visible: input.visible ?? true,
    blocks: input.blocks,
    updated_at: new Date().toISOString(),
  };
  const q = input.id
    ? db().from("posts").update(payload).eq("id", input.id)
    : db().from("posts").insert(payload);
  const { data, error } = await q.select("id").single();
  // unique(slug) — we report it in plain words instead of a Postgres code.
  if (error) {
    throw new Error(error.code === "23505" ? `Адреса «${slug}» вже зайнята` : error.message);
  }
  bump();
  return data.id as string;
}

export async function deletePost(id: string) {
  const { error } = await db().from("posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}
