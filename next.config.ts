import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Warning: Leaving this as 'true' in production is dangerous.
    // It's highly recommended to fix TS errors before a prod build,
    // otherwise runtime crashes will slip through.
    ignoreBuildErrors: true,

  },
  images: {
    // Не оптимізуємо у Worker'і (/_next/image) — кодування великих фото на кожен запит
    // впирається в ліміти Worker'а (Cloudflare Error 1102), а /cdn-cgi/image робить це на
    // кожен перегляд і швидко з'їдає безкоштовні 5000 Transformations/міс. Натомість фото
    // стискаються у WebP ОДИН раз при завантаженні через IMAGES-біндинг (див.
    // /api/products/media/images і /api/banners/media) — це в межах free tier. Lazy-loading лишається.
    unoptimized: true,
    // Дозволені зовнішні хости для next/image.
    // R2 (фото товарів), picsum (тимчасові слайди героя).
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // CORS видалено: адмінка тепер у самому застосунку (/admin), тож усі виклики /api —
  // same-origin. Зовнішнє Airtable-розширення більше не використовується.
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();