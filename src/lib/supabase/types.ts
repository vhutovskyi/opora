// Shared domain types (same shapes the app consumed from the Airtable layer).

import type { LongDescriptionBlock } from "@/lib/longDescription/types";

export interface VariationImage {
  id: string;
  allHexes: { hex: string; name: string }[];
  images: string[];            // originals
  imagesCompressed?: string[]; // compressed (falls back to images)
  colorName?: string;
  price?: string;
  discountedPrice?: string; // set when the variant has an active sale price lower than `price`
}

export interface Specification {
  name: string;
  value: string;
}

export interface ProductDetails {
  id: string;
  slug?: string | null; // products.slug — the human-readable address; href already takes it into account
  name: string;
  price: number;
  href: string;
  variations: VariationImage[];
  pdfLink?: string;
  catalog?: string | null;
}

export interface ProductDetailOption {
  name: string;
  value: string;
}

// The heavy "payload" of a variant. The product page does NOT send it to the browser for every
// variant (a bed has 1000 of them) — only for the active one; the rest is pulled through getVariantMedia.
export interface VariantMedia {
  images: string[];
  imagesCompressed: string[];
  specifications: Specification[];
}

export interface ProductDetailVariant extends VariantMedia {
  id: string;
  name: string;
  sku: string;
  price: number;
  discountedPrice: number | null; // variants.discounted_price, set when discounted_price < price
  inStock: boolean;
  options: ProductDetailOption[];
}

// One column of the /compare page: a variant together with the product it belongs to.
export interface CompareVariant extends ProductDetailVariant {
  productId: string;
  slug: string | null;
  model: string;
  catalog: string;
}

export interface ProductAccessoryLink {
  id: string; // product_accessories.id
  product: {
    id: string;
    slug: string | null;
    model: string;
    minPrice: number;
    // products.combo_axis — which of this accessory's option axes swaps the HOST product's photos.
    comboAxis: string | null;
    variants: ProductDetailVariant[];
  };
  maxQty: number; // product_accessories.max_qty — cap on the storefront quantity stepper
}

// Bed photos for one accessory-upgrade combination: replaces the gallery while that exact
// combination is selected. Keyed by imageGroupKey so each material has its own set.
export interface AccessoryComboPhotos {
  imageGroupKey: string;
  comboKey: string;
  images: string[];
  imagesCompressed: string[];
}

export interface ProductDetail {
  id: string;
  slug: string | null;
  name: string;
  model: string;
  // Manual SEO fields (product_seo.sql). Empty = generateMetadata derives them itself.
  seoTitle: string;
  seoDescription: string;
  catalog: string;
  description: string;
  longDescription: LongDescriptionBlock[];
  assemblyVideoUrl: string;
  assemblyPdfUrl: string;
  minPrice: number;
  galleryLayout: number[]; // images-per-row for the desktop gallery grid; [] = default 2-col
  variants: ProductDetailVariant[];
  accessories: ProductAccessoryLink[];
  accessoryComboPhotos: AccessoryComboPhotos[];
}

export type Product = {
  id: string;
  model: string;
  description: string;
  price: number;
  discountedPrice: number;
  discountPercentage: number;
  discountPrice: number;
  inStock: boolean;
};

export type ChairProduct = Product & {
  legsColorName: string;
  legsColorHex: string;
  sitColorName: string;
  sitColorHex: string;
};
export type NightstandProduct = Product;
export type TableProduct = Product;

// Catalog
export type ProductType = string;
export type SortOption = "default" | "price_asc" | "price_desc" | "newest";

export interface FilterParams {
  type: ProductType;
  seatColor?: string;
  legColor?: string;
  tableColor?: string;
  sort?: SortOption;
}

export interface CatalogProductDetails {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  href: string;
  variations: VariationImage[];
  allOptionNames?: string[];
  catalog?: string | null;
}

export interface FilterParamsWithArrays {
  type: ProductType[];
  sub?: string[]; // subcategory_options node ids (any depth); empty = no filter
  sort?: string;
  optionFilters?: Record<string, string[]>;
  specFilters?: Record<string, string[]>;
  priceMin?: number;
  priceMax?: number;
}

export interface FilterOption {
  label: string;
  hex?: string;
  categories: ProductType[];
  sortOrder?: number;
}

export interface OptionFilterGroup {
  groupName: string;
  categories: ProductType[];
  values: FilterOption[];
}

export interface SpecFilterGroup {
  specName: string;
  values: string[];
}

// Comments
export type Comment = {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  variation?: string;
  createdAt?: string;
};

// Banners
export interface CategoryBanner {
  title: string;
  image: string;
  colSpan: number;
}
export interface SliderSlide {
  image: string;
  title: string | null;
  subtitle: string | null;
}

// Requests (the client-side type)
import type { CartItem } from "@/store/cartStore";
export type ClientRequest = {
  name: string;
  email?: string;
  phoneNumber?: string;
  orderNumber?: string;
  orders: CartItem[];
  deliveryMethod?: "novaposhta" | "auto" | "private";
  deliveryCity?: string;
  deliveryWarehouse?: string;
};

export const BANNER_TYPES = {
  slider: "Слайдер",
  catalog: "Каталог",
  category: "Категорія",
} as const;
