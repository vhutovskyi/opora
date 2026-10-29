import { coalescedCache } from "@/lib/cache/coalescedCache";
import { supabaseAdmin } from "./client";
import { BANNER_TYPES, CategoryBanner, SliderSlide } from "./types";

// Banners are managed through /admin and stored in R2. If the table is empty or errors out —
// we return empty data (the components show a fallback). Hence everything is in try/catch.

async function fetchSliderImages(): Promise<SliderSlide[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("banners")
      .select("image, title, subtitle")
      .eq("type", BANNER_TYPES.slider)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data || [])
      .filter((r) => r.image)
      .map((r) => ({ image: String(r.image), title: r.title, subtitle: r.subtitle }));
  } catch (error) {
    console.error("getSliderImages error:", error);
    return [];
  }
}

/** Active slides of the main slider, sorted by "Порядок" — a handful of rows, well under the 2MB unstable_cache limit. */
export const getSliderImages = coalescedCache(fetchSliderImages, ["banners-slider"], {
  revalidate: 3600,
  tags: ["catalog"],
});

async function fetchCategories(): Promise<CategoryBanner[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("banners")
      .select("name, image, col_span")
      .eq("type", BANNER_TYPES.category)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data || [])
      .map((r) => ({
        title: String(r.name || ""),
        image: String(r.image || ""),
        colSpan: Math.min(4, Math.max(1, Number(r.col_span) || 1)),
      }))
      .filter((c) => c.title);
  } catch (error) {
    console.error("getCategories error:", error);
    return [];
  }
}

/** Category tiles — the active records of type "Категорія". */
export const getCategories = coalescedCache(fetchCategories, ["banners-categories"], {
  revalidate: 3600,
  tags: ["catalog"],
});

async function fetchCatalogHeroImage(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("banners")
      .select("image")
      .eq("type", BANNER_TYPES.catalog)
      .limit(1);
    if (error) throw error;
    const url = data?.[0]?.image;
    return url ? String(url) : null;
  } catch (error) {
    console.error("getCatalogHeroImage error:", error);
    return null;
  }
}

/** The catalog banner image (a single record of type "Каталог") — one URL, well under the 2MB unstable_cache limit. */
export const getCatalogHeroImage = coalescedCache(fetchCatalogHeroImage, ["catalog-hero-image"], {
  revalidate: 3600,
  tags: ["catalog"],
});
