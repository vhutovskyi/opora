import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import kvTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

export default defineCloudflareConfig({
	// Без цього unstable_cache у воркері — no-op (дефолтний override нічого не зберігає),
	// тобто КОЖЕН запит сторінки читав Supabase заново → Cloudflare 1102.
	// Потрібен KV-біндинг NEXT_INC_CACHE_KV (див. wrangler.jsonc).
	incrementalCache: kvIncrementalCache,
	// Щоб bump() / updateTag("catalog") після правок в адмінці реально скидав кеш.
	// KV eventually consistent — зміни підхоплюються до ~60с. Біндинг NEXT_TAG_CACHE_KV.
	tagCache: kvTagCache,
});
