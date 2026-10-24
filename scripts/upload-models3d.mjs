// Uploads 3D models (.glb/.usdz) to R2 under the models/ prefix.
// A one-off operation: the models are static, so the admin panel has no uploader for them —
// a new model is put into /tmp locally and this script is run (idempotent, overwrites).
// Run: node scripts/upload-models3d.mjs <folder-with-files>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error('Вкажіть теку з .glb/.usdz: node scripts/upload-models3d.mjs <тека>');
  process.exit(1);
}

// .env is read by the script itself — so the keys never end up in the output
const env = {};
for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const need = ['CLOUDFLARE_R2_API_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
const missing = need.filter((k) => !env[k]);
if (missing.length) {
  console.error('Немає змінних у .env:', missing.join(', '));
  process.exit(1);
}

// glTF-binary and USDZ: without the right content-type Safari won't open Quick Look
const TYPES = { '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip' };

const client = new S3Client({
  region: 'auto',
  endpoint: env.CLOUDFLARE_R2_API_URL,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const files = readdirSync(dir).filter((f) => TYPES[extname(f).toLowerCase()]);
if (!files.length) {
  console.error(`У ${dir} немає .glb/.usdz`);
  process.exit(1);
}

let bytes = 0;
for (const f of files) {
  const body = readFileSync(join(dir, f));
  const key = `models/${basename(f)}`;
  await client.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: TYPES[extname(f).toLowerCase()],
    // The models are immutable: file name = product, the contents are updated by hand only
    CacheControl: 'public, max-age=31536000',
  }));
  bytes += body.length;
  console.log(`↑ ${key} (${(body.length / 1024).toFixed(0)} КБ)`);
}
console.log(`\nГотово: ${files.length} файлів, ${(bytes / 1024 / 1024).toFixed(1)} МБ`);
