// Sets the CORS policy on the R2 bucket so <model-viewer> can fetch .glb files.
//
// Why: the .glb is fetched from the site's domain to r2.dev — that is cross-origin, and without
// Access-Control-Allow-Origin the browser blocks it (r2.dev itself sends no CORS headers).
// USDZ is not affected: iOS Quick Look NAVIGATES to the file instead of fetching it.
// Idempotent: overwrites the policy wholesale.
// Run: node scripts/r2-cors-models.mjs
import { readFileSync, existsSync } from 'node:fs';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

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

const site = (env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const origins = [...new Set([
  site,
  // prod is often opened both with and without www
  site.startsWith('https://www.') ? site.replace('https://www.', 'https://') : site.replace('https://', 'https://www.'),
  'http://localhost:3000',
].filter(Boolean))];

const client = new S3Client({
  region: 'auto',
  endpoint: env.CLOUDFLARE_R2_API_URL,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

await client.send(new PutBucketCorsCommand({
  Bucket: env.R2_BUCKET_NAME,
  CORSConfiguration: {
    CORSRules: [{
      // Read only: the objects are public anyway, and nothing needs to be written from the browser.
      AllowedMethods: ['GET', 'HEAD'],
      AllowedOrigins: origins,
      AllowedHeaders: ['range', 'content-type'],
      ExposeHeaders: ['content-length', 'content-range'],
      MaxAgeSeconds: 86400,
    }],
  },
}));

const now = await client.send(new GetBucketCorsCommand({ Bucket: env.R2_BUCKET_NAME }));
console.log('CORS встановлено. Дозволені origins:');
for (const o of now.CORSRules?.[0]?.AllowedOrigins ?? []) console.log('  ', o);
console.log('Методи:', (now.CORSRules?.[0]?.AllowedMethods ?? []).join(', '));
