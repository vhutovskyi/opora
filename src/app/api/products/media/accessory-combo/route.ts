import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { uploadImagePair } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase";
import { upsertImages, deleteImagesByIds } from "@/lib/supabase/images";

// Same as bump() in admin/actions/_shared.ts — updateTag() is Server-Action-only.
const purge = () => revalidateTag("catalog", "max");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const images = formData.getAll("file") as File[];
    const productId = formData.get("productId") as string | null;
    const imageGroupKey = formData.get("imageGroupKey") as string | null;
    const comboKey = formData.get("comboKey") as string | null;
    // comboKeys=JSON array → the SAME photos serve several combinations (Лаос: «одинарна мала
    // планка» is both 70см and 80см). Upload once, link to each — same trick as variationIds.
    const comboKeysRaw = formData.get("comboKeys") as string | null;
    const label = (formData.get("label") as string | null) || "";

    const comboKeys: string[] = comboKeysRaw ? JSON.parse(comboKeysRaw) : comboKey ? [comboKey] : [];
    if (!images.length || !productId || !comboKeys.length || imageGroupKey === null) {
      return NextResponse.json({ error: "No files or combo parameters" }, { status: 400 });
    }

    const uploadResults = await Promise.all(
      images.map((file) => uploadImagePair(file, { width: 1600, quality: 90 }))
    );
    const imageIds = await upsertImages(
      uploadResults.map((r) => ({ url: r.originalUrl, url_compressed: r.compressedUrl }))
    );

    const db = supabaseAdmin();
    const { data: combos, error: comboError } = await db
      .from("accessory_combo_photos")
      .upsert(
        comboKeys.map((combo_key) => ({
          product_id: productId,
          image_group_key: imageGroupKey,
          combo_key,
          label,
        })),
        { onConflict: "product_id,image_group_key,combo_key" }
      )
      .select("id");
    if (comboError) throw new Error(comboError.message);

    const ids = (combos ?? []).map((c) => c.id as string);
    const { data: existing } = await db
      .from("accessory_combo_images")
      .select("combo_photo_id, sort_order")
      .in("combo_photo_id", ids);
    const rows = ids.flatMap((combo_photo_id) => {
      let n =
        Math.max(
          -1,
          ...(existing || [])
            .filter((r) => r.combo_photo_id === combo_photo_id)
            .map((r) => (r.sort_order as number) ?? 0)
        ) + 1;
      return imageIds.map((image_id) => ({ combo_photo_id, image_id, sort_order: n++ }));
    });
    const { error: linkError } = await db
      .from("accessory_combo_images")
      .upsert(rows, { onConflict: "combo_photo_id,image_id" });
    if (linkError) throw new Error(linkError.message);

    purge();
    return NextResponse.json({ success: true, imageIds }, { status: 200 });
  } catch (error) {
    console.error("Combo Upload Error:", error);
    return NextResponse.json({ error: "Upload Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { imageId } = (await request.json()) as { imageId?: string };
    if (!imageId) {
      return NextResponse.json({ error: "Відсутній обов'язковий параметр (imageId)" }, { status: 400 });
    }
    await deleteImagesByIds([imageId]);
    purge();
    return NextResponse.json({ success: true, message: "Файл успішно видалено" }, { status: 200 });
  } catch (error) {
    console.error("Combo Delete Error:", error);
    return NextResponse.json({ error: "Помилка видалення файлу" }, { status: 500 });
  }
}
