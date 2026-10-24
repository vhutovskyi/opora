# OPORA Architecture Review

Scope: full-stack review of the OPORA storefront — Next.js 16 (App Router, React 19) on Cloudflare Workers via OpenNext, Supabase/Postgres as the database, R2 for media. Written for a project expected to grow from ~dozens to potentially tens of thousands of products.

---

## 1. Architecture Understanding

**Overall shape.** Server Components (`src/app/`) read Supabase directly and hand interactive slices to Client Components (`*Client.tsx`). There is no separate API-server tier for the storefront — Next.js *is* the backend. A parallel Server Actions layer (`src/app/admin/actions/`) is the entire admin write path; there are no per-entity REST/CRUD routes. A handful of public `api/` routes exist only where a client needs data outside the SSR page lifecycle (variant media, search, Nova Poshta, Telegram, comments).

**Folder structure** (`src/`):
- `app/` — ~102 files, ~32 routes: public storefront (`/`, `/catalog`, `/catalog/[slug]`), `admin/login` (public) + `admin/(panel)/*` (authed: products, banners, comments, requests, filters, catalogs, import, estella, image-dedup), and `api/*` (8 domains: admin, banners, comments, novaposhta, products, requests, search, telegram).
- `components/` — 20 files, ~2,600 loc, feature-folders not type-folders: `layout/` (Header, Footer, nav, search overlay — 737 loc), `blocks/` (FilterContent, SortContent, TopProducts, Reviews, RecentlyViewed — 838 loc), `ui/` (ProductCard, Icons, Toast — 960 loc), `seo/` (JsonLd, minimal).
- `lib/supabase/` — the domain layer: `products.ts`, `catalog.ts`, `comments.ts`, `banners.ts`, `requests.ts`, `search.ts`, plus `client.ts`/`browser.ts` (two Supabase clients), `types.ts` (hand-maintained, no generated types).
- `lib/estella/`, `lib/importer/` — three independent import pipelines (CSV one-time migration, Estella XML ongoing feed, Estella folder constructor).
- `lib/r2/`, `lib/novaposhta/`, `lib/telegram/` — external integrations.

**Database design.** Core catalog is `products → variants (1:n) → variant_options → options`, with images normalized separately (`images ↔ variants` via `variant_images`, m:n, deduped by URL) and specs per-variant (`variant_specs → specs`). Category taxonomy is a *second*, loosely-coupled schema: `catalogs` (top-level, `name` unique) and `subcategory_options` (`catalog` references `catalogs.name` as **text, not a foreign key**; `parent` self-reference gives two levels). There is no `category_id` foreign key anywhere in `products` — filtering joins by matching product fields against these name strings.

**API design.** No REST resource model, no GraphQL, no OpenAPI contract. Reads are plain async functions called from Server Components, wrapped in `unstable_cache(..., { tags: ["catalog"] })`; writes are Server Actions that mutate then call `bump()` (`updateTag("catalog") + revalidatePath("/admin")`). Public `api/` routes are the only place anything resembling a "contract" exists, and they're thin — logic lives in `lib/`.

**Frontend architecture.** Standard RSC/Client split, TanStack Query for client-side fetches (variant media, search), Zustand + `persist` for cart (only `items` persisted, so refresh doesn't reopen the drawer). Product pages deliberately don't ship every variant's media to the browser — `toClientProduct` strips images/specs off all but the first variant; the rest is fetched lazily per-variant via a KV-cached API route, prefetched on hover.

**CMS architecture.** Single shared admin login (Supabase Auth cookie, enforced in `middleware.ts`), no roles/permissions model, no audit log. Server Actions per entity, a small custom Tailwind component kit (`ui.tsx`) instead of an external admin UI library.

**Product/variant/category representation** — see §2, this is the crux of the review.

---

## 2. Data Model Evaluation

**Product/variant model: strong, close to industry norm.** `products → variants → variant_options → options` is structurally identical to how Shopify/Medusa/Saleor model this (a product is a shell; variants are the sellable SKUs; options are shared, deduplicated dimensions). Reading an option's type from its *value* (hex → swatch, Так/Ні → checkbox, else → chip) rather than a `kind` column is unusual but pragmatic — it avoids a schema migration for a UI concern, at the cost of the type being implicit and reconstructed by string/format-sniffing in multiple places (`isHexColor`, `isBoolGroup`).

**Images: well normalized.** `images ↔ variants` as m:n dedup, `url_compressed` derived by URL-rewrite rule rather than stored — genuinely good design, avoids storing a second URL per row and keeps the invariant enforced by convention (documented and verified against all 24,245 rows per CLAUDE.md, not just assumed).

**Specs: correctly modeled, but per-variant duplication is a live cost.** `variant_specs → specs` was migrated off a per-product table specifically so specs could vary by variant — correct call for a catalog where a "180×200" bed and a "90×200" bed genuinely have different characteristics. The tradeoff: the folder-import pipeline has to explicitly copy XML characteristics onto every size/lamella/config clone of a promoted offer, which means the specs pipeline has no single write path — it's replicated at each promotion site.

**Category hierarchy: the weakest part of the data model.** `subcategory_options.catalog` is a **text reference to `catalogs.name`**, not a UUID foreign key. This is the one place in the schema that breaks from the FK discipline used everywhere else (products→variants→options is all UUID FKs). Concretely:
- Renaming a catalog silently orphans every subcategory row pointing at the old name — no constraint would catch it, no cascade would fix it.
- Depth is capped at 2 by convention (`parent IS NULL` vs not), not by a real recursive/adjacency structure, so a third level requires another special-cased column, not a recursive query.
- `products.subcategory` / `subcategory2` are free text on the product row, matched against `subcategory_options.name` — a second point of string-based coupling, not FK-enforced. Level 2 exists in data but isn't surfaced in the storefront filter UI at all (dead weight in the schema until someone builds that UI).

**Options: correctly shared, but with an implicit, cross-product-type coupling that just caused a real bug.** Options are global rows (`options.name`/`value`), shared across every product that uses "Колір: Чорний" etc. This is right for genuine cross-product overlap (frame colors, fabric colors). But it silently assumes every axis name means the same thing for every product type. The **currently-uncommitted `restore_leg_color.sql`** is a direct instance of this failing: a migration in `checkbox_options.sql` ran `delete from options where name ilike 'Колір ніжок:%'` to clean up a leg-color experiment on *beds*, and it deleted the axis globally — including for *chairs*, which still needed it. There is no `product_type` dimension anywhere in the schema to scope that deletion or to express "this axis applies to bed variants only." The recovery script has to reconstruct the axis by parsing `-white/`/`-black/` substrings out of image URLs — a workaround, not a fix of the underlying gap.

**Rich descriptions:** `products.long_description` as free-form Markdown+HTML is a reasonable pragmatic choice for a small catalog (renders full-width, has its own one-off image-upload endpoint) — but it means SEO/structured content extraction from that field is not possible without an HTML parser, and there's no per-section structure a CMS editor could reuse programmatically.

**Relationships between entities, summarized:**
| Relationship | Mechanism | FK-enforced? |
|---|---|---|
| products → variants | 1:n | Yes |
| variants → options | via variant_options (m:n) | Yes |
| variants → images | via variant_images (m:n) | Yes |
| variants → specs | via variant_specs (m:n) | Yes |
| products → products (accessories) | self-referencing m:n | Yes |
| products → catalogs | **string match on product fields, no column** | No |
| products → subcategory_options | **string match on `subcategory`/`subcategory2` text columns** | No |

The FK-backed half of the model is genuinely solid; the category/catalog half is the part that will need a real migration (surrogate-keyed, FK-enforced hierarchy) before the taxonomy can grow past two hand-maintained levels.

---

## 3. Comparison Against Industry Standards

| Pattern | Shopify/Medusa/Saleor convention | OPORA | Assessment |
|---|---|---|---|
| Product/variant split | Product = shell, Variant = SKU, Option = shared axis | Same shape | ✅ implemented |
| Deduplicated media | Media table, m:n to variant/product | `images ↔ variant_images` | ✅ implemented, arguably cleaner (derives compressed URL by rule) |
| Category tree | Adjacency list or nested set with FK, arbitrary depth | Two-level, name-matched, no FK | ⚠️ partially implemented, structurally weaker |
| Full-text/faceted search | Dedicated search index (Algolia/Elasticsearch/Meilisearch) or Postgres `tsvector` | Plain `ILIKE` | ❌ missing — explicitly flagged in-code as a known ceiling |
| Structured product data (SEO) | Product/Offer/BreadcrumbList JSON-LD per page | Organization-only, sitewide | ❌ missing |
| Product type / attribute sets | Distinct attribute sets or metafield namespaces per product type | Flat global `options` table, no type scoping | ❌ missing — root cause of the live leg-color bug |
| Inventory/pricing per variant | Standard | `variants` presumably carries this (not reviewed here in depth — out of scope of today's pass, confirm before treating as verified) | not assessed |
| CMS roles/permissions | Staff accounts with scoped permissions | Single shared login, no roles | ❌ missing, but justified at current team size |
| Headless/composable rendering | SSR/ISR + CDN edge | RSC + `unstable_cache` + Cloudflare KV | ✅ implemented, reasonably sophisticated for the platform |

**Deviations that are justified:** no roles/permissions (single-admin team, adding this now would be pure speculative engineering); no separate API/backend tier (Next.js-as-backend is a legitimate, common pattern at this scale, not a shortcut); reading option type from value instead of a `kind` column (documented, small dataset, avoids a migration for cosmetic dispatch).

**Deviations that are not yet justified and will bite at scale:** the text-matched category hierarchy, the ILIKE search, the missing `product_type` dimension, and the unpaginated sitemap (below).

---

## 4. Scalability Review

| Scale | Verdict | Notes |
|---|---|---|
| **100 products** | Comfortable | Every current design choice (KV cache, packed payloads, ILIKE search, unpaginated sitemap) targets exactly this order of magnitude. |
| **10,000 products** | Workable with fixes | Sitemap (`app/sitemap.ts`, `revalidate = 3600`) calls `getFilteredCatalog({ type: "All" })` and materializes **every product in one array, in one request** — at 10k rows this is a large single Supabase round-trip and a large in-memory array on every hourly regeneration; still probably fine, but it's the first thing that will need pagination (`sitemap.xml` index + numbered children, which Next supports natively via `generateSitemaps`). ILIKE search across `products`/`variant_options`/`variant_specs` starts to show latency without a trigram or `tsvector` index — the code already knows this (see the in-file ponytail comment). The 2MB `unstable_cache` ceiling that `fetchCatalogBase`/`fetchProductById` already work around will need re-measuring per CLAUDE.md's own warning ("if you add fields to either, re-measure") — at 10k products, even the deduplicated-per-`imageGroupKey` catalog payload should be re-checked. |
| **100,000 products** | Needs real work | Three concrete bottlenecks: (1) sitemap generation as currently written will time out or exceed Workers' memory/CPU limits — needs pagination; (2) ILIKE search has no index-friendly access path at this volume and needs a `tsvector` column + GIN index (the code's own comment names this exact upgrade); (3) the category model's two-level, string-matched taxonomy becomes an operational risk — a name typo or rename silently detaches subcategories with zero DB-level warning, and at 100k products across many categories that's a much more expensive mistake to notice and fix by hand. The admin CMS itself (single shared login, no bulk-edit workflows beyond the folder importer) would also become the practical bottleneck before the database does — 100k products edited one-by-one through the current admin UI is a workflow problem, not just a data problem. |

**Bottleneck ranking by urgency:** category FK gap > sitemap pagination > search index > admin bulk-editing UX. None of these are urgent at current catalog size; all four should be sequenced in *before* a 10x catalog-size event, not reacted to after.

---

## 5. Architecture Smells

- **Missing abstraction: no `product_type` dimension.** This is the single highest-value gap identified. Beds and chairs currently share one flat `options` namespace and rely on naming conventions ("Колір ніжок" is meaningful for chairs, meaningless for beds) plus scattered conditional logic in the importer (`parseBedsFolder`/`deriveBedVariant` special-cases beds specifically, elsewhere), rather than a schema-level type distinction. The currently-uncommitted `restore_leg_color.sql` is not a hypothetical risk — it is the direct, dated (2026-07-27) evidence that this gap already caused data loss in production and required a manual, heuristic (URL-substring-based) recovery.
- **Hidden complexity: option semantics are name-string-derived, not typed.** `isHexColor`/`isBoolGroup` reconstruct an option's UI behavior from its value at read time in multiple call sites. Works today; is exactly the kind of implicit contract that breaks silently when a new option shape appears (e.g., a numeric range option) without corresponding dispatch logic anywhere calling it out.
- **Tight coupling via string matching in the category system**, covered in §2/§4 — the one place FK discipline was dropped.
- **No over-engineering found.** Notably, the codebase does *not* exhibit the more common failure mode (speculative abstractions, unused generic layers, a CMS framework where a few Server Actions would do). The `ponytail:`-tagged comments throughout (search, cache sizing) are evidence of deliberate, documented scope-limiting rather than accidental under-engineering — this is a codebase-health positive, not a smell.
- **Duplicate logic: specs propagation.** Variant specs are copied at each promotion/clone site in the folder importer rather than derived from one place — acceptable for current import volume, but a second bug class waiting if a new clone path is added without the same copy step.
- **Technical debt is tracked, not hidden.** The `ponytail:` comment convention (e.g. in `catalog.ts` for cache-size tracking, in `search.ts` for the ILIKE ceiling) means debt is visible and dated in the code itself rather than living only in institutional memory — worth calling out as a strength, since it directly counters the usual "nobody remembers why this is shaped this way" failure mode.

---

## 6. Ratings

| Area | Score /10 | Why |
|---|---|---|
| Database (core catalog) | 8 | FK-disciplined, correctly normalized (images, specs, options), migrated deliberately (product_specs → variant_specs) rather than left stale. |
| Database (category/taxonomy) | 4 | The one un-FK'd, string-matched subsystem; caps at 2 levels by convention not design. |
| Backend architecture | 7 | Next.js-as-backend + Server Actions is coherent and appropriately minimal for team size; no needless service layer. |
| Frontend architecture | 7 | Clean RSC/Client split, deliberate payload-size engineering (variant media lazy-loading), feature-folder organization. |
| CMS | 6 | Functional single-admin tool; no roles, no bulk workflows beyond folder import — adequate for current scale only. |
| Product model | 8 | Matches industry norm closely. |
| Variant model | 8 | Same. |
| Category model | 4 | See above — the weakest single piece of the schema. |
| Maintainability | 7 | Excellent documentation discipline (CLAUDE.md, inline ponytail comments with named upgrade paths) offsets the implicit-typing and string-matching smells. |
| Scalability | 6 | Fine to 10k with two knobs (sitemap pagination, search index) that are already identified; needs the category model fixed before real growth. |
| Extensibility | 5 | Adding a genuinely new product type today means touching importer conditionals, option naming conventions, and admin UI by hand — no clean extension point. |
| **Overall architecture** | **7** | Disciplined, deliberately-scoped engineering with one clear structural gap (category FK model + product-type dimension) that is well worth fixing before the next catalog-scale jump, not urgent today. |

---

## 7. Prioritized Improvements

### Critical
1. **Add a `product_type` (or `category_id` FK) dimension that scopes options.**
   - *Why it matters:* Root cause of the live leg-color data-loss incident (`restore_leg_color.sql`). Without it, every future bulk edit/cleanup on `options` risks the same cross-product-type collision.
   - *Solution:* Add a `product_type` enum/FK to `products`, and either scope option-cleanup migrations by joining through `variant_options → variants → products.product_type`, or namespace option names/rows per type.
   - *Complexity:* Medium — schema addition is small; auditing every existing bulk-option query/migration for scoping is the real work.

2. **Convert `subcategory_options.catalog` (and `products.subcategory`/`subcategory2`) to FK-enforced references instead of text matching.**
   - *Why it matters:* Silent orphaning on rename; no DB-level integrity guarantee on the one relationship in the schema that lacks it.
   - *Solution:* Add `catalog_id uuid references catalogs(id)`, backfill from the existing name match, then drop the text column (or keep it denormalized read-only for display).
   - *Complexity:* Medium — requires a one-time backfill migration plus updating `getCatalogs`/`getSubcatalogs`/`getFilteredCatalog` in `catalog.ts`.

### Important
3. **Paginate `app/sitemap.ts` before the catalog crosses ~5-10k products.**
   - *Why it matters:* Current implementation fetches every product in one call every hour; will hit Workers CPU/memory ceilings or search-engine sitemap size limits well before 100k products.
   - *Solution:* Use Next's `generateSitemaps` to emit a sitemap index + chunked child sitemaps.
   - *Complexity:* Low — Next has native support for this pattern.

4. **Add a `tsvector` column + GIN index for search, replacing/supplementing ILIKE.**
   - *Why it matters:* Already flagged in-code by the team itself; word-order sensitivity and lack of an index are the two concrete failure modes today.
   - *Solution:* `websearch_to_tsquery` + generated `tsvector` column on the searched text fields, as the existing code comment already prescribes.
   - *Complexity:* Low-Medium — one migration + rewriting `searchProducts`'s text-match branch.

5. **Expose the already-modeled level-2 subcategory in the storefront filter UI, or remove it from the schema.**
   - *Why it matters:* Dead schema surface (`subcategory2`, `subcategory_options.parent`) is either unused debt or a half-shipped feature — both are worth resolving deliberately rather than leaving ambiguous.
   - *Solution:* Either wire `FilterContent.tsx` to render level-2 options, or drop the column if it's not planned.
   - *Complexity:* Low.

### Nice to Have
6. **Product/Offer/BreadcrumbList JSON-LD per product page**, not just a sitewide Organization schema — improves rich-result eligibility with modest effort (`JsonLd.tsx` already has the pattern established, just needs per-page instances).
   - *Complexity:* Low.

7. **Centralize variant-specs propagation** in the folder-import pipeline into one function instead of copying at each clone site, to remove the "forgot to copy specs onto the new clone path" risk class.
   - *Complexity:* Low-Medium.

---

## 8. Final Summary

**Top 10 strengths**
1. FK-disciplined core catalog model (products/variants/options/images/specs) matching industry-standard shape.
2. Deliberate, documented image deduplication (`imageGroupKey`) with verified invariants, not assumed ones.
3. Payload-size engineering taken seriously — packed/unpacked cache representations measured and re-measured against a real 2MB ceiling.
4. Variant-media lazy-loading (only first variant shipped SSR, rest fetched on hover) — a real scale-driven optimization already in production.
5. Migration discipline: `product_specs → variant_specs` was a deliberate, documented move to correct a modeling mistake, not left in place.
6. Debt is tracked in-code (`ponytail:` comments naming the ceiling and the upgrade path) rather than living only in tribal memory.
7. No REST/GraphQL ceremony where Server Actions suffice — appropriately minimal backend for team size.
8. Import pipeline complexity (three distinct feeds) is isolated behind thin routes with the real logic in `lib/`, not smeared across API handlers.
9. Cache-invalidation discipline (`bump()` called after every admin mutation) is centralized and consistently applied.
10. No evidence of over-engineering — no speculative abstractions, no unused generic layers found in this pass.

**Top 10 weaknesses**
1. Category/subcategory hierarchy is string-matched, not FK-enforced — the one structurally weak relationship in an otherwise disciplined schema.
2. No `product_type` dimension — options are globally shared with no scoping, and this already caused a production data-loss incident.
3. Search is ILIKE-only — word-order sensitive, unindexed, no typo tolerance.
4. Sitemap generation is unpaginated — a scale cliff, not a gradual degradation.
5. No structured data beyond a sitewide Organization schema — missed SEO surface area.
6. Option type is inferred from value shape at multiple call sites rather than declared once.
7. `subcategory2`/level-2 taxonomy exists in the DB but has no storefront UI — half-shipped feature.
8. Variant-specs propagation is duplicated across import clone sites rather than centralized.
9. No roles/permissions in the CMS (acceptable now, will need addressing if the team grows).
10. No generated database types (`types.ts` is hand-maintained) — a drift risk as the schema grows, though currently manageable.

**Biggest architectural risk:** the missing `product_type` scoping on the shared `options` table — it's not hypothetical, it already broke production data once (the in-flight `restore_leg_color.sql` recovery is direct proof) and will recur with any future bulk option cleanup.

**Biggest scalability risk:** the unpaginated sitemap combined with unindexed ILIKE search — both are fine today, both have a specific, identifiable breaking point well before 100k products, and both already have a known fix named in the codebase's own comments.

**Biggest opportunity:** converting the category/subcategory system to a proper FK-enforced hierarchy. It's the one piece of the schema that doesn't match the discipline applied everywhere else, it's a bounded, well-scoped migration (not a rewrite), and it removes the single largest source of "silent data corruption on rename" risk in the whole system.

**Overall architecture score: 7/10** — a disciplined, appropriately-scoped codebase for its current size, with one clear structural debt (category FK model + product-type dimension) worth fixing proactively rather than after the next scale jump, and no evidence of the more common failure mode (over-engineering) that reviews like this usually have to unwind.
