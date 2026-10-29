import { NextRequest, NextResponse } from "next/server";
import { purgeTags } from "@/lib/cache/purgeTags";
import { uploadImagePair } from "@/lib/r2";
import { VARIANT_MEDIA_TAG } from "@/lib/supabase/products";
import {
  upsertImages,
  groupVariantIds,
  linkImagesToVariants,
  groupImageIds,
  deleteImagesByIds,
  reorderGroupImage,
} from "@/lib/supabase/images";

// The same as bump() in admin/actions/_shared.ts. Without this a freshly uploaded photo didn't reach the site for an hour —
// getVariantMedia returned a cached empty response and the page showed a mock photo.
// VARIANT_MEDIA_TAG is what actually makes that true: purging only "catalog" left the per-variant
// media entries (a different tag) serving the pre-upload photo list until their TTL expired.
const purge = () => purgeTags("catalog", VARIANT_MEDIA_TAG);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const images = formData.getAll("file") as File[];
    const variationId = formData.get("variationId") as string | null;
    // variationIds=JSON array → attach the SAME uploaded photo(s) to many explicit variants in one
    // call (e.g. one Estella accessory photo shared across a dozen colour variants of the same size).
    const variationIdsRaw = formData.get("variationIds") as string | null;
    // replace=true → we overwrite the GROUP's photos (the same Матеріал+Колір), the old ones are deleted from R2.
    const replace = formData.get("replace") === "true";
    // exact=true → we link the photos to ONE variant without propagating to siblings (for XML accessories)
    const exact = formData.get("exact") === "true";

    if (!images.length || (!variationId && !variationIdsRaw)) {
      return NextResponse.json({ error: "No files or variationId" }, { status: 400 });
    }

    // 1. Upload all the images to R2 IN PARALLEL. For every photo: the original (the fullscreen
    //    gallery) + a compressed WebP version (the page). Compressed once here, via the IMAGES binding.
    const uploadResults = await Promise.all(
      images.map((file) => uploadImagePair(file, { width: 1600, quality: 90 }))
    );

    // 2. Create the images rows (unique by url) and link them to the variants.
    // variationIds → exactly those variants, without grouping. exact → one variant only, without grouping.
    // Otherwise → grouping by Матеріал+Колір (folder importer / ProductEditor).
    const imageIds = await upsertImages(
      uploadResults.map((r) => ({ url: r.originalUrl, url_compressed: r.compressedUrl }))
    );
    const variantIds = variationIdsRaw
      ? (JSON.parse(variationIdsRaw) as string[])
      : exact
        ? [variationId!]
        : await groupVariantIds(variationId!);

    if (replace) {
      // Remove the group's old photos (R2 + images rows + links) before linking the new ones.
      const oldImageIds = await groupImageIds(variantIds);
      await deleteImagesByIds(oldImageIds);
    }
    await linkImagesToVariants(imageIds, variantIds);
    purge();

    return NextResponse.json({ success: true, imageIds, variantIds }, { status: 200 });
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Upload Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { imageId } = (await request.json()) as { imageId?: string };
    if (!imageId) {
      return NextResponse.json({ error: "Відсутній обов'язковий параметр (imageId)" }, { status: 400 });
    }
    // Delete the images row (the cascade removes variant_images for every variant of the group) + the R2 objects.
    await deleteImagesByIds([imageId]);
    purge();
    return NextResponse.json({ success: true, message: "Файл успішно видалено" }, { status: 200 });
  } catch (error) {
    console.error("Delete File Error:", error);
    return NextResponse.json({ error: "Помилка видалення файлу" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { variantId, imageId, direction } = (await request.json()) as {
      variantId?: string;
      imageId?: string;
      direction?: "left" | "right";
    };
    if (!variantId || !imageId || (direction !== "left" && direction !== "right")) {
      return NextResponse.json({ error: "Відсутні обов'язкові параметри" }, { status: 400 });
    }
    await reorderGroupImage(variantId, imageId, direction);
    purge();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Reorder Error:", error);
    return NextResponse.json({ error: "Помилка зміни порядку" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200 });
}
