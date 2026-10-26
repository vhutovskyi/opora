import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generates a 6-digit request/order number (on the client, so it can be shown to the user right away)
export function generateRequestNumber() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalizes phone input: it always starts with "+380", then digits only
// (at most 9 digits after the country code), grouped with spaces as "+380 66 666 66 66".
// The "+380" prefix is immutable — trying to erase it simply leaves "+380"
// (with no erroneous "+38038"). This same format (with the spaces) goes into the request,
// so it is stored in Airtable and sent to Telegram in a readable form.
export function formatUaPhone(raw: string): string {
  const allDigits = raw.replace(/\D/g, "");

  // The subscriber digits are everything that comes AFTER the "380" country code.
  // If there is no complete "380" (the user edited inside the prefix) —
  // there are no subscriber digits, and we leave a bare "+380".
  let subscriber = "";
  const withCode = allDigits.match(/^380(\d*)$/);
  if (withCode) {
    subscriber = withCode[1];
  } else if (/^0\d+$/.test(allDigits)) {
    // The local "0XXXXXXXXX" format (e.g. from a paste) — we strip the leading 0
    subscriber = allDigits.replace(/^0+/, "");
  }

  subscriber = subscriber.slice(0, 9);

  // Group the subscriber digits: XX XXX XX XX
  const groups = [
    subscriber.slice(0, 2),
    subscriber.slice(2, 5),
    subscriber.slice(5, 7),
    subscriber.slice(7, 9),
  ].filter(Boolean);

  return groups.length ? `+380 ${groups.join(" ")}` : "+380";
}

// The hue angle (0–360) of a colour — for ordering the swatches by the rainbow.
// Greys/blacks/whites (and invalid values) go to the end (361).
export function toHue(hex?: string): number {
  const n = parseInt((hex || "").replace("#", ""), 16);
  if (Number.isNaN(n)) return 361;
  const r = (n >> 16) / 255, g = ((n >> 8) & 0xff) / 255, b = (n & 0xff) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d === 0) return 361;
  if (max === r) return (((g - b) / d + 6) % 6) * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}

// The canonical segment of a product address: the slug, if it was set in the editor (product_slug.sql),
// otherwise the uuid. One helper for every link — the site, the admin panel and the sitemap — so the slug
// doesn't get "lost" on one particular path. The lookup accepts both, so old links stay alive.
export const productRef = (p: { id: string; slug?: string | null }) => p.slug || p.id;
export const productHref = (p: { id: string; slug?: string | null }) => `/catalog/${productRef(p)}`;

// Cloudflare Image Transformations (/cdn-cgi/image) — on-the-fly photo optimization at the edge,
// NOT in the Worker (so error 1102 doesn't come from here — that one came from /_next/image).
// The source is an already compressed webp from R2, so cdn-cgi only adds AVIF (format=auto) and a width cap.
// Cloudflare's metric is "unique transformations": 5000/month free, beyond that a new transform
// returns error 9422 (on the Free plan, with no charge). That is exactly why width and quality are CONSTANTS:
// one transform per photo forever, rather than one per breakpoint. According to Cloudflare's
// documentation format=auto doesn't multiply the counter, so the format can be varied for free.
// When the quota is exhausted — <OptimizedImage> catches the error and shows the original R2 URL.
// Two fixed widths, not a srcset: 1600 for the full photo (gallery, banner), 640 for a catalogue card,
// where the cell is ~25vw and 1600px was pure wasted bandwidth. A photo seen in both places costs
// two transformations out of the 5000/month instead of one — if the quota starts to run out,
// the tier is removed here in one place (all callers fall back to the default).
export const CF_IMAGE_WIDTH_FULL = 1600;
export const CF_IMAGE_WIDTH_CARD = 640;
const cfImageOpts = (width: number) => `format=auto,quality=85,width=${width},fit=scale-down`;
export const CF_IMAGE_OPTS = cfImageOpts(CF_IMAGE_WIDTH_FULL);
export const cfImageUrl = (src: string, width: number = CF_IMAGE_WIDTH_FULL) =>
  src.startsWith("http") ? `/cdn-cgi/image/${cfImageOpts(width)}/${src}` : src;

// Whether an <img> has already failed to load. Needed because the error can arrive BEFORE hydration
// (a fast 404 when the quota is exhausted) — React would then miss onError and the photo would stay broken.
// complete === true with no dimensions means exactly that error; a not-yet-loaded image gives complete === false.
export const imgFailed = (node: { complete: boolean; naturalWidth: number } | null) =>
  !!node?.complete && node.naturalWidth === 0;

// The same rule as productRef, but for a subcategory_options node (subcategory_slug.sql).
export const subRef = (s: { id: string; slug?: string | null }) => s.slug || s.id;

// A link to the catalog with a filter. sub is the slug or the uuid of a subcategory_options node
// (any depth); resolveSubRefs accepts both on read.
export const catalogHref = (catalog: string, sub?: string) =>
  `/catalog?type=${encodeURIComponent(catalog)}${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`;

// One optFilter_<group> / specFilter_<group> URL value → the selected values. Option values are full
// names ("Розмір: 900 (1300) × 650 мм, 18 мм") and may themselves contain commas, so they are split
// only at a comma that starts the next "<group>:" name. Values without the prefix (specs) split on every comma.
// Used by both parseCatalogParams (server) and useFilterState (client) — they must read a URL the same way.
export function splitFilterValues(group: string, raw: string): string[] {
  const prefix = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:";
  if (!new RegExp(`^\\s*${prefix}`).test(raw)) return raw.split(",");
  return raw.split(new RegExp(`,(?=\\s*${prefix})`));
}
