// Worker entry: OpenNext's generated worker + our own Durable Objects. Wrangler bundles this
// (wrangler.jsonc "main"); `opennextjs-cloudflare build` must run first to generate .open-next/.
// See https://opennext.js.org/cloudflare/howtos/custom-worker
// @ts-ignore — generated at build time
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;

export { CacheCoordinator } from "./src/lib/cache/CacheCoordinator";
