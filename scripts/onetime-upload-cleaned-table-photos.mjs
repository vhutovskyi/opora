// One-off: push the watermark-stripped "Столи" photos (produced by the local
// text-removal pass, manifest at /tmp/textstrip/full_run/manifest.json) back
// to R2, overwriting the same keys. Safe to re-run — skips nothing, always
// re-uploads what's in the manifest.
// node scripts/onetime-upload-cleaned-table-photos.mjs   (run from repo root)
import fs from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const env = {};
for (const f of [".env", ".env.local"]) {
  try {
    for (const l of fs.readFileSync(f, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const client = new S3Client({
  region: "auto",
  endpoint: env.CLOUDFLARE_R2_API_URL,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const Bucket = env.R2_BUCKET_NAME;
if (!Bucket) throw new Error("Missing R2_BUCKET_NAME");

const manifest = JSON.parse(fs.readFileSync("/tmp/textstrip/full_run/manifest.json", "utf8"));
const toUpload = manifest.filter((r) => r.had_watermark && !r.error);
console.log(`uploading ${toUpload.length} images (2x objects each: original + compressed)`);

let done = 0, failed = [];
async function uploadOne(entry) {
  const compressedKey = "images-compressed/" + entry.key.slice("images/".length) + ".webp";
  try {
    await client.send(new PutObjectCommand({
      Bucket, Key: entry.key,
      Body: fs.readFileSync(entry.cleaned_jpg), ContentType: "image/jpeg",
    }));
    await client.send(new PutObjectCommand({
      Bucket, Key: compressedKey,
      Body: fs.readFileSync(entry.cleaned_webp), ContentType: "image/webp",
    }));
  } catch (e) {
    failed.push({ id: entry.id, key: entry.key, error: String(e) });
  }
  done++;
  if (done % 200 === 0) console.log(`  ${done}/${toUpload.length}`);
}

const CONCURRENCY = 12;
let idx = 0;
async function worker() {
  while (idx < toUpload.length) {
    const entry = toUpload[idx++];
    await uploadOne(entry);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\ndone. uploaded=${done - failed.length} failed=${failed.length}`);
if (failed.length) {
  fs.writeFileSync("/tmp/textstrip/upload_failures.json", JSON.stringify(failed, null, 2));
  console.log("failures written to /tmp/textstrip/upload_failures.json");
}
