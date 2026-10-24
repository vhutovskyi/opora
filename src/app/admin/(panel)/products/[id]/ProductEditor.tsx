"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Checkbox, Field, Input, Textarea } from "../../../ui";
import { buildSubcategoryTrees, type SubcategoryNode, type SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";
import AccessoriesSection from "./AccessoriesSection";
import AccessoryComboPhotosSection from "./AccessoryComboPhotosSection";
import LongDescriptionBuilder from "./LongDescriptionBuilder";
import VariantsSection from "./VariantsSection";
import { useProductForm } from "./useProductForm";
import type { Opt, ProductFull, ProductListItem, Spec } from "./productEditorTypes";
import type { LongDescriptionSnippet } from "@/lib/longDescription/types";

// Subcategory checkboxes — recursive, indented by the real depth of the tree.
function SubcategoryChecks({
  nodes,
  selectedIds,
  onToggle,
  depth,
}: {
  nodes: SubcategoryNode[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  depth: number;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id} className={depth > 0 ? "ml-5" : ""}>
          <Checkbox
            label={node.name}
            checked={selectedIds.includes(node.id)}
            onChange={() => onToggle(node.id)}
          />
          <SubcategoryChecks nodes={node.children} selectedIds={selectedIds} onToggle={onToggle} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

// Gallery layout: photo rows on desktop. The value is a string like "1,2" (photos per row).
// Empty = the default 2-per-row grid. Photos beyond the template are added 2 per row.
function GalleryLayoutEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const rows = value.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 4);
  const update = (next: number[]) => onChange(next.join(","));
  return (
    <div className="space-y-2">
      {rows.map((n, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14">Ряд {i + 1}</span>
          <select
            value={n}
            onChange={(e) => update(rows.map((x, j) => (j === i ? Number(e.target.value) : x)))}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k} фото
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => update(rows.filter((_, j) => j !== i))} aria-label="Видалити ряд">
            ×
          </Button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => update([...rows, 2])}>
        + Додати ряд
      </Button>
    </div>
  );
}

// The assembly PDF (products.assembly_pdf_url) — the "Збірка" accordion on the product page.
// The file goes through the same one-off upload as the long-description images; only the URL stays
// in the form, so the change applies after "Зберегти". Clearing the link does not delete the file from R2.
function AssemblyPdfField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/products/media/content-image", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Помилка завантаження");
      onChange(json.url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2 text-sm">
          <a href={value} target="_blank" rel="noreferrer" className="text-opora-brown underline break-all">
            {decodeURIComponent(value.split("/").pop() || "PDF")}
          </a>
          <Button variant="ghost" onClick={() => onChange("")} aria-label="Прибрати PDF">
            ×
          </Button>
        </div>
      )}
      <input type="file" accept="application/pdf" onChange={(e) => upload(e.target.files)} className="text-xs" />
      {uploading && <span className="ml-2 text-xs text-gray-500">Завантаження...</span>}
    </div>
  );
}

// SEO field length counter: Google cuts the title at ~60 characters, the description at ~160.
// A guideline, not validation — a longer one can be saved, the tail just won't be shown.
function SeoHint({ value, max, suffix }: { value: string; max: number; suffix: string }) {
  const len = value.trim().length;
  if (!len) return <p className="-mt-2 text-xs text-gray-400">Порожньо{suffix}</p>;
  return (
    <p className={`-mt-2 text-xs ${len > max ? "text-amber-600" : "text-gray-400"}`}>
      {len} / {max} символів{len > max ? " — Google обріже хвіст" : ""}
    </p>
  );
}

export default function ProductEditor({
  product,
  options,
  specs,
  subcategoryOptions,
  allProducts,
  catalogs,
  snippets,
}: {
  product: ProductFull | null;
  options: Opt[];
  specs: Spec[];
  subcategoryOptions: SubcategoryOptionRow[];
  allProducts: ProductListItem[];
  catalogs: { id: string; name: string; sort_order: number }[];
  snippets: LongDescriptionSnippet[];
}) {
  const router = useRouter();
  const { form, set, toggleSubcategory, saving, saveBasic, error } = useProductForm(product);
  const catalogSubcategories = useMemo(
    () => buildSubcategoryTrees(subcategoryOptions).get(form.catalog) ?? [],
    [subcategoryOptions, form.catalog]
  );
  const saveBtn = (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={saveBasic} disabled={saving || !form.model}>
        {saving ? "Збереження..." : "Зберегти"}
      </Button>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-opora-brown">{product ? form.model || "Товар" : "Новий товар"}</h1>
        <Button variant="ghost" onClick={() => router.push("/admin/products")}>
          ← До списку
        </Button>
      </div>

      <Card className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Модель *">
            <Input value={form.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <Field label="Виробник">
            <Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
          </Field>
          <Field label="Каталог">
            <select
              value={form.catalog}
              onChange={(e) => {
                set("catalog", e.target.value);
                set("subcategoryOptionIds", []);
              }}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">— оберіть каталог —</option>
              {/* Keep an unrecognized existing value selectable instead of silently dropping it */}
              {form.catalog && !catalogs.some((c) => c.name === form.catalog) && (
                <option value={form.catalog}>{form.catalog} (немає у списку)</option>
              )}
              {catalogs.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Мінімальна ціна">
            <Input type="number" value={form.min_price} onChange={(e) => set("min_price", Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Псевдонім у посиланні (необов'язково)">
          <Input
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder={form.model.replace(/\s+/g, "-") || "Ammi-Plus"}
          />
        </Field>
        <p className="-mt-2 text-xs text-gray-500">
          Латиниця, цифри й дефіси. Товар буде доступний за <code>/catalog/{form.slug || "Vega"}</code> і{" "}
          <code>/admin/products/{form.slug || "Vega"}</code>. Порожньо — лишається лише довга адреса з id;
          вона працює завжди, тож старі посилання не ламаються.
        </p>
        {form.catalog && catalogSubcategories.length > 0 && (
          <Field label="Підкатегорії">
            <div className="space-y-1">
              <SubcategoryChecks
                nodes={catalogSubcategories}
                selectedIds={form.subcategoryOptionIds}
                onToggle={toggleSubcategory}
                depth={0}
              />
            </div>
          </Field>
        )}
        <Field label="Опис">
          <Textarea rows={6} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Checkbox label="Показувати на сайті" checked={form.visible} onChange={(e) => set("visible", e.target.checked)} />
        <div>{saveBtn}</div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-opora-brown">SEO — як товар виглядає в Google</h2>
        <p className="text-xs text-gray-500">
          Обидва поля необов'язкові. Порожньо — заголовок береться з моделі, опис із мінімальної ціни
          («Від 3 340 ₴»), як і раніше. Заповнене поле показується точно так, як написано.
        </p>
        <Field label="SEO-заголовок (title)">
          <Input
            value={form.seo_title}
            onChange={(e) => set("seo_title", e.target.value)}
            placeholder={`${form.model || "Модель"} — купити у Львіві | OPORA`}
          />
        </Field>
        <SeoHint value={form.seo_title} max={60} suffix={` — інакше буде «${form.model || "Модель"} | OPORA»`} />
        <Field label="SEO-опис (description)">
          <Textarea rows={3} value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} />
        </Field>
        <SeoHint value={form.seo_description} max={160} suffix=" — інакше буде «Від <ціна> ₴»" />
        <div>{saveBtn}</div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-opora-brown">Детальний опис (сторінка товару)</h2>
        <LongDescriptionBuilder
          blocks={form.long_description}
          onChange={(b) => set("long_description", b)}
          snippets={snippets}
          footer={saveBtn}
        />
      </Card>

      <Card className="space-y-3">
        <Field label="Розкладка галереї (десктоп)">
          <GalleryLayoutEditor value={form.gallery_layout} onChange={(v) => set("gallery_layout", v)} />
        </Field>
        <Field label="PDF-інструкція зі збірки">
          <AssemblyPdfField value={form.assembly_pdf_url} onChange={(v) => set("assembly_pdf_url", v)} />
        </Field>
        <div>{saveBtn}</div>
      </Card>

      {product ? (
        <>
          <AccessoriesSection
            productId={product.id}
            links={product.product_accessories ?? []}
            allProducts={allProducts.filter((p) => p.id !== product.id)}
          />
          <AccessoryComboPhotosSection
            productId={product.id}
            links={product.product_accessories ?? []}
            variants={product.variants ?? []}
            options={options}
            comboPhotos={product.accessory_combo_photos ?? []}
            allProducts={allProducts}
          />
          <VariantsSection productId={product.id} variants={product.variants ?? []} options={options} specs={specs} />
        </>
      ) : (
        <p className="text-sm text-gray-500">Збережіть товар, щоб додати варіації, фото та характеристики.</p>
      )}
    </div>
  );
}
