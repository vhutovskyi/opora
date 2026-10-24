import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import r2Client from "@/lib/r2/r2.client";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const video = formData.get('file') as File;
    const productId = formData.get('productId') as string;

    if (!video || !productId) {
      return NextResponse.json({ error: 'No file or productId' }, { status: 400 });
    }

    const bytes = await video.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const uniqueFilename = `${Date.now()}-${video.name.replace(/\s+/g, '-')}`;
    // Store straight into the videos/ folder inside R2
    const fileKey = `videos/${uniqueFilename}`;

    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: buffer,
      ContentType: video.type,
    }));

    const newVideoUrl = `${process.env.R2_PUBLIC_DOMAIN}/${fileKey}`;

    await supabaseAdmin().from("products").update({ assembly_video_url: newVideoUrl }).eq("id", productId);

    return NextResponse.json({ 
      success: true, 
      url: newVideoUrl,
    }, { status: 200 });

  } catch (error) {
    console.error('Video Upload Error:', error);
    return NextResponse.json({ error: 'Помилка завантаження відео' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, productId } = body as { url: string, productId: string };

    if (!url || !productId) {
      return NextResponse.json({ error: 'Відсутні обов\'язкові параметри (url, productId)' }, { status: 400 });
    }

    const urlObj = new URL(url);
    const fileKey = urlObj.pathname.substring(1).split('/')[1];
    
    // 2. Delete the file from Cloudflare R2
    await r2Client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
    }));

    // 3. Update Supabase (clear the video field for this product)
    await supabaseAdmin().from("products").update({ assembly_video_url: "" }).eq("id", productId);

    return NextResponse.json({ success: true, message: 'Відео успішно видалено' }, { status: 200 });

  } catch (error) {
    console.error('Delete File Error:', error);
    return NextResponse.json({ error: 'Помилка видалення файлу' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200 });
}