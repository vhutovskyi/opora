// src/app/catalog/[slug]/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getComments, getOptionGroupInfo, getProductById } from "@/lib/supabase";
import { productHref, productRef } from "@/lib/utils";
import { model3dFor } from "@/lib/models3d";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, RETURN_POLICY } from "@/lib/site";
import JsonLd from "@/components/seo/JsonLd";
import ProductDetailClient from "./components/ProductDetailClient";
import { toCardVariations, toClientProduct, variantMedia } from "./clientProduct";

export const revalidate = 3600;

// Per-product metadata for search and sharing. getProductById is wrapped in React cache(),
// so the same call in generateMetadata and in the page = one request to Airtable.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductById(slug);

  if (!product) return { title: "Товар не знайдено" };

  const title = product.model || product.name;
  const price = product.minPrice || product.variants?.[0]?.price || 0;
  // "3 340 ₴" — we split the thousands with a space, as on the product page.
  const priceLabel = price
    ? `${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₴`
    : "";
  // In the link preview: OPORA (siteName) / Шухляда (title) / <опис>… (description).
  const shortDescription = (product.description || "").trim();
  const description = shortDescription
    ? shortDescription.length > 160
      ? `${shortDescription.slice(0, 159)}…`
      : shortDescription
    : priceLabel
      ? `Від ${priceLabel}`
      : title;
  const image = product.variants?.[0]?.images?.[0] || DEFAULT_OG_IMAGE;

  // The manual SEO fields from the admin panel (product_seo.sql) take priority over the generated ones.
  // The title is absolute: if it was written by hand, the "%s | OPORA" template from layout.tsx
  // must not append anything extra, because a SERP shows ~60 characters.
  const seoTitle = product.seoTitle.trim();
  const seoDescription = product.seoDescription.trim() || description;
  // The canonical address is the slug whenever one is set: /catalog/<uuid> and /catalog/Vega
  // lead to the same page, so Google has to see one of them as the primary one.
  const url = productHref(product);

  return {
    title: seoTitle ? { absolute: seoTitle } : title,
    description: seoDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: seoTitle || title,
      description: seoDescription,
      url,
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle || title,
      description: seoDescription,
      images: [image],
    },
  };
}

// Server Component: fetches the product on the server and passes it to the
// interactive client component (same pattern as TopProducts).
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const { variant: variantParam } = await searchParams;
  const [product, optionGroupInfo] = await Promise.all([getProductById(slug), getOptionGroupInfo()]);

  if (!product) notFound();

  // The catalog links here with ?variant=<id> — the variant already shown on the card.
  // We send exactly its photos straight away, so the client doesn't have to load them and flicker.
  const requestedVariantId = typeof variantParam === "string" ? variantParam : undefined;
  const initialVariant = product.variants.find((v) => v.id === requestedVariantId) ?? product.variants[0];

  const title = product.model || product.name;
  const inStock = product.variants?.some((v) => v.inStock) ?? false;

  // Same lookup key Reviews.tsx uses (ProductDetailClient passes product.model || product.name
  // as `variation`), so this matches the reviews actually shown on the page.
  const comments = await getComments(title);
  const aggregateRating = comments.length
    ? {
        "@type": "AggregateRating",
        ratingValue: (comments.reduce((sum, c) => sum + c.rating, 0) / comments.length).toFixed(1),
        reviewCount: comments.length,
      }
    : undefined;
  const review = comments.length
    ? comments.slice(0, 10).map((c) => ({
        "@type": "Review",
        author: { "@type": "Person", name: c.authorName || "Клієнт OPORA" },
        datePublished: c.createdAt?.slice(0, 10),
        reviewBody: c.text,
        reviewRating: { "@type": "Rating", ratingValue: c.rating },
      }))
    : undefined;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    description: product.description || undefined,
    image: product.variants?.flatMap((v) => v.images).filter(Boolean).slice(0, 6),
    sku: product.variants?.[0]?.sku || undefined,
    brand: { "@type": "Brand", name: SITE_NAME },
    aggregateRating,
    review,
    offers: {
      "@type": "Offer",
      price: product.minPrice || product.variants?.[0]?.price || 0,
      priceCurrency: "UAH",
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${SITE_URL}${productHref(product)}`,
      // Nova Poshta / Delivery Auto collect the fee from the customer directly on delivery —
      // OPORA doesn't charge for shipping, so the rate here is genuinely 0.
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "UAH" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "UA" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 5, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        returnPolicyCategory: `https://schema.org/${RETURN_POLICY.category}`,
        applicableCountry: RETURN_POLICY.countryCode,
      },
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE_URL}/catalog` },
      { "@type": "ListItem", position: 3, name: title, item: `${SITE_URL}${productHref(product)}` },
    ],
  };

  return (
    <>
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {/* The media of the active variant only; the rest — through api/products/variant/[id]. */}
      {/* Suspense: ProductDetailClient reads ?variant= through useSearchParams. */}
      <Suspense fallback={null}>
        <ProductDetailClient
          product={toClientProduct(product)}
          initialMedia={
            initialVariant ? variantMedia(initialVariant) : { images: [], imagesCompressed: [], specifications: [] }
          }
          cardVariations={toCardVariations(product)}
          optionGroupInfo={optionGroupInfo}
          model3d={model3dFor(productRef(product), process.env.R2_PUBLIC_DOMAIN)}
        />
      </Suspense>
    </>
  );
}
