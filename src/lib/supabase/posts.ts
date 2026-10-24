import { unstable_cache } from "next/cache";
import { isMissingTable, supabaseAdmin } from "./client";
import { collectSnippetIds, resolveSnippets, type LongDescriptionBlock } from "@/lib/longDescription/types";

// Informational articles: the body is the same blocks as a product's long description, so
// the renderer is shared (LongDescriptionRenderer). Shared blocks are expanded the same way.

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  blocks: LongDescriptionBlock[];
};

async function withSnippets(raw: unknown): Promise<LongDescriptionBlock[]> {
  const blocks = Array.isArray(raw) ? (raw as LongDescriptionBlock[]) : [];
  const ids = [...new Set(collectSnippetIds(blocks))];
  if (!ids.length) return blocks;
  const { data, error } = await supabaseAdmin()
    .from("long_description_snippets")
    .select("id, blocks")
    .in("id", ids);
  if (error) console.error("withSnippets error:", error.message);
  return resolveSnippets(
    blocks,
    new Map(
      (data ?? []).map((s) => [
        s.id as string,
        (Array.isArray(s.blocks) ? s.blocks : []) as LongDescriptionBlock[],
      ])
    )
  );
}

async function fetchPost(slug: string): Promise<Post | null> {
  const { data, error } = await supabaseAdmin()
    .from("posts")
    .select("slug, title, excerpt, blocks, visible")
    .eq("slug", slug)
    .maybeSingle();
  // The table doesn't exist yet (posts.sql is applied by hand) — a 404 is better than a 500 on a public URL.
  if (isMissingTable(error)) return null;
  if (error) throw error;
  if (!data || !data.visible) return null;
  return {
    slug: data.slug as string,
    title: (data.title as string) ?? "",
    excerpt: (data.excerpt as string) ?? "",
    blocks: await withSnippets(data.blocks),
  };
}

// Tagged "posts", not "catalog": an article edit must not cold-start every product page, and a
// product edit must not cold-start the articles. bump() still purges both.
export const getPostBySlug = unstable_cache(fetchPost, ["post"], { revalidate: 3600, tags: ["posts"] });

async function fetchPostSlugs(): Promise<string[]> {
  const { data } = await supabaseAdmin().from("posts").select("slug").eq("visible", true).order("slug");
  return (data ?? []).map((p) => p.slug as string);
}

export const getPostSlugs = unstable_cache(fetchPostSlugs, ["post-slugs"], {
  revalidate: 3600,
  tags: ["posts"],
});
