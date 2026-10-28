"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from '@/components/ui/OptimizedImage';
import { CatalogProductDetails, VariationImage, MOCK_PRODUCT_IMAGES } from '@/lib';
import { CF_IMAGE_WIDTH_CARD } from '@/lib/utils';
// Pure helper, no server imports — the same source of truth the dedup itself uses.
import { isVisualOption } from '@/lib/supabase/imageGroups';
import { trackEvent } from '@/lib/analytics/umami';

// ponytail: different furniture is photographed with a different margin around it — hence the card
// uses a different zoom instead of one value for every catalog.
const IMAGE_SCALE_BY_CATALOG: Record<string, string> = {
  "Ліжка": "scale-115",
  "Тумби": "scale-130",
  "Комоди": "scale-125",
};

export default function ProductCard({
  product,
  selectedColors = [],
  priceMin,
  priceMax,
  initialIndex = 0,
}: {
  product: CatalogProductDetails;
  selectedColors?: string[];
  // The applied price filter (catalog.ts filters by the same range across ALL of a product's variants) —
  // the card should show a variation that's actually within range, not always its cheapest.
  priceMin?: number;
  priceMax?: number;
  initialIndex?: number;
}) {
  // selectedColors — a flat list of full option names ("Вісь: Значення") from all the selected
  // axes at once; we group them back by axis to require a match in EACH one (AND between axes, OR
  // inside one) — exactly as the catalog itself filters (catalog.ts).
  //
  // Only the VISUAL axes take part: the variations the card is given are deduped by imageGroupKey,
  // which deliberately ignores Розмір / Відстань між ламелями (they don't change the photo), so each
  // variation carries one arbitrary size. Requiring a match on such an axis could never succeed —
  // the card then found no matching variation and fell back to its default, showing e.g. a beige bed
  // while "Колір: Рожевий" was selected. The colour axis alone decides which photo to show.
  const selectedGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const label of selectedColors) {
      if (!isVisualOption(label)) continue;
      const axis = label.split(":")[0]?.trim() || label;
      (groups.get(axis) ?? groups.set(axis, []).get(axis)!).push(label);
    }
    return [...groups.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColors]);

  // Price range check — the effective (sale-aware) price, the same one the catalog filter itself uses
  // (variantPricing in lib/supabase/variantRules.ts) and the one the card displays and the cart charges.
  const hasPriceFilter = priceMin != null || priceMax != null;
  const matchesPrice = (variation: VariationImage) => {
    if (!hasPriceFilter) return true;
    const price = Number(variation.discountedPrice || variation.price || 0);
    if (priceMin != null && price < priceMin) return false;
    if (priceMax != null && price > priceMax) return false;
    return true;
  };

  // Whether a variant matches every selected filter axis (at least one value in each) AND the price range.
  const anyFilterActive = selectedGroups.length > 0 || hasPriceFilter;
  const matchesFilter = (variation: VariationImage) =>
    anyFilterActive &&
    (selectedGroups.length === 0 || selectedGroups.every((values) => (variation.allHexes ?? []).some((h) => values.includes(h.name)))) &&
    matchesPrice(variation);

  // Colour (hex) options only — material ones (Масив/Щит) are rendered as a string, not as a colour.
  const isHex = (v: string) => /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((v || "").trim());
  // ponytail: the swatch gradient is drawn hexes[0]→hexes[1], and the option order from the DB isn't guaranteed —
  // so the legs always come second: otherwise the diagonal in neighbouring cards points in different directions.
  const colorHexesOf = (variation: VariationImage) =>
    (variation.allHexes ?? [])
      .filter((h) => isHex(h.hex))
      .sort((a, b) => Number(a.name.startsWith("Колір ніжок")) - Number(b.name.startsWith("Колір ніжок")));

  // The variant order is set in the admin panel (a linked array on the product) — we leave it as it is.
  // If a colour filter is applied — we move the variants matching it to the front,
  // so the selected colours are visible on the card right away (Array.sort in V8 is stable).
  const variations = useMemo(() => {
    const base = product.variations || [];
    if (!anyFilterActive) return base;
    return [...base].sort((a, b) => Number(matchesFilter(b)) - Number(matchesFilter(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.variations, selectedColors, priceMin, priceMax]);

  // Swatches — unique colours only: variants without a colour (material only) are skipped,
  // and the same colour in different materials (Масив/Щит) is collapsed into one circle.
  const colorVariations = useMemo(() => {
    const seen = new Set<string>();
    const out: VariationImage[] = [];
    for (const v of variations) {
      const hexes = colorHexesOf(v);
      if (hexes.length === 0) continue;
      const key = hexes.map((h) => h.hex).join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variations]);

  // 4 colours spread evenly across the whole array (rather than the first few in a row) — in the DB the variants go
  // grouped by tabletop colour (each tabletop colour for several leg colours in a row),
  // so "the first 4" always landed in one tabletop colour, and the card looked as if the
  // tabletop is always grey and only the legs differ. Then rotate so the initialIndex-th swatch is first.
  // With an active filter we don't rotate — otherwise it would push the already sorted
  // (in variations) matching colours off the first place.
  const swatchesToShow = useMemo(() => {
    if (colorVariations.length === 0) return [];
    const step = Math.max(1, Math.floor(colorVariations.length / 4));
    const base = Array.from({ length: Math.min(4, colorVariations.length) }, (_, i) => colorVariations[i * step]);
    if (initialIndex === 0 || anyFilterActive) return base;
    const pivot = initialIndex % base.length;
    return [...base.slice(pivot), ...base.slice(0, pivot)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorVariations, initialIndex, anyFilterActive]);

  // State to track which color variation the user is currently looking at —
  // by default we show the first variant matching the filter (if there is one),
  // otherwise — the first one visible on the card (the first circle).
  const [activeVariation, setActiveVariation] = useState<VariationImage | undefined>(
    variations.find(matchesFilter) ?? swatchesToShow[0] ?? variations[0]
  );

  // When the filter changes (and the product stays in the list) — we switch the active
  // variant to the one matching the selected colours.
  useEffect(() => {
    if (!anyFilterActive) return;
    const matched = variations.find(matchesFilter);
    if (matched) setActiveVariation(matched);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColors, priceMin, priceMax]);

  // Safely extract the images for the *currently active* variation.
  // If there are no photos at all — we show temporary mock images.
  // The cards show the compressed versions (lighter, straight from R2); with a fallback to the originals/mocks.
  const cardImages = activeVariation?.imagesCompressed ?? activeVariation?.images;
  const primaryImage = cardImages?.[0] || MOCK_PRODUCT_IMAGES[0];
  // The second photo for hover — only if it really exists (otherwise we don't substitute a mock).
  const hasSecondary = (cardImages?.length ?? 0) > 1;
  const secondaryImage = cardImages?.[1] || primaryImage;
  const scaleClass = (product.catalog && IMAGE_SCALE_BY_CATALOG[product.catalog]) || "";

  // The active variation's own price/sale, falling back to the product's minimum price when
  // the variation carries none (e.g. older cached entries built before discountedPrice existed).
  const displayPrice = Number(activeVariation?.price || 0) || product.price;
  const salePrice = activeVariation?.discountedPrice ? Number(activeVariation.discountedPrice) : null;

  // Leads to exactly the variant shown on the card (picked by the filter or by hovering) —
  // otherwise the product page would always open the first, default variant.
  const href = activeVariation ? `${product.href}?variant=${activeVariation.id}` : product.href;

  // Helper to render single or split-color circles
  const getSwatchStyle = (variation: VariationImage) => {
    const hexes = colorHexesOf(variation);
    if (hexes.length >= 2) {
      // Changing 50% to 49.5% and 50.5% fixes the jagged pixelated line!
      return { background: `linear-gradient(135deg, ${hexes[0].hex} 49.5%, ${hexes[1].hex} 50.5%)` };
    }
    return { backgroundColor: hexes[0]?.hex || '#CCCCCC' };
  };

  return (
    <div className="shrink-0 w-full cursor-pointer">

      {/* Product Link Area (Image + Text) */}
      <Link
        href={href}
        className="block w-full cursor-pointer group"
        onClick={() => trackEvent("Клік по товару", { name: product.name, href: product.href })}
      >
        {/* Image Container with Hover Crossfade */}
        <div className="relative w-full aspect-square overflow-hidden mb-4 rounded-sm shadow-sm bg-white transition-shadow duration-300 group-hover:shadow-md">

          {/* Primary Image */}
          <Image
            src={primaryImage}
            alt={`${product.name} primary view`}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            cfWidth={CF_IMAGE_WIDTH_CARD}
            className={`absolute inset-0 object-contain w-full h-full ${scaleClass} transition-opacity duration-500 ease-in-out ${
              hasSecondary ? 'group-hover:opacity-0' : ''
            }`}
          />

          {/* Secondary Image (Revealed on hover) — only when there is a second photo */}
          {hasSecondary && (
            <Image
              src={secondaryImage}
              alt={`${product.name} alternate view`}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              cfWidth={CF_IMAGE_WIDTH_CARD}
              className={`absolute inset-0 object-contain w-full h-full ${scaleClass} transition-opacity duration-500 ease-in-out opacity-0 group-hover:opacity-100`}
            />
          )}
        </div>
      </Link>

      {/* Interactive Controls & Info Area */}
      <div className="flex flex-col">
        
        {/* Color Palette (Interactive) */}
        {colorVariations.length > 0 && (
          <div
            className="flex items-center gap-3 mb-3 h-6"
            onClick={(e) => e.preventDefault()}
          >
            {swatchesToShow.map((variation) => {
              const isActive = activeVariation?.id === variation.id;
              const isMatch = matchesFilter(variation);
              return (
                <button
                  key={variation.id}
                  onMouseEnter={() => setActiveVariation(variation)}
                  onClick={() => {
                    setActiveVariation(variation);
                    trackEvent("Вибір кольору", {
                      product: product.name,
                      color: colorHexesOf(variation).map((h) => h.name).join(" / "),
                    });
                  }}
                  className={`rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 ${
                    isActive
                      ? 'scale-110 ring-1 ring-opora-brown ring-offset-2'
                      : isMatch
                        ? 'ring-1 ring-opora-brown/50 ring-offset-2 hover:scale-110'
                        : 'hover:scale-110'
                  }`}
                  aria-label={`Переглянути колір: ${colorHexesOf(variation).map((h) => h.name).join(' / ')}`}
                >
                  <span
                    className="block w-6 h-6 rounded-full overflow-hidden shadow-sm border border-opora-softBeige"
                    style={getSwatchStyle(variation)}
                  />
                </button>
              );
            })}
            {colorVariations.length > 4 && (
              <span className="text-sm text-opora-brown/80 font-light ml-1">
                +{colorVariations.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Product Text Details */}
        <Link
          href={href}
          className="block"
          onClick={() => trackEvent("Клік по товару", { name: product.name, href: product.href })}
        >
          <h3 className="text-xl md:text-2xl font-medium text-opora-brown mb-1">
            {product.name}
          </h3>
          <p className="flex items-center gap-2 text-lg md:text-xl font-light text-opora-brown/80">
            {displayPrice > 0 ? (
              <>
                {salePrice && <span className="text-base text-opora-brown/40 line-through">{displayPrice.toLocaleString('uk-UA')} ₴</span>}
                <span className={salePrice ? 'text-red-600' : undefined}>
                  {(salePrice ?? displayPrice).toLocaleString('uk-UA')} ₴
                </span>
              </>
            ) : (
              'Ціну уточнюйте'
            )}
          </p>
        </Link>
      </div>
    </div>
  );
}