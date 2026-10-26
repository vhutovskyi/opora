// Product comparison: shared by the server page (/compare), the client store and the buttons.
// No server imports — this file ends up in client bundles too.

// More than 4 columns don't fit even on a desktop, and the URL is public (anyone can open it),
// so the server also caps how many variants one request may pull.
export const MAX_COMPARE_ITEMS = 4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "?ids=a,b,c" → variant ids: uuids only (garbage in a shared link is dropped, not queried),
// no repeats, at most MAX_COMPARE_ITEMS — the order is kept, it is the column order.
export function parseCompareIds(raw: string | null | undefined): string[] {
  const ids = (raw || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => UUID_RE.test(s));
  return [...new Set(ids)].slice(0, MAX_COMPARE_ITEMS);
}

// The list lives in the URL, so the page can be opened (and shared) by anyone.
export const compareHref = (ids: string[]) =>
  ids.length ? `/compare?ids=${ids.join(",")}` : "/compare";
