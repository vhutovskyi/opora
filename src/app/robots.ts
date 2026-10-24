import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { sitemapChunkCount } from "./sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const count = await sitemapChunkCount();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/"],
    },
    sitemap: Array.from({ length: count }, (_, i) => `${SITE_URL}/sitemap/${i}.xml`),
    host: SITE_URL,
  };
}
