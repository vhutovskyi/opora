import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import r2Client from "./r2.client";

export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${process.env.R2_PUBLIC_DOMAIN}/${key}`;
}

export async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((Key) =>
      r2Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key })).catch(() => {})
    )
  );
}

export function keyFromUrl(url: string): string | null {
  try {
    return new URL(url).pathname.substring(1) || null;
  } catch {
    return null;
  }
}
