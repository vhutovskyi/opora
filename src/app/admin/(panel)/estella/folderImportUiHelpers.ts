import { parseModelSize, SINGLE_BED_MAX_WIDTH, type ProductParse } from "@/lib/estella/folderImport";
import type { EstellaOfferRef } from "./folderImportActions";
import type { UiProduct, UiVariant } from "./folderImportTypes";

export function toUiProduct(p: ProductParse): UiProduct {
  return {
    productName: p.productName,
    catalog: "",
    subcategoryPath: [],
    price: "",
    extraOptionName: "",
    customOptions: [],
    variants: p.variants.map((v) => ({
      sku: v.sku,
      materialValue: v.materialValue,
      breadcrumb: v.breadcrumb,
      colors: v.colors,
      whiteLegs: v.whiteLegs,
      files: v.files,
      included: true,
      price: "",
    })),
    sizeBand: p.sizeBand,
    unassignedCount: p.unassignedFiles.length,
    done: false,
    attachName: p.productName, // prefill the XML search with the folder name
    attachedTo: null,
    attachOffers: [],
  };
}

// "… односпальне" = a separate product with its own folders, so the XML offers are split by width
// (SINGLE_BED_MAX_WIDTH), otherwise the single bed's photos would also go onto the double variants.
// We don't apply the range to an offer with an unrecognized size.
function matchesSizeBand(band: UiProduct["sizeBand"], model: string): boolean {
  if (!band) return true;
  const size = parseModelSize(model);
  const width = size ? parseInt(size.split("x")[0], 10) : NaN;
  if (!Number.isFinite(width)) return true;
  return band === "single" ? width <= SINGLE_BED_MAX_WIDTH : width > SINGLE_BED_MAX_WIDTH;
}

// XML offers matching a folder variation by colour code + material word (in the model) + size band.
export function offersFor(product: UiProduct, v: UiVariant): EstellaOfferRef[] {
  if (!product.attachedTo) return [];
  const codes = new Set(v.colors.map((c) => c.code));
  if (codes.size === 0) return [];
  const mat = v.materialValue.trim().toLowerCase();
  return product.attachOffers.filter(
    (o) =>
      o.color_code != null &&
      codes.has(o.color_code) &&
      (mat ? o.model.toLowerCase().includes(mat) : true) &&
      matchesSizeBand(product.sizeBand, o.model)
  );
}
