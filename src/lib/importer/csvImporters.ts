import { supabaseAdmin } from "@/lib/supabase";
import { s, bool, num, urls, optionNames, isoDate } from "./parse";

type Db = ReturnType<typeof supabaseAdmin>;
type Rows = string[][];

// 1. specs (0=Назва, 2=Фільтрується) → Map<name, id>
export async function importSpecs(db: Db, rows: Rows): Promise<Map<string, string>> {
  const specByName = new Map<string, string>();
  for (const r of rows) {
    const name = s(r[0]);
    if (!name) continue;
    const { data, error } = await db.from("specs").insert({ name, filterable: bool(r[2]) }).select("id").single();
    if (error) throw error;
    specByName.set(name, data.id);
  }
  return specByName;
}

// 2. options (0=Назва, 1=Значення) — dedupe on name (colours are unique) → Map<name, id>
export async function importOptions(db: Db, rows: Rows): Promise<Map<string, string>> {
  const optionByName = new Map<string, string>();
  for (const r of rows) {
    const name = s(r[0]);
    if (!name || optionByName.has(name)) continue;
    const { data, error } = await db.from("options").insert({ name, value: s(r[1]) || null }).select("id").single();
    if (error) throw error;
    optionByName.set(name, data.id);
  }
  return optionByName;
}

// 3. products (0=Модель,1=Мінімальна Ціна,2=Виробник,3=Каталог,4=Опис,5=Відео,6=PDF,12=Показувати) → Map<model, id>
export async function importProducts(db: Db, rows: Rows): Promise<Map<string, string>> {
  const productByModel = new Map<string, string>();
  for (const r of rows) {
    const model = s(r[0]);
    if (!model) continue;
    const { data, error } = await db
      .from("products")
      .insert({
        model,
        min_price: num(r[1]),
        manufacturer: s(r[2]) || null,
        catalog: s(r[3]) || null,
        description: s(r[4]) || null,
        assembly_video_url: s(r[5]) || null,
        assembly_pdf_url: s(r[6]) || null,
        visible: bool(r[12]),
      })
      .select("id")
      .single();
    if (error) throw error;
    productByModel.set(model, data.id);
  }
  return productByModel;
}

// 4. product_specs (0=Name,1=Товар,2=Характеристика,3=Значення)
export async function importProductSpecs(
  db: Db,
  rows: Rows,
  productByModel: Map<string, string>,
  specByName: Map<string, string>
): Promise<number> {
  const productSpecRows = rows
    .map((r) => {
      const product_id = productByModel.get(s(r[1]));
      const spec_id = specByName.get(s(r[2]));
      if (!product_id || !spec_id) return null;
      return { product_id, spec_id, value: s(r[3]), legacy_num: num(r[0]) };
    })
    .filter(Boolean);
  if (productSpecRows.length) {
    const { error } = await db.from("product_specs").insert(productSpecRows as object[]);
    if (error) throw error;
  }
  return productSpecRows.length;
}

// 5. variants (0=Назва,1=Артикул,2=Товар,3=Наявність,4=Ціна,5=%,6=Знижка Ціна,7=Знижена,9=Опції,11=Фото,12=Фото стиснені)
export async function importVariants(
  db: Db,
  rows: Rows,
  productByModel: Map<string, string>,
  optionByName: Map<string, string>
): Promise<{ variants: number; variant_options: number }> {
  let variantCount = 0;
  let linkCount = 0;
  let order = 0;
  for (const r of rows) {
    const product_id = productByModel.get(s(r[2]));
    if (!product_id) continue;
    const { data, error } = await db
      .from("variants")
      .insert({
        product_id,
        name: s(r[0]) || null,
        sku: s(r[1]) || null,
        in_stock: bool(r[3]),
        price: num(r[4]),
        discount_percent: num(r[5]),
        discount_price: num(r[6]),
        discounted_price: num(r[7]),
        photos: urls(r[11]),
        photos_compressed: urls(r[12]),
        sort_order: order++,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (!data) continue;
    variantCount++;

    const links = optionNames(r[9])
      .map((n) => optionByName.get(n))
      .filter((id): id is string => Boolean(id))
      .map((option_id) => ({ variant_id: data.id, option_id }));
    if (links.length) {
      const { error: linkErr } = await db.from("variant_options").insert(links);
      if (linkErr) throw linkErr;
      linkCount += links.length;
    }
  }
  return { variants: variantCount, variant_options: linkCount };
}

// 6. banners (0=Назва,1=Тип,2=Зображення,3=Порядок,4=Активний,5=Ширина)
export async function importBanners(db: Db, rows: Rows): Promise<number> {
  const bannerRows = rows
    .filter((r) => s(r[1]))
    .map((r) => ({
      name: s(r[0]) || null,
      type: s(r[1]),
      image: s(r[2]) || null,
      sort_order: num(r[3]),
      active: bool(r[4]),
      col_span: num(r[5]),
    }));
  if (bannerRows.length) {
    const { error } = await db.from("banners").insert(bannerRows);
    if (error) throw error;
  }
  return bannerRows.length;
}

// 7. top_products (1=Товари = model name)
export async function importTopProducts(db: Db, rows: Rows, productByModel: Map<string, string>): Promise<number> {
  const topRows = rows
    .map((r, i) => {
      const product_id = productByModel.get(s(r[1]));
      return product_id ? { product_id, sort_order: i } : null;
    })
    .filter(Boolean);
  if (topRows.length) {
    const { error } = await db.from("top_products").insert(topRows as object[]);
    if (error) throw error;
  }
  return topRows.length;
}

// 8. option_filters (0=Назва,1=Категорії)
export async function importOptionFilters(db: Db, rows: Rows): Promise<number> {
  const ofRows = rows
    .filter((r) => s(r[0]))
    .map((r) => ({ name: s(r[0]), categories: s(r[1]).split(",").map((c) => c.trim()).filter(Boolean) }));
  if (ofRows.length) {
    const { error } = await db.from("option_filters").insert(ofRows);
    if (error) throw error;
  }
  return ofRows.length;
}

// 9. comments (1=Ім'я,2=Рейтинг,3=Текст,4=Створено,5=Товар)
export async function importComments(db: Db, rows: Rows): Promise<number> {
  const commentRows = rows
    .filter((r) => s(r[1]) || s(r[3]))
    .map((r) => ({
      author_name: s(r[1]) || null,
      rating: num(r[2]),
      text: s(r[3]) || null,
      created_at: isoDate(r[4]),
      product_ref: s(r[5]) || null,
    }));
  if (commentRows.length) {
    const { error } = await db.from("comments").insert(commentRows);
    if (error) throw error;
  }
  return commentRows.length;
}
