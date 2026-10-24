import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deleteObjects, keyFromUrl, putObject } from "./objects";

export async function tryCompressWebp(
  buffer: Buffer,
  opts: { width: number; quality: number }
): Promise<Buffer | null> {
  try {
    const { env } = getCloudflareContext();
    if (!env.IMAGES) throw new Error("IMAGES binding unavailable");
    const result = await env.IMAGES.input(new Blob([new Uint8Array(buffer)]).stream())
      .transform({ width: opts.width, fit: "scale-down" })
      .output({ format: "image/webp", quality: opts.quality });
    return Buffer.from(await new Response(result.image()).arrayBuffer());
  } catch (compressError) {
    console.error("Image compression failed, falling back to original:", compressError);
    return null;
  }
}

export async function uploadImagePair(
  file: File,
  opts: { width: number; quality: number }
): Promise<{ originalUrl: string; compressedUrl: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const uniqueFilename = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const fileKey = `images/${uniqueFilename}`;

  // Upload original
  const originalUrl = await putObject(fileKey, buffer, file.type);

  // Try to compress; fall back to original if it fails
  let compressedUrl = originalUrl;
  const compressedBuffer = await tryCompressWebp(buffer, opts);
  if (compressedBuffer) {
    const compressedKey = `images-compressed/${uniqueFilename}.webp`;
    compressedUrl = await putObject(compressedKey, compressedBuffer, "image/webp");
  }

  return { originalUrl, compressedUrl };
}

export async function deleteImageUrls(urls: string[]): Promise<void> {
  const keys = new Set<string>();
  for (const url of urls) {
    const key = keyFromUrl(url);
    if (!key) continue;
    keys.add(key);
    if (key.startsWith("images/")) {
      keys.add(`images-compressed/${key.slice("images/".length)}.webp`);
    }
  }
  await deleteObjects([...keys]);
}
