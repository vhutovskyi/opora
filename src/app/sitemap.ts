import type { MetadataRoute } from "next";
import { getPostSlugs, getProductRefs } from "@/lib";
import { SITE_URL } from "@/lib/site";

// Regenerate the sitemap once an hour.
export const revalidate = 3600;

// ponytail: with plenty of room for today's few dozen products — what matters is the splitting
// mechanism itself, not the threshold. Lower it if Google starts complaining about the file size.
export const CHUNK_SIZE = 5000;

// generateSitemaps serves /sitemap/0.xml, /sitemap/1.xml… — Next does NOT create an index at
// /sitemap.xml, so robots.ts lists those files through sitemapChunkCount().
export async function sitemapChunkCount(): Promise<number> {
  const refs = await getProductRefs();
  return Math.max(1, Math.ceil(refs.length / CHUNK_SIZE));
}

export async function generateSitemaps() {
  const count = await sitemapChunkCount();
  return Array.from({ length: count }, (_, id) => ({ id }));
}

// Next 16 passes id as a Promise — without await it is an object, and slicing the array gives NaN (an empty sitemap).
export default async function sitemap({ id }: { id: Promise<number> }): Promise<MetadataRoute.Sitemap> {
  const chunk = Number(await id);
  // We put the articles into chunk zero together with the static entries — there are dozens of them, not thousands.
  let postRoutes: MetadataRoute.Sitemap = [];
  if (chunk === 0) {
    try {
      const slugs = await getPostSlugs();
      postRoutes = slugs.map((slug) => ({
        url: `${SITE_URL}/posts/${slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
    } catch (error) {
      console.error("sitemap: не вдалося отримати статті", error);
    }
  }

  const staticRoutes: MetadataRoute.Sitemap =
    chunk === 0
      ? [
          { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
          { url: `${SITE_URL}/catalog`, changeFrequency: "daily", priority: 0.9 },
          ...postRoutes,
        ]
      : [];

  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const refs = await getProductRefs();
    productRoutes = refs.slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE).map((ref) => ({
      url: `${SITE_URL}/catalog/${ref}`,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch (error) {
    console.error("sitemap: не вдалося отримати товари", error);
  }

  return [...staticRoutes, ...productRoutes];
}
