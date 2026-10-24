import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProduct } from "../../../actions";
import type { ProductFull } from "./productEditorTypes";

// Basic product fields (model/catalog/description/long_description/visible) + save.
// Variants, accessories and specs have their own state — this hook only owns the
// top two cards of ProductEditor.
export function useProductForm(product: ProductFull | null) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [error, setError] = useState("");
  const currentRef = product?.slug ?? product?.id ?? "";
  const [form, setForm] = useState({
    slug: product?.slug ?? "",
    model: product?.model ?? "",
    manufacturer: product?.manufacturer ?? "",
    min_price: product?.min_price ?? 0,
    catalog: product?.catalog ?? "",
    subcategoryOptionIds: (product?.product_subcategories ?? []).map((s) => s.subcategory_option_id),
    description: product?.description ?? "",
    seo_title: product?.seo_title ?? "",
    seo_description: product?.seo_description ?? "",
    long_description: Array.isArray(product?.long_description) ? product.long_description : [],
    gallery_layout: product?.gallery_layout ?? "",
    assembly_pdf_url: product?.assembly_pdf_url ?? "",
    visible: product?.visible ?? true,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleSubcategory = (id: string) =>
    setForm((f) => ({
      ...f,
      subcategoryOptionIds: f.subcategoryOptionIds.includes(id)
        ? f.subcategoryOptionIds.filter((x) => x !== id)
        : [...f.subcategoryOptionIds, id],
    }));

  function saveBasic() {
    start(async () => {
      setError("");
      try {
        const id = await saveProduct({
          id: product?.id,
          slug: form.slug,
          model: form.model,
          manufacturer: form.manufacturer,
          min_price: Number(form.min_price) || 0,
          catalog: form.catalog,
          subcategoryOptionIds: form.subcategoryOptionIds,
          description: form.description,
          // An empty field → null: the product page then generates the metadata itself again.
          seo_title: form.seo_title.trim() || null,
          seo_description: form.seo_description.trim() || null,
          long_description: form.long_description,
          gallery_layout: form.gallery_layout || null,
          assembly_pdf_url: form.assembly_pdf_url,
          visible: form.visible,
        });
        // The address field may have just changed the page URL itself, so we go to the canonical one
        // (the slug, if there is one) — a refresh on the old slug would give a 404.
        const ref = form.slug.trim() || id;
        if (!product || ref !== currentRef) router.push(`/admin/products/${ref}`);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не вдалося зберегти");
      }
    });
  }

  return { form, set, toggleSubcategory, saving, saveBasic, error };
}
