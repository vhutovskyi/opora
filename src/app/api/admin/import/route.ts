import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  importSpecs,
  importOptions,
  importProducts,
  importProductSpecs,
  importVariants,
  importBanners,
  importTopProducts,
  importOptionFilters,
  importComments,
} from "@/lib/importer/csvImporters";

type Rows = string[][];
type Payload = Partial<Record<
  "products" | "variants" | "options" | "specs" | "productSpecs" | "banners" | "topProducts" | "optionFilters" | "comments",
  Rows
>>;

// A one-off migration of the CSV export into Supabase. The order matters: the reference tables first
// (specs/options/products), then everything that references them through name→id maps.
export async function POST(request: NextRequest) {
  try {
    const { tables } = (await request.json()) as { tables: Payload };
    const db = supabaseAdmin();
    const counts: Record<string, number> = {};

    const specByName = await importSpecs(db, tables.specs || []);
    counts.specs = specByName.size;

    const optionByName = await importOptions(db, tables.options || []);
    counts.options = optionByName.size;

    const productByModel = await importProducts(db, tables.products || []);
    counts.products = productByModel.size;

    counts.product_specs = await importProductSpecs(db, tables.productSpecs || [], productByModel, specByName);

    const variantCounts = await importVariants(db, tables.variants || [], productByModel, optionByName);
    counts.variants = variantCounts.variants;
    counts.variant_options = variantCounts.variant_options;

    counts.banners = await importBanners(db, tables.banners || []);
    counts.top_products = await importTopProducts(db, tables.topProducts || [], productByModel);
    counts.option_filters = await importOptionFilters(db, tables.optionFilters || []);
    counts.comments = await importComments(db, tables.comments || []);

    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: (error as Error).message || "Import failed" }, { status: 500 });
  }
}
