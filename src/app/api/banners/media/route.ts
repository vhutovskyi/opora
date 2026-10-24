import { NextRequest, NextResponse } from "next/server";
import { tryCompressWebp, putObject, deleteObjects, keyFromUrl } from "@/lib/r2";

// Uploading banner images (Hero Slider / Catalog Hero) into the banners/ folder in R2.
// The DB rows are created/updated by the admin panel block itself — here we only handle the files.
// Banners are full-screen hero images above the fold, so we compress them to WebP ONCE here
// (via the IMAGES binding) rather than on every page request — the same as product photos.
// One transformation per uploaded banner — within the free 5000 Transformations/month.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('file') as File[];

    if (!files.length) {
      return NextResponse.json({ error: 'No files' }, { status: 400 });
    }

    const uploadPromises = files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const uniqueFilename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;

      // Compress to WebP (wider than the 1600 used for products — a hero spans the whole viewport).
      // If the compression failed — store the original as is.
      const compressedBuffer = await tryCompressWebp(buffer, { width: 1920, quality: 80 });
      if (compressedBuffer) {
        const webpKey = `banners/${uniqueFilename}.webp`;
        return putObject(webpKey, compressedBuffer, 'image/webp');
      }

      // Fallback: store the original as is.
      const fileKey = `banners/${uniqueFilename}`;
      return putObject(fileKey, buffer, file.type);
    });

    const urls = await Promise.all(uploadPromises);

    return NextResponse.json({
      success: true,
      url: urls[0],
      urls,
    }, { status: 200 });

  } catch (error) {
    console.error('Banner Upload Error:', error);
    return NextResponse.json({ error: 'Помилка завантаження зображення' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body as { url: string };

    if (!url) {
      return NextResponse.json({ error: 'Відсутній обов\'язковий параметр (url)' }, { status: 400 });
    }

    const fileKey = keyFromUrl(url);
    if (!fileKey) {
      return NextResponse.json({ error: 'Невалідна URL' }, { status: 400 });
    }

    await deleteObjects([fileKey]);

    return NextResponse.json({ success: true, message: 'Файл успішно видалено' }, { status: 200 });

  } catch (error) {
    console.error('Banner Delete Error:', error);
    return NextResponse.json({ error: 'Помилка видалення файлу' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200 });
}
