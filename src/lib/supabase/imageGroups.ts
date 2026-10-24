// Single source of truth for "which options change how a product looks".
// Only Матеріал (Щит/Масив) and Колір affect the photo; Розмір and Відстань між ламелями
// never do — so variants that differ ONLY by those should share the same images.
// Used by the upload route (propagate to siblings) and the dedup tool (group + merge).

const NON_VISUAL_OPTION_PREFIXES = ["розмір", "відстань між ламелями"];

// Option names are stored as "Prefix: Value" (e.g. "Колір: Червоне дерево").
export function isVisualOption(optionName: string): boolean {
  const category = optionName.split(":")[0]?.trim().toLowerCase() ?? "";
  return !NON_VISUAL_OPTION_PREFIXES.includes(category);
}

// Variants sharing this key show the same photos (ignores size/lamels). Empty string is a valid
// key (a variant with no visual options → its own group of look-alikes).
export function imageGroupKey(optionNames: string[]): string {
  return optionNames
    .filter(isVisualOption)
    .map((n) => n.trim().toLowerCase())
    .sort()
    .join("|");
}
