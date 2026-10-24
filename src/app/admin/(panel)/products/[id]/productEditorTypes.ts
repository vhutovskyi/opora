import type { LongDescriptionBlock } from "@/lib/longDescription/types";

export type ProductListItem = { id: string; model: string };

export type Opt = { id: string; name: string; value: string | null };
export type Spec = { id: string; name: string; filterable: boolean };

export type Variant = {
  id: string;
  name: string | null;
  sku: string | null;
  price: number | null;
  in_stock: boolean | null;
  visible: boolean | null;
  discount_percent: number | null;
  discount_price: number | null;
  discounted_price: number | null;
  sort_order: number | null;
  variant_images: { image_id: string; sort_order: number | null; images: { id: string; url: string; url_compressed: string | null } | null }[] | null;
  variant_options: { option_id: string }[] | null;
  variant_specs: { id: string; spec_id: string; value: string | null; legacy_num: number | null }[] | null;
};

export type ProductFull = {
  id: string;
  slug: string | null;
  model: string;
  manufacturer: string | null;
  min_price: number | null;
  catalog: string | null;
  product_subcategories: { subcategory_option_id: string }[] | null;
  description: string | null;
  long_description: LongDescriptionBlock[] | null;
  seo_title: string | null;
  seo_description: string | null;
  assembly_video_url: string | null;
  assembly_pdf_url: string | null;
  visible: boolean | null;
  gallery_layout: string | null;
  variants: Variant[] | null;
  product_accessories: ProductAccessoryRow[] | null;
  accessory_combo_photos: ComboPhotoRow[] | null;
};

export type ProductAccessoryRow = {
  id: string;
  accessory_product_id: string;
  sort_order: number | null;
  max_qty: number | null;
  // Accessory options come with their NAMES here, not just ids: the editor's `options` prop is
  // scoped to the HOST product's catalog, so accessory-only axes («Короб», «Розмір: 134см») are
  // missing from it and an id lookup silently resolved to nothing.
  accessory: {
    id: string;
    model: string | null;
    combo_axis: string | null;
    variants: { variant_options: { options: { name: string; value: string | null } | null }[] | null }[] | null;
  } | null;
};

// One uploaded bed photo set for a (material group × accessory-upgrade combination) pair.
export type ComboPhotoRow = {
  id: string;
  image_group_key: string;
  combo_key: string;
  label: string;
  accessory_combo_images: { sort_order: number | null; images: { id: string; url: string } | null }[] | null;
};

export type DiscountMode = "none" | "percent" | "price";
