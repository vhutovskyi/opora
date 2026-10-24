"use client";

import { useState, useRef, UIEvent, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useCartStore } from "@/store/cartStore";
import { MOCK_PRODUCT_IMAGES } from "@/lib/constants";
import { trackEvent } from "@/lib/analytics/umami";
import { BenefitBoxIcon, BenefitColorsIcon, BenefitShieldIcon } from "@/components/ui/Icons";
import Reviews from "@/components/blocks/Reviews";
import LongDescriptionRenderer from "@/components/longDescription/LongDescriptionRenderer";
import RecentlyViewed from "@/components/blocks/RecentlyViewed";
import { CatalogProductDetails } from "@/lib";
import { productHref } from "@/lib/utils";
import type { Model3D } from "@/lib/models3d";
import { accessoryComboKey, comboKeyIgnoringQty } from "@/lib/accessoryCombo";
import { imageGroupKey } from "@/lib/supabase/imageGroups";
import { Option, Product, Variant, VariantMedia, VariantSummary, optKind } from "./types";

import { findVariantForOption, getOptionGroups, isOptionAvailable as isOptionAvailableIn } from "./variantSelection";
import { useVariantMedia } from "../useVariantMedia";
import ProductGallery from "./ProductGallery";
import BuyBox from "./BuyBox";
import AssemblyVideo from "./AssemblyVideo";
import ProductAccordions from "./ProductAccordions";
import CartToast from "./CartToast";

// The fullscreen gallery is only needed after a click — split into its own chunk.
const FullscreenGallery = dynamic(() => import("./FullscreenGallery"), { ssr: false });
// The accessory modal — also only after a click.
const AccessoryModal = dynamic(() => import("./AccessoryModal"), { ssr: false });

// The axis an accessory mirrors onto the product itself when picked in the modal (see handleAccessoryApply).
const MIRRORED_AXIS = "Матеріал";

export default function ProductDetailClient({
  product,
  initialMedia,
  cardVariations,
  optionGroupInfo,
  model3d,
}: {
  product: Product;
  // Photos + specs of the first variant (the rest come from api/products/variant/[id]).
  initialMedia: VariantMedia;
  // Variants for the «Ви раніше переглядали» card (deduped on the server).
  cardVariations: CatalogProductDetails["variations"];
  // Markdown description per option axis (key = "Матеріал" etc.), set in the admin panel/filters.
  optionGroupInfo: Record<string, string>;
  // 3D/AR model when the product has one; the .usdz URL is built on the server (R2_PUBLIC_DOMAIN).
  model3d: Model3D | null;
}) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // The catalog links here with ?variant=<id> — the variant already shown on the card
  // (picked by filter/hover); with no param, the first variant is the default.
  // The server (page.tsx) returns initialMedia for that same variant by the same rule —
  // otherwise its photos would need a separate request and the swap would visibly flicker.
  const requestedVariantId = useSearchParams().get("variant");
  const initialVariant = product.variants?.find((v) => v.id === requestedVariantId) ?? product.variants?.[0] ?? null;
  const [activeVariant, setActiveVariant] = useState<VariantSummary | null>(initialVariant);

  const [qty, setQty] = useState(1);
  const addItemToCart = useCartStore((state) => state.addItem);
  const openCart = useCartStore((state) => state.openCart);

  const [openSections, setOpenSections] = useState(['desc']);
  const [toast, setToast] = useState<{ message: string; options: Option[] } | null>(null);

  // Selected accessories: linkId → variantId (null = not added).
  const [selectedAccessories, setSelectedAccessories] = useState<Record<string, string | null>>({});
  // Quantity per selected accessory (linkId → qty, defaults to 1).
  const [accessoryQty, setAccessoryQty] = useState<Record<string, number>>({});
  const [activeAccessoryModalId, setActiveAccessoryModalId] = useState<string | null>(null);

  // Gallery state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSlide, setFullscreenSlide] = useState(0);
  // Mount the gallery only after the first open (then keep it for the closing animation).
  const [galleryMounted, setGalleryMounted] = useState(false);

  // Whether the header is visible — lets the sticky block adjust its top offset (same logic as Header)
  const [headerVisible, setHeaderVisible] = useState(true);

  const fullscreenSliderRef = useRef<HTMLDivElement>(null);

  // Variant media: the initially active one arrives as a prop, the rest are fetched on option select.
  const { byId: mediaById, load: loadMedia } = useVariantMedia(initialVariant?.id, initialMedia);
  const activeMedia = activeVariant ? mediaById[activeVariant.id] : undefined;
  useEffect(() => {
    loadMedia(activeVariant?.id);
  }, [activeVariant?.id, loadMedia]);

  // Keep ?variant= in sync so the URL is always copyable for the currently shown variant.
  // replaceState (not push) — switching options shouldn't pile up back-button history.
  useEffect(() => {
    if (!activeVariant) return;
    const url = new URL(window.location.href);
    url.searchParams.set("variant", activeVariant.id);
    window.history.replaceState(null, "", url);
  }, [activeVariant]);

  // While the new variant's media is in flight, keep the previous photos on screen rather than an empty gallery.
  const [shownMedia, setShownMedia] = useState<VariantMedia>(initialMedia);
  useEffect(() => {
    if (activeMedia) setShownMedia(activeMedia);
  }, [activeMedia]);

  // The selected upgrade combination (e.g. «шухляди ЛДСП 102 + велика планка») has its own set of
  // bed photos — it REPLACES the variant's gallery. The accessory colour is not part of the key, so
  // changing colour leaves the gallery alone. With no matching set, the plain variant photos stay.
  const activeComboKey = accessoryComboKey(
    product.accessories.flatMap((link) => {
      const variant = link.product.variants.find((v) => v.id === selectedAccessories[link.id]);
      // Quantity is in the key too: 2 vs 4 drawers are different bed photos, not the same set.
      return variant
        ? [
            {
              accessoryProductId: link.product.id,
              qty: accessoryQty[link.id] ?? 1,
              comboAxis: link.product.comboAxis,
              options: variant.options,
            },
          ]
        : [];
    })
  );
  const activeGroupKey = imageGroupKey(activeVariant?.options.map((o) => o.name) ?? []);
  // Exact match (with quantity) → otherwise ignoring quantity: Аммі was only shot «з шухлядами», so
  // picking 2 drawers keeps those same photos instead of nothing. Where quantities were shot
  // separately (Нота Бене 1/2/4), the exact match wins.
  const comboMatch = activeComboKey
    ? product.accessoryComboPhotos.find(
        (c) => c.comboKey === activeComboKey && c.imageGroupKey === activeGroupKey
      ) ??
      product.accessoryComboPhotos.find(
        (c) =>
          c.imageGroupKey === activeGroupKey &&
          comboKeyIgnoringQty(c.comboKey) === comboKeyIgnoringQty(activeComboKey)
      )
    : undefined;

  // Originals — for the fullscreen gallery.
  const currentImages = comboMatch?.images.length
    ? comboMatch.images
    : shownMedia.images.length > 0
      ? shownMedia.images
      : [...MOCK_PRODUCT_IMAGES]; // Temporary mock images when there are no photos

  // Compressed versions — for the page itself (lighter, served straight from R2 with no Worker optimisation).
  // Falls back to originals/mocks when there are no compressed ones (older photos).
  const currentImagesCompressed = comboMatch?.images.length
    ? comboMatch.imagesCompressed
    : shownMedia.imagesCompressed.length > 0
      ? shownMedia.imagesCompressed
      : currentImages;

  // Reliable scroll sync for the fullscreen gallery
  useEffect(() => {
    if (isFullscreen && fullscreenSliderRef.current) {
      // Give the browser a moment to render the DOM before scrolling
      requestAnimationFrame(() => {
        if (fullscreenSliderRef.current) {
           fullscreenSliderRef.current.scrollLeft = fullscreenSliderRef.current.offsetWidth * fullscreenSlide;
        }
      });
    }
  }, [isFullscreen, fullscreenSlide]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;

      if (e.key === "ArrowRight" && fullscreenSlide < currentImages.length - 1) {
        scrollToFullscreenImage(fullscreenSlide + 1);
      } else if (e.key === "ArrowLeft" && fullscreenSlide > 0) {
        scrollToFullscreenImage(fullscreenSlide - 1);
      } else if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, fullscreenSlide, currentImages.length]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    // Cleanup on unmount (in case the user navigates to another page)
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isFullscreen]);

  // Track header visibility (as in Header): visible when scrolling up or near the top
  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const y = window.scrollY;
      setHeaderVisible(y < lastScrollY || y < 50);
      lastScrollY = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleWheelScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    const slider = fullscreenSliderRef.current;
    if (!slider) return;

    // If the user swipes horizontally (e.g. on a trackpad) the browser
    // handles it natively, so we do nothing.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    // Turn vertical mouse-wheel movement into horizontal scrolling
    slider.scrollLeft += e.deltaY;
  };

  const toggleAccordion = (section: string) => {
    setOpenSections((prevSections) =>
      prevSections.includes(section)
        ? prevSections.filter((item) => item !== section)
        : [...prevSections, section]
    );
  };

  const handleAddToCart = () => {
    if (!product || !activeVariant) return;

    const itemPayload = {
      id: activeVariant.id,
      productId: product.id,
      title: product.model || product.name,
      sku: activeVariant.sku,
      price: activeVariant.discountedPrice || activeVariant.price || product.minPrice,
      image: activeMedia?.images[0] || '/placeholder.png',
      quantity: qty,
      options: activeVariant.options.map((o) => ({ name: o.name, value: o.value })),
    };

    addItemToCart(itemPayload);

    // Selected accessories are added as separate line items (the accessory variant id is unique,
    // so they don't merge with the main product in the cart).
    for (const link of product.accessories) {
      const variantId = selectedAccessories[link.id];
      if (!variantId) continue;
      const accVariant = link.product.variants.find((v) => v.id === variantId);
      if (!accVariant) continue;
      addItemToCart({
        id: accVariant.id,
        productId: link.product.id,
        title: link.product.model,
        sku: accVariant.sku,
        price: accVariant.discountedPrice || accVariant.price || link.product.minPrice,
        image: accVariant.images[0] || '/placeholder.png',
        quantity: accessoryQty[link.id] ?? 1,
        options: accVariant.options.map((o) => ({ name: o.name, value: o.value })),
      });
    }

    openCart();
    trackEvent("Додано до кошика", {
      product: product.model || product.name,
      sku: activeVariant.sku,
      price: activeVariant.price || product.minPrice,
      qty,
    });
    setToast({ message: `Додано до кошика: ${product.model || product.name} (${qty} шт.)`, options: activeVariant.options });
    setTimeout(() => setToast(null), 3000);
  };

  // Open the full description: expand the «Опис» accordion and scroll to it
  const handleReadMore = () => {
    trackEvent("Читати більше", { product: product.model || product.name });
    setOpenSections((prev) => (prev.includes('desc') ? prev : [...prev, 'desc']));
    requestAnimationFrame(() => {
      document.getElementById('accordion-desc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Gallery logic
  const handleFullscreenScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!e.currentTarget) return;
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.offsetWidth;
    setFullscreenSlide(Math.round(scrollLeft / width));
  };

  const openGallery = (index: number) => {
    trackEvent("Відкрито галерею", { product: product.model || product.name, index });
    setFullscreenSlide(index);
    setGalleryMounted(true);
    setIsFullscreen(true);
  };

  const scrollToFullscreenImage = (index: number) => {
    setFullscreenSlide(index);
    if (fullscreenSliderRef.current) {
      fullscreenSliderRef.current.scrollTo({
        left: fullscreenSliderRef.current.offsetWidth * index,
        behavior: 'smooth'
      });
    }
  };

  const handleOptionSelect = (key: string, value: string) => {
    if (!product) return;
    const match = findVariantForOption(product.variants, activeVariant, key, value);
    if (match) {
      setActiveVariant(match);
      trackEvent("Вибір варіації", { product: product.model || product.name, value });
    }
  };

  // Hovering an option = a likely click: prefetch its photos so the swap looks instant.
  // Touchscreens have no hover — there the photos arrive after the tap.
  const handleOptionHover = (key: string, value: string) => {
    loadMedia(findVariantForOption(product.variants, activeVariant, key, value)?.id);
  };

  const isOptionAvailable = (key: string, value: string): boolean =>
    !!product && isOptionAvailableIn(product.variants, activeVariant, key, value);

  // The doubled swatch in BuyBox (colour + a Так/Ні axis, e.g. «З білими ніжками») has already
  // found the right variant among product.variants — here we just select it.
  const handleSelectVariant = (variantId: string) => {
    const match = product.variants.find((v) => v.id === variantId);
    if (!match) return;
    setActiveVariant(match);
    trackEvent("Вибір варіації", { product: product.model || product.name, sku: match.sku });
  };

  const handleHoverVariant = (variantId: string) => {
    loadMedia(variantId);
  };

  // Accessory checkbox: ticking picks a variant (unticking → null). The same accessory product may
  // be linked several times (e.g. «Планка безпеки універсальна» — one link for the small size, one
  // for the large), and the axis may hold more values than there are links: 70/80/130/140см across
  // 2 links. So each link gets its OWN size by splitting the sorted upgrade-axis values (comboAxis,
  // e.g. «Розмір») into as many buckets as there are links to this product and taking the smallest
  // value of the Nth bucket — not simply the Nth value (which would give link 2 80см instead of
  // 130см). Among the variants carrying that value, the cheapest wins.
  const handleAccessoryToggle = (linkId: string) => {
    const link = product.accessories.find((a) => a.id === linkId);
    if (!link) return;
    setSelectedAccessories((prev) => {
      const current = prev[linkId] ?? null;
      if (current !== null) return { ...prev, [linkId]: null };
      const sameProductLinks = product.accessories.filter((a) => a.product.id === link.product.id);
      const linkIndex = sameProductLinks.findIndex((a) => a.id === linkId);
      const axisKey = link.product.comboAxis;
      const pool = axisKey
        ? (() => {
            const axisValues = Array.from(
              new Set(
                link.product.variants
                  .map((v) => v.options.find((o) => optKind(o) === axisKey)?.value)
                  .filter((v): v is string => !!v)
              )
            ).sort((a, b) => parseFloat(a) - parseFloat(b));
            const groupSize = Math.max(1, Math.ceil(axisValues.length / sameProductLinks.length));
            const targetValue = axisValues[Math.min(linkIndex * groupSize, axisValues.length - 1)];
            return targetValue
              ? link.product.variants.filter((v) => v.options.some((o) => optKind(o) === axisKey && o.value === targetValue))
              : link.product.variants;
          })()
        : link.product.variants;
      const picked = pool.reduce<Variant | null>((min, v) => (!min || v.price < min.price ? v : min), null);
      return { ...prev, [linkId]: picked?.id ?? null };
    });
    setAccessoryQty((prev) => ({ ...prev, [linkId]: 1 }));
  };

  // From the modal: store the chosen accessory variant and its quantity, then close.
  const handleAccessoryApply = (linkId: string, variantId: string, qty: number) => {
    const link = product.accessories.find((a) => a.id === linkId);
    const max = link?.maxQty ?? 1;
    setSelectedAccessories((prev) => ({ ...prev, [linkId]: variantId }));
    setAccessoryQty((prev) => ({ ...prev, [linkId]: Math.min(Math.max(1, qty), max) }));
    setActiveAccessoryModalId(null);

    // The accessory's Матеріал drags the bed's along: the set is built in one wood, and the upgrade
    // photos were shot that way. Last pick wins, even if another accessory has a different material.
    // Deliberately ONLY this axis — colour must not move (a requirement), and the other axes
    // (Розмір «190см» vs «80x190») already come from different value sets on product vs accessory.
    const accVariant = link?.product.variants.find((v) => v.id === variantId);
    const material = accVariant?.options.find((o) => optKind(o) === MIRRORED_AXIS);
    if (material) {
      const match = findVariantForOption(product.variants, activeVariant, MIRRORED_AXIS, material.value);
      if (match) setActiveVariant(match);
    }
  };

  // The current product in catalog-card shape — for the «Ви раніше переглядали» section (localStorage)
  const recentlyViewedCurrent: CatalogProductDetails = {
    id: product.id,
    slug: product.slug,
    name: product.model || product.name,
    price: product.minPrice || product.variants?.[0]?.price || 0,
    href: productHref(product),
    variations: cardVariations,
    catalog: product.catalog,
  };

  return (
    <main className="min-h-screen bg-opora-white text-opora-brown">
      <div className="max-w-400 mx-auto px-4 lg:px-8 pt-24 md:pt-32 lg:pt-48 pb-6 md:pb-12 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-x-16 gap-y-12">

        {/* GALLERY — left column, top row (2-per-row square grid) */}
        <div className="order-1 lg:col-start-1 lg:row-start-1">
          <ProductGallery images={currentImagesCompressed} layout={product.galleryLayout} catalog={product.catalog} onImageClick={openGallery} />
        </div>

        {/* BUY BOX + VIDEO — right column, spans 2 rows, sticky inside */}
        <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div className={`lg:sticky transition-[top] duration-300 ease-in-out ${headerVisible ? 'lg:top-42' : 'lg:top-6'}`}>
            <BuyBox
              product={product}
              activeVariant={activeVariant}
              qty={qty}
              optionGroups={getOptionGroups(product.variants)}
              optionGroupInfo={optionGroupInfo}
              model3d={model3d}
              accessories={product.accessories}
              selectedAccessories={selectedAccessories}
              accessoryQty={accessoryQty}
              onQtyChange={setQty}
              onOptionSelect={handleOptionSelect}
              onOptionHover={handleOptionHover}
              isOptionAvailable={isOptionAvailable}
              onSelectVariant={handleSelectVariant}
              onHoverVariant={handleHoverVariant}
              onAccessoryToggle={handleAccessoryToggle}
              onOpenAccessoryModal={setActiveAccessoryModalId}
              onAddToCart={handleAddToCart}
              onReadMore={handleReadMore}
            />
            <AssemblyVideo
              videoUrl={product.assemblyVideoUrl}
              isPlaying={isVideoPlaying}
              onPlay={() => {
                setIsVideoPlaying(true);
                trackEvent("Відтворено відео", { product: product.model || product.name });
              }}
            />
            {/* No assembly video — fill the gap under the buy box with the guarantees. */}
            {!product.assemblyVideoUrl && (
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { icon: <BenefitBoxIcon className="w-7 h-7 stroke-current" />, title: "Доставка по всій Україні" },
                  { icon: <BenefitShieldIcon className="w-7 h-7 stroke-current" />, title: "Гарантія якості" },
                  { icon: <BenefitColorsIcon className="w-7 h-7 stroke-current" />, title: "Колір на будь-який смак" },
                ].map((b) => (
                  <div key={b.title} className="flex flex-col items-center justify-center text-center gap-2 p-4 rounded-xl bg-opora-softBeige/60 text-opora-brown">
                    <span className="shrink-0">{b.icon}</span>
                    <span className="text-sm font-medium leading-tight">{b.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ACCORDIONS — left column under the gallery */}
        <div className="order-3 lg:col-start-1 lg:row-start-2">
          <ProductAccordions
            product={product}
            specifications={shownMedia.specifications}
            openSections={openSections}
            onToggle={toggleAccordion}
          />
        </div>
      </div>

      {/* LONG DESCRIPTION — blocks composed in the admin panel, full width */}
      <LongDescriptionRenderer blocks={product.longDescription} />

      {/* REVIEWS — full width under the grid */}
      <Reviews variation={product.model || product.name} />

      {/* RECENTLY VIEWED — history from localStorage, under the reviews */}
      <RecentlyViewed current={recentlyViewedCurrent} />

      {galleryMounted && (
        <FullscreenGallery
          images={currentImages}
          isOpen={isFullscreen}
          activeSlide={fullscreenSlide}
          sliderRef={fullscreenSliderRef}
          onClose={() => setIsFullscreen(false)}
          onScroll={handleFullscreenScroll}
          onWheel={handleWheelScroll}
          onThumbClick={scrollToFullscreenImage}
        />
      )}

      {activeAccessoryModalId && (() => {
        const link = product.accessories.find((a) => a.id === activeAccessoryModalId);
        if (!link) return null;
        const selectedVariantId = selectedAccessories[link.id] ?? null;
        return (
          <AccessoryModal
            link={link}
            initialVariantId={selectedVariantId}
            initialQty={accessoryQty[link.id] ?? 1}
            isChecked={selectedVariantId !== null}
            onClose={() => setActiveAccessoryModalId(null)}
            onApply={(variantId, qty) => handleAccessoryApply(link.id, variantId, qty)}
          />
        );
      })()}

      {/* <CartToast toast={toast} onClose={() => setToast(null)} /> */}

    </main>
  );
}
