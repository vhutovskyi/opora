import { useEffect, useRef, useState } from "react";
import { getVariantPhotosBySku, type OfferPhoto } from "./folderImportActions";
import type { Row } from "./estellaTypes";

// Thumbnails for promoted rows (variants.sku == offer_id), keyed by offer_id.
// Loads lazily for rows as they turn `imported` and aren't in the map yet.
export function usePhotosMap(items: Row[]) {
  const [photosMap, setPhotosMap] = useState<Record<string, OfferPhoto[]>>({});
  // Track what we ASKED for, not what came back: the action omits variants with no photos, so
  // keying off photosMap re-requested them forever — and each setState re-ran this effect
  // (`items` is a fresh array every render), i.e. an endless request loop.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const need = items.filter((r) => r.imported && !requested.current.has(r.offer_id)).map((r) => r.offer_id);
    if (!need.length) return;
    for (const id of need) requested.current.add(id);
    getVariantPhotosBySku(need).then((map) => setPhotosMap((prev) => ({ ...prev, ...map })));
  }, [items]);
  return [photosMap, setPhotosMap] as const;
}
