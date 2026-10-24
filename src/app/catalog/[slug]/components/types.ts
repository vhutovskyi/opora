// Shared types for the product page

import { BOOL_NO, BOOL_YES } from "@/lib/constants";
import type { LongDescriptionBlock } from "@/lib/longDescription/types";

export interface Option {
  name: string;
  value: string; // Hex colour (for example, 'FF0000')
}

export interface Specification {
  name: string;
  value: string;
}

// Everything the option selector needs. The product's main variants arrive in the browser EXACTLY in
// this shape — without photos and specs, because a bed has 1000 variants and that was 1.5MB of HTML.
export interface VariantSummary {
  id: string;
  name: string;
  sku: string;
  price: number;
  discountedPrice: number | null; // sale price, when set and lower than price
  inStock: boolean;
  options: Option[];
}

// The heavy part of a variant: it arrives separately (as a prop for the active one, then via useVariantMedia).
export interface VariantMedia {
  images: string[];           // originals — for the fullscreen gallery
  imagesCompressed: string[]; // compressed — for the page
  specifications: Specification[];
}

// The full variant — kept for accessories: they have few variants (280 × ~0.4KB),
// so the accessory modal works with ready data without a single request.
export interface Variant extends VariantSummary, VariantMedia {}

export interface AccessoryLink {
  id: string;
  product: {
    id: string;
    slug: string | null;
    model: string;
    minPrice: number;
    comboAxis: string | null; // the upgrade axis of this accessory (products.combo_axis)
    variants: Variant[];
  };
  maxQty: number; // cap on the storefront quantity stepper
}

// Bed photos for one accessory-upgrade combination — replace the gallery while it's selected.
export interface AccessoryComboPhotos {
  imageGroupKey: string;
  comboKey: string;
  images: string[];
  imagesCompressed: string[];
}

export interface Product {
  id: string;
  slug: string | null;
  model: string;
  name: string;
  catalog: string;
  description: string;
  longDescription: LongDescriptionBlock[];
  assemblyVideoUrl: string;
  assemblyPdfUrl: string;
  minPrice: number;
  galleryLayout: number[]; // images-per-row for the desktop gallery grid; [] = default 2-col
  variants: VariantSummary[];
  accessories: AccessoryLink[];
  accessoryComboPhotos: AccessoryComboPhotos[];
}

export const hexColor = (value: string) => (value.startsWith('#') ? value : `#${value}`);

// A colour option carries a hex value; a non-colour option (e.g. "Матеріал: Масив") carries
// a plain-text value. Used to decide swatch-vs-chip rendering on the product page.
export const isHexColor = (value: string) => /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());

// Option "kind" = the name prefix before ":" (Колір / Матеріал / Коліщатка …).
// Options group by kind, not by array position, so a colour is never bucketed with a
// material even when variants have inconsistent option sets. Falls back to the full name.
export const optKind = (o: Option) => (o.name.includes(':') ? o.name.split(':')[0].trim() : o.name);

// A group of interchangeable options of one kind (e.g. all colours, or all materials).
export interface OptionGroup {
  key: string;
  options: Option[];
}

// Third rendering kind (besides swatch/chip): a Так/Ні axis → ONE checkbox labelled with the kind
// («З білими ніжками»). Both values must exist on the product's variants, otherwise the axis is
// unreachable — matchesSelection ignores axes a variant carries no option for.
export const isBoolGroup = (g: OptionGroup) =>
  g.options.length > 0 && g.options.every((o) => o.value === BOOL_YES || o.value === BOOL_NO);

// Chip caption: the value, falling back to the name suffix.
export const chipLabel = (o: Option) =>
  o.value || (o.name.includes(":") ? o.name.split(":").pop()!.trim() : o.name);

// Fourth rendering kind: an axis whose captions are too long for chips → a native <select>.
// Table sizes read «1100 (1500) × 750 мм»; four of those wrap onto three rows and dwarf the rest
// of the buy box. The threshold is on LENGTH, not count, on purpose — beds also have many sizes,
// but «160x200» is short and reads better as chips.
export const isSelectGroup = (g: OptionGroup) => g.options.some((o) => chipLabel(o).length > 16);
