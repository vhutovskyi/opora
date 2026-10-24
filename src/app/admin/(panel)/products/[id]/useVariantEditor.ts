import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteVariant, generateUniqueSku, saveVariant } from "../../../actions";
import type { DiscountMode, Variant } from "./productEditorTypes";

function initialDiscount(variant: Variant): { mode: DiscountMode; value: number } {
  if ((variant.discount_percent ?? 0) > 0) return { mode: "percent", value: variant.discount_percent! };
  const dp = variant.discounted_price ?? 0;
  if (dp > 0 && dp < (variant.price ?? 0)) return { mode: "price", value: dp };
  return { mode: "none", value: 0 };
}

// One variant's edit form: fields, discount derivation, save/remove, and its photo uploads.
export function useVariantEditor(variant: Variant) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const initDisc = initialDiscount(variant);
  const [v, setV] = useState({
    name: variant.name ?? "",
    sku: variant.sku ?? "",
    price: variant.price ?? 0,
    in_stock: variant.in_stock ?? true,
    visible: variant.visible ?? true,
    discountMode: initDisc.mode,
    discountValue: initDisc.value,
    optionIds: (variant.variant_options ?? []).map((o) => o.option_id),
  });
  const [uploading, setUploading] = useState(false);

  const toggleOption = (id: string) =>
    setV((s) => ({ ...s, optionIds: s.optionIds.includes(id) ? s.optionIds.filter((x) => x !== id) : [...s.optionIds, id] }));

  // Derive the three discount columns from the chosen mode + value.
  function discountFields() {
    const price = Number(v.price) || 0;
    const val = Number(v.discountValue) || 0;
    if (v.discountMode === "percent" && val > 0) {
      const discounted = Math.round(price * (1 - val / 100) * 100) / 100;
      return { discount_percent: val, discounted_price: discounted, discount_price: Math.round((price - discounted) * 100) / 100 };
    }
    if (v.discountMode === "price" && val > 0 && val < price) {
      const percent = price > 0 ? Math.round(((price - val) / price) * 100) : 0;
      return { discount_percent: percent, discounted_price: val, discount_price: Math.round((price - val) * 100) / 100 };
    }
    return { discount_percent: null, discounted_price: null, discount_price: null };
  }
  const finalPrice = discountFields().discounted_price ?? (Number(v.price) || 0);

  // Guards against a fast double/triple-click firing multiple concurrent saves before React
  // re-renders `busy` — each one triggers a full (expensive) admin page refresh.
  const saving = useRef(false);
  function save() {
    if (saving.current) return;
    saving.current = true;
    start(async () => {
      try {
        await saveVariant({
          id: variant.id,
          product_id: "", // not updated on edit; supabase update ignores unchanged FK below
          name: v.name,
          sku: v.sku,
          price: Number(v.price) || 0,
          in_stock: v.in_stock,
          visible: v.visible,
          ...discountFields(),
          optionIds: v.optionIds,
        });
        router.refresh();
      } finally {
        saving.current = false;
      }
    });
  }
  function remove() {
    if (!confirm("Видалити варіацію?")) return;
    start(async () => {
      await deleteVariant(variant.id);
      router.refresh();
    });
  }

  async function randomizeSku() {
    const sku = await generateUniqueSku();
    setV((s) => ({ ...s, sku }));
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("file", f));
    fd.append("variationId", variant.id);
    await fetch("/api/products/media/images", { method: "POST", body: fd });
    setUploading(false);
    router.refresh();
  }
  // Photos are now shared by the group (the same Матеріал+Колір), so deleting removes them from every
  // variant of the group — exactly the "deleted once, gone everywhere" behaviour we want.
  async function deletePhoto(imageId: string) {
    if (!confirm("Видалити фото? (зникне з усіх варіацій цього кольору/матеріалу)")) return;
    await fetch("/api/products/media/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }),
    });
    router.refresh();
  }

  // Swap a photo with its neighbour (like deletePhoto — applies to the whole Матеріал+Колір
  // group, so the order stays the same for every variant sharing these photos).
  async function moveImage(imageId: string, dir: "left" | "right") {
    await fetch("/api/products/media/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: variant.id, imageId, direction: dir }),
    });
    router.refresh();
  }

  // Variant photos from the images table, in sort_order.
  const photos = (variant.variant_images ?? [])
    .filter((r) => r.images)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({ id: r.images!.id, url: r.images!.url }));

  return { v, setV, busy, uploading, photos, toggleOption, finalPrice, save, remove, randomizeSku, uploadImages, deletePhoto, moveImage };
}
