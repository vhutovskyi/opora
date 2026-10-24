// The blocks of a product's long description. The text fields (text/intro/captions/table cells)
// are rendered through react-markdown, so **bold** and [links](url) work in them —
// no separate fields are needed for that.

export type LongDescriptionBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "callout"; heading?: string; text: string; tone?: "neutral" | "green" }
  | { type: "table"; title?: string; headerRow?: string[]; rows: string[][] }
  | {
      type: "imageText";
      // width — the photo width in % of the column (empty = the full width).
      images: { url: string; caption?: string; width?: number }[];
      text?: string;
      layout: "left" | "right" | "stacked";
    }
  | {
      type: "colorSwatches";
      title?: string;
      intro?: string;
      swatches: { code?: string; name: string; imageUrl: string }[];
    }
  | {
      type: "gallery";
      title?: string;
      items: { imageUrl: string; caption?: string }[];
      cols?: 2 | 3 | 4;
      // The caption can sit above the photo (like "Шухляда с ЛДСП 102 колір") or be overlaid
      // on it as a chip (like "101 колір" on an interior photo).
      captionPosition?: "below" | "above" | "overlay";
    }
  // A row of several columns: "Характеристики | Спальне місце | Інструкція",
  // "Ціни: Щит | Масив", "текст | таблиця". Nested columns are not supported.
  | { type: "columns"; columns: LongDescriptionBlock[][] }
  // A reference to a shared block (`long_description_snippets`) — edited once
  // in the admin panel and inlined into every product that references it.
  | { type: "snippet"; snippetId: string };

export type LongDescriptionSnippet = {
  id: string;
  name: string;
  blocks: LongDescriptionBlock[];
};

// Expands references to shared blocks into their content. Called on the read side
// (products.ts) before caching, so the renderer receives ready-made blocks.
export function resolveSnippets(
  blocks: LongDescriptionBlock[],
  byId: Map<string, LongDescriptionBlock[]>
): LongDescriptionBlock[] {
  return blocks.flatMap((block) => {
    if (block.type === "snippet") return byId.get(block.snippetId) ?? [];
    if (block.type === "columns") {
      return [{ ...block, columns: block.columns.map((col) => resolveSnippets(col, byId)) }];
    }
    return [block];
  });
}

// An empty snippetId ("— оберіть блок —") MUST be filtered out: it used to reach
// `.in("id", ids)` and Postgres killed the whole query (22P02 invalid input syntax for uuid),
// so not a single shared block of the product was expanded.
export function collectSnippetIds(blocks: LongDescriptionBlock[]): string[] {
  return blocks.flatMap((block) =>
    block.type === "snippet"
      ? block.snippetId
        ? [block.snippetId]
        : []
      : block.type === "columns"
        ? block.columns.flatMap(collectSnippetIds)
        : []
  );
}
