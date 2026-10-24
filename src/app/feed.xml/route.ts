// Google Merchant Center product feed (RSS 2.0 + g: namespace).
// Submit this URL in Merchant Center → Products → Feeds; Google pulls it daily.
// This is the source for Shopping ads and for free product listings in search.
import { getFilteredCatalog } from "@/lib";
import { SITE_URL, SITE_NAME } from "@/lib/site";

export const revalidate = 3600;

const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!
  );

const abs = (u: string) => (u.startsWith("http") ? u : `${SITE_URL}${u}`);

export async function GET() {
  const products = await getFilteredCatalog({ type: ["All"] });

  const items = products
    .map((p) => {
      const image = p.variations?.[0]?.images?.[0];
      if (!image || !p.price) return ""; // Google rejects an item without a price/photo
      return `<item>
<g:id>${esc(p.id)}</g:id>
<g:title>${esc(p.name)}</g:title>
<g:description>${esc(p.name)}</g:description>
<g:link>${abs(p.href)}</g:link>
<g:image_link>${esc(abs(image))}</g:image_link>
<g:availability>in_stock</g:availability>
<g:condition>new</g:condition>
<g:price>${p.price} UAH</g:price>
<g:brand>${esc(SITE_NAME)}</g:brand>
<g:identifier_exists>no</g:identifier_exists>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${esc(SITE_NAME)}</title>
<link>${SITE_URL}</link>
<description>${esc(SITE_NAME)} product feed</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
