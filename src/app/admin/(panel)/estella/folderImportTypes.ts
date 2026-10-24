import type { DetectedColor } from "@/lib/estella/folderImport";
import type { EstellaOfferRef } from "./folderImportActions";

export type UiVariant = {
  sku: string;
  materialValue: string;
  breadcrumb: string;
  colors: DetectedColor[];
  whiteLegs?: boolean; // beds: the "з білими ніжками" branch → a checkbox option (undefined = no axis)
  files: File[];
  included: boolean;
  price: string; // empty → inherits the product price (or "Ціну уточнюйте" if that one is empty too)
};

export type UiProduct = {
  productName: string;
  catalog: string;
  // Path in the subcategory tree: names from root to leaf, of arbitrary depth.
  // Missing levels are created on commit (see folderImportCommit).
  subcategoryPath: string[];
  price: string; // default price for all variants without a price of their own
  // Option name for the intermediate folder level (breadcrumb) — e.g. "Короб" for drawers.
  // Empty → the intermediate level is ignored (the usual behaviour for the other catalogs).
  extraOptionName: string;
  // Custom shared options (e.g. "Тип: Щит/Масив"): each one → a single text option on all variants.
  // The values go into the sku, so re-uploading the same folder with other values creates new variants.
  customOptions: { name: string; value: string }[];
  variants: UiVariant[];
  // Beds: "… односпальне" is a separate product, so it takes only XML sizes ≤ 90; its pair takes > 90.
  // undefined → no width filter (a product without a pair covers every size).
  sizeBand?: "single" | "double";
  unassignedCount: number;
  done: boolean; // batch mode: imported successfully (skipped on a repeated run)
  // XML attach (per product): search text is prefilled with the folder name; on an exact-name
  // match we auto-attach on pick. attachedTo set → merge material/colour/photos onto XML variants.
  attachName: string;
  attachedTo: string | null;
  attachOffers: EstellaOfferRef[];
};

export type { SubcategoryOptionRow as SubcategoryOption } from "@/lib/supabase/subcategoryTree";
export type Mode = "single" | "batch" | "beds";
